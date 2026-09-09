import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("deletes Gap evidence through HTTP and returns 404 on subsequent report and image GETs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-gap-http-"));
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, MONET_ROOT: directory, MONET_PORT: "0", MONET_AI_COMMAND: "", MONET_CODEX_EXECUTABLE: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("File service startup timed out")), 10000);
      let output = "";
      let stderr = "";
      child.stderr.on("data", (data) => { stderr += String(data); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", () => { clearTimeout(timeout); reject(new Error(`File service exited before startup: ${stderr}`)); });
      child.stdout.on("data", (data) => {
        output += String(data);
        const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (match) { clearTimeout(timeout); resolve(match[1]!); }
      });
    });
    const created = await fetch(`${url}/api/gaps`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      problem: "Private HTTP evidence",
      image: { filename: "screen.png", data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOm0AAAAASUVORK5CYII=" },
    }) });
    expect(created.status).toBe(201);
    const gap = await created.json() as { id: string };
    expect((await fetch(`${url}/api/gap-images/${gap.id}`)).status).toBe(200);
    expect((await fetch(`${url}/api/gaps/${gap.id}`, { method: "DELETE", headers: { origin: "https://example.com" } })).status).toBe(403);
    expect((await fetch(`${url}/api/gaps/${gap.id}`)).status).toBe(200);
    expect((await fetch(`${url}/api/gaps/${gap.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await fetch(`${url}/api/gaps/${gap.id}`)).status).toBe(404);
    expect((await fetch(`${url}/api/gap-images/${gap.id}`)).status).toBe(404);
    expect(await (await fetch(`${url}/api/gaps`)).json()).toEqual([]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
