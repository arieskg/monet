import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { ProfileLibrary, ProfileRegistration } from "../shared/profiles.js";

it("centralizes API security and binds delayed HTTP writes, assets and comparisons to explicit Profiles", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-profiles-http-")), root = path.join(directory, "original"); await mkdir(root);
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, MONET_ROOT: root, MONET_LIBRARY: path.join(directory, "library"), MONET_PORT: "0", MONET_AI_COMMAND: "", MONET_CODEX_EXECUTABLE: "" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let output = "", errors = ""; const timer = setTimeout(() => reject(new Error("Profile service timed out")), 15000);
      child.stderr.on("data", (data) => { errors += data; }); child.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
      child.stdout.on("data", (data) => { output += data; const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!); } });
    });
    const headers = { "content-type": "application/json" };
    const library = await (await fetch(url + "/api/profiles")).json() as ProfileLibrary, a = library.originalProfileId;
    const created = await fetch(url + "/api/profiles", { method: "POST", headers, body: JSON.stringify({ name: "B", kind: "scratch" }) }); expect(created.status).toBe(201);
    const b = (await created.json() as ProfileRegistration).identity.id;
    for (const route of ["/api/profiles", "/api/presets", "/api/presets/radix-product", `/api/profiles/${b}/preset-origin`, "/api/workspace", "/api/gaps", "/api/proposals", "/api/applications", "/api/reference-assets/same", `/api/profiles/${b}/workspace`]) {
      for (const origin of ["null", "https://evil.test", "http://127.0.0.1:59999", "http://localhost:43140"]) expect((await fetch(url + route, { headers: { origin } })).status).toBe(403);
      expect((await fetch(url + route, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
      const status = await new Promise<number | undefined>((resolve, reject) => { const req = httpRequest(url + route, { headers: { host: "attacker.test" } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); }); req.on("error", reject); req.end(); }); expect(status).toBe(403);
    }
    for (const route of ["/api/profiles", "/api/gaps", "/api/proposals", "/api/proposal-applications/same", "/api/principles/same", "/api/profile-names/" + a]) {
      expect((await fetch(url + route, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })).status).toBe(415);
    }
    expect((await fetch(`${url}/api/profiles/${b}/workspace`, { headers: { "x-monet-profile": a } })).status).toBe(409);
    expect((await fetch(`${url}/api/profiles/not-a-profile/workspace`)).status).toBe(404);
    const principle = (title: string) => JSON.stringify({ id: "same", title, body: "# " + title, order: 0, updated_at: "" });
    const pendingBody = principle("Only A");
    let finish!: () => void;
    const delayed = new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(`${url}/api/profiles/${a}/principles/same`, { method: "PUT", headers: { ...headers, "content-length": Buffer.byteLength(pendingBody), "x-monet-profile": a } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject); req.write(pendingBody.slice(0, 10)); finish = () => req.end(pendingBody.slice(10));
    });
    expect((await fetch(`${url}/api/profiles/${b}/principles/same`, { method: "PUT", headers, body: principle("Only B") })).status).toBe(200);
    finish(); expect(await delayed).toBe(200);
    const first = await (await fetch(`${url}/api/profiles/${a}/workspace`)).text(), second = await (await fetch(`${url}/api/profiles/${b}/workspace`)).text();
    expect(first).toContain("Only A"); expect(first).not.toContain("Only B"); expect(second).toContain("Only B"); expect(second).not.toContain("Only A");
    expect(await (await fetch(`${url}/api/workspace`)).text()).toContain("Only A");
    const gap = await (await fetch(`${url}/api/profiles/${a}/gaps`, { method: "POST", headers, body: JSON.stringify({ problem: "Private A" }) })).json() as { id: string; profile_id: string };
    expect(gap.profile_id).toBe(a); expect((await fetch(`${url}/api/profiles/${b}/gaps/${gap.id}`)).status).toBe(404);
    expect((await fetch(`${url}/api/profiles/${b}/surface-previews`, { method: "POST", headers, body: JSON.stringify({ input: { title: "Mismatch", html: "<p>Only B</p>" }, selection: { profile_id: a } }) })).status).toBe(409);
    expect((await fetch(`${url}/api/profiles/${b}/surface-previews`, { method: "POST", headers, body: JSON.stringify({ input: { title: "Mismatch", html: "<p>Only B</p>" }, selection: { project: { project_id: a, binding_revision: 1 } } }) })).status).toBe(409);
    const renamed = await fetch(`${url}/api/profile-names/${b}`, { method: "PUT", headers, body: JSON.stringify({ name: "Renamed B" }) }); expect(renamed.status).toBe(200);
    expect((await (await fetch(`${url}/api/profiles/${b}/environment`)).text())).toContain("Renamed B");
  } finally { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } await rm(directory, { recursive: true, force: true }); }
}, 30000);
