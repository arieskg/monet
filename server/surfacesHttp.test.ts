import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("guards Surface HTTP imports, mutations, revisions and deletion with local-origin and JSON boundaries", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-surface-http-"));
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, MONET_ROOT: directory, MONET_LIBRARY: path.join(directory, "../" + path.basename(directory) + "-library"), MONET_PORT: "0", MONET_AI_COMMAND: "" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Surface service timed out")), 10000); let output = "", stderr = "";
      child.stderr.on("data", (data) => { stderr += String(data); });
      child.on("error", (e) => { clearTimeout(timeout); reject(e); });
      child.on("exit", () => { clearTimeout(timeout); reject(new Error(stderr)); });
      child.stdout.on("data", (data) => { output += String(data); const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output); if (match) { clearTimeout(timeout); resolve(match[1]!); } });
    });
    const body = JSON.stringify({ input: { title: "HTTP snapshot", html: '<h1 style="color:red">Hello</h1><script>fetch("/api/gaps")</script>' } });
    const post = (headers: Record<string, string>, payload = body, route = "/api/surfaces") => fetch(url + route, { method: "POST", headers, body: payload });
    for (const origin of ["null", "https://evil.test", "http://127.0.0.1:9876", "http://localhost:9999"]) expect((await post({ origin, "content-type": "application/json" })).status).toBe(403);
    // fetch rewrites Host; use the HTTP transport to actually exercise DNS-rebinding protection.
    const forgedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(url + "/api/surfaces", { method: "POST", headers: { host: "evil.test", "content-type": "application/json" } }, (response) => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
      req.on("error", reject); req.end(body);
    });
    expect(forgedHostStatus).toBe(403);
    expect((await post({ "sec-fetch-site": "cross-site", "content-type": "application/json" })).status).toBe(403);
    expect((await post({ "content-type": "text/plain" })).status).toBe(415);
    expect((await post({ "content-type": "application/json" }, "{")).status).toBe(400);
    expect((await post({ "content-type": "application/json" }, '{"input":{}}')).status).toBe(400);
    const created = await post({ "content-type": "application/json", origin: "http://127.0.0.1:43140" }); expect(created.status).toBe(201);
    expect(created.headers.get("content-type")).toContain("application/json"); expect(created.headers.get("cache-control")).toBe("no-store");
    const result = await created.json() as { saved: { id: string }; original: string }; const id = result.saved.id;
    expect(result.original).not.toContain("<script>");
    expect((await fetch(`${url}/api/surfaces/${id}?revision=NaN`)).status).toBe(400);
    expect((await fetch(`${url}/api/surfaces/${id}?revision=2`)).status).toBe(404);
    expect((await post({ "content-type": "application/json" }, JSON.stringify({ expected_revision: 2, selection: {} }), `/api/surface-revisions/${id}`)).status).toBe(409);
    expect((await fetch(`${url}/api/surfaces/${id}`, { method: "DELETE", headers: { origin: "null", "content-type": "application/json" } })).status).toBe(403);
    expect((await fetch(`${url}/api/surfaces/${id}`, { method: "DELETE", headers: { "content-type": "application/json" } })).status).toBe(200);
    expect((await fetch(`${url}/api/surfaces/${id}`)).status).toBe(404);
    expect(await (await fetch(`${url}/api/surfaces`)).json()).toEqual([]);
  } finally { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } await rm(directory, { recursive: true, force: true }); }
}, 20000);
