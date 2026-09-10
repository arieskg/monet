import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("guards project connection, discovery, capture and folder browsing with the shared API boundary", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-project-http-"));
  const project = path.join(directory, "site"); await mkdir(project, { recursive: true }); await writeFile(path.join(project, "index.html"), "<h1>Hello</h1>");
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, MONET_ROOT: path.join(directory, "workspace"), MONET_LIBRARY: path.join(directory, "library"), MONET_PORT: "0", MONET_AI_COMMAND: "", MONET_CAPTURE_BROWSER: "" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Project service timed out")), 10000); let output = "", stderr = "";
      child.stderr.on("data", (data) => { stderr += String(data); });
      child.on("error", (e) => { clearTimeout(timeout); reject(e); });
      child.on("exit", () => { clearTimeout(timeout); reject(new Error(stderr)); });
      child.stdout.on("data", (data) => { output += String(data); const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output); if (match) { clearTimeout(timeout); resolve(match[1]!); } });
    });
    const json = { "content-type": "application/json" };
    const post = (route: string, payload: unknown, headers: Record<string, string> = json) => fetch(url + route, { method: "POST", headers, body: JSON.stringify(payload) });
    for (const origin of ["null", "https://evil.test", "http://127.0.0.1:9876"]) {
      expect((await post("/api/projects", { root: project }, { ...json, origin })).status).toBe(403);
      expect((await fetch(`${url}/api/directories?path=${encodeURIComponent(directory)}`, { headers: { origin } })).status).toBe(403);
    }
    expect((await post("/api/projects", { root: project }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("/api/projects", { root: "relative" })).status).toBe(400);
    expect((await post("/api/projects", { root: path.join(directory, "library") })).status).toBe(409);
    expect((await post("/api/projects", { root: project, extra: true })).status).toBe(400);
    const listing = await (await fetch(`${url}/api/directories?path=${encodeURIComponent(directory)}`)).json() as { entries: { name: string }[] };
    expect(listing.entries.map((e) => e.name)).toContain("site"); expect(listing.entries.map((e) => e.name)).not.toContain("index.html");
    expect((await fetch(`${url}/api/directories?path=${encodeURIComponent(path.join(directory, "nope"))}`)).status).toBe(400);
    expect((await fetch(`${url}/api/directories?path=${encodeURIComponent(path.join(project, "index.html"))}`)).status).toBe(400);
    const created = await post("/api/projects", { root: project }, { ...json, origin: "http://127.0.0.1:43140" }); expect(created.status).toBe(201);
    const record = await created.json() as { id: string; inventory: { kind: string; screens: { id: string }[] } };
    expect(record.inventory.kind).toBe("static"); expect(created.headers.get("cache-control")).toBe("no-store");
    const screen = record.inventory.screens[0]!.id;
    expect((await post(`/api/project-captures/${record.id}`, { screen_id: screen, source: { kind: "dev_server", base_url: "http://evil.test:3000" } })).status).toBe(400);
    expect((await post(`/api/project-captures/${record.id}`, { screen_id: screen, route: "/x/:id", source: { kind: "static", directory: "" } })).status).toBe(400);
    expect((await post(`/api/project-captures/${record.id}`, { screen_id: screen, source: { kind: "static", directory: "../" } })).status).toBe(400);
    expect((await post(`/api/project-connections/${record.id}`, { base_url: "http://127.0.0.1:1" })).status).toBe(200);
    expect((await post(`/api/project-screen-finders/${record.id}`, { query: "hello", ai: true })).status).toBe(200);
    expect(((await (await post(`/api/project-screen-finders/${record.id}`, { query: "hello", ai: true })).json()) as { ai: { status: string } }).ai.status).toBe("unavailable");
    expect((await post(`/api/project-interpretations/${record.id}`, {})).status).toBe(400);
    expect((await fetch(`${url}/api/projects/${record.id}`)).status).toBe(200);
    // Another Profile has no view of this Project.
    const other = await (await post("/api/profiles", { name: "Other", kind: "scratch" })).json() as { identity: { id: string } };
    expect((await fetch(`${url}/api/profiles/${other.identity.id}/projects/${record.id}`)).status).toBe(404);
    expect(await (await fetch(`${url}/api/profiles/${other.identity.id}/projects`)).json()).toEqual([]);
    expect((await fetch(`${url}/api/projects/${record.id}`, { method: "DELETE", headers: { ...json, origin: "null" } })).status).toBe(403);
    expect((await fetch(`${url}/api/projects/${record.id}`, { method: "DELETE", headers: json })).status).toBe(200);
    expect((await fetch(`${url}/api/projects/${record.id}`)).status).toBe(404);
  } finally { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } await rm(directory, { recursive: true, force: true }); }
}, 25000);
