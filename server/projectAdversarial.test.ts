import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProject } from "./projectDiscovery.js";
import { startStaticServer } from "./projectStatic.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const roots: string[] = [];
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "monet-adversarial-")); roots.push(dir);
  const root = path.join(dir, "app"); await mkdir(root);
  await writeFile(path.join(root, "index.html"), "<h1>Application</h1>");
  return { dir, root };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

it("discovery does not follow configuration symlinks or read hard-linked source", async () => {
  const { dir, root } = await fixture();
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { vite: "*" } }));
  await writeFile(path.join(dir, "secret"), 'port: 45678; <h1>Private outside source</h1>');
  await symlink(path.join(dir, "secret"), path.join(root, "vite.config.ts"));
  await link(path.join(dir, "secret"), path.join(root, "private.html"));
  const inventory = await scanProject(root);
  expect(inventory.default_port).toBe(5173);
  expect(inventory.screens.flatMap((s) => s.hints)).not.toContain("Private outside source");
});

it("quotes shell metacharacters in the suggested start command without executing them", async () => {
  const { root } = await fixture();
  const strange = path.join(root, "app'$(echo INJECTED)`echo ALSO_INJECTED`");
  await mkdir(strange); await writeFile(path.join(strange, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
  const inventory = await scanProject(strange);
  const command = inventory.dev_command!.replace(/ && npm run dev$/, " && pwd -P");
  const { stdout } = await promisify(execFile)("/bin/sh", ["-c", command]);
  expect(stdout.trim()).toBe(await import("node:fs/promises").then((fs) => fs.realpath(strange)));
});

it("static serving refuses internal symlink aliases to secrets, hard links and generated dependencies", async () => {
  const { dir, root } = await fixture();
  await writeFile(path.join(root, ".env"), "PRIVATE_SECRET");
  await symlink(path.join(root, ".env"), path.join(root, "alias.txt"));
  await writeFile(path.join(dir, "outside"), "OUTSIDE_SECRET");
  await link(path.join(dir, "outside"), path.join(root, "linked.txt"));
  await mkdir(path.join(root, "node_modules")); await writeFile(path.join(root, "node_modules", "private.txt"), "DEPENDENCY");
  const server = await startStaticServer(root, "");
  try {
    for (const file of ["alias.txt", "linked.txt", "node_modules/private.txt", "%00", "%ZZ", "%2eenv"]) {
      expect((await fetch(`${server.origin}/${file}`)).status, file).toBe(404);
    }
  } finally { await server.close(); }
});
