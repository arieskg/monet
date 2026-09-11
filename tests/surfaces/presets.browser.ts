import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { ProfileLibrary, ProfileRegistration } from "../../shared/profiles";
import type { Workspace } from "../../shared/model";
import type { ProjectOnboardingResult } from "../../shared/projectOnboarding";

let directory: string, project: string, service: ChildProcess, vite: ViteDevServer, apiUrl: string;
const editor = "http://127.0.0.1:43151";
test.use({ viewport: { width: 1560, height: 1100 } });
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-preset-browser-")); project = path.join(directory, "project");
  await mkdir(project); await writeFile(path.join(project, "index.html"), "<html><head><title>Preset project</title></head><body><label>Name<input></label><button>Continue</button></body></html>");
  service = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: path.resolve(import.meta.dirname, "../.."), env: { ...process.env, MONET_ROOT: path.join(directory, "workspace"), MONET_LIBRARY: path.join(directory, "library"), MONET_PORT: "0", MONET_EDITOR_ORIGIN: editor, MONET_AI_COMMAND: "" }, stdio: ["ignore", "pipe", "pipe"] });
  apiUrl = await new Promise<string>((resolve, reject) => {
    let output = "", errors = ""; const timer = setTimeout(() => reject(new Error("Service timed out")), 15000);
    service.stderr!.on("data", (data) => { errors += data; }); service.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
    service.stdout!.on("data", (data) => { output += data; const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!); } });
  });
  vite = await createServer({ configFile: false, root: path.resolve(import.meta.dirname, "../.."), plugins: [react()], server: { host: "127.0.0.1", port: 43151, strictPort: true, proxy: { "/api": apiUrl } } }); await vite.listen();
});
test.afterAll(async () => { await vite?.close(); if (service?.exitCode === null) { service.kill("SIGTERM"); await once(service, "exit"); } await rm(directory, { recursive: true, force: true }); });

for (const [id, name, dark] of [["radix-product", "Radix Product", true], ["carbon-product", "Carbon Product", true], ["uswds-public-service", "USWDS Public Service", false]] as const) {
  test(`inspects and creates ${name}, with Profile-bound context and retained licenses`, async ({ page, request }) => {
    await page.goto(editor);
    await page.getByRole("button", { name: "New profile", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create independent profile" });
    await dialog.getByLabel("Name", { exact: true }).fill(name + " browser");
    await dialog.getByLabel("Start with", { exact: true }).selectOption("preset");
    await expect(dialog.getByRole("button", { name: "Create profile", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: new RegExp('^' + name) }).click();
    const preview = dialog.getByRole("region", { name: name + " preview" });
    await expect(preview).toContainText("5 component decisions");
    const light = await preview.locator(".preset-sample").evaluate((el) => getComputedStyle(el).backgroundColor);
    if (dark) {
      await preview.getByLabel("Preview mode").selectOption("dark");
      expect(await preview.locator(".preset-sample").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(light);
    } else await expect(preview.getByLabel("Preview mode").locator("option")).toHaveCount(1);
    await preview.getByText("Sources and license notices", { exact: true }).click();
    await expect(preview).toContainText("Independent, unofficial");
    await preview.getByText("Included decisions and guidance", { exact: true }).click();
    await expect(preview.locator("table")).toContainText("color.primary");
    await page.screenshot({ path: `/tmp/monet-preset-${id}.png`, fullPage: true });
    await dialog.getByRole("button", { name: "Create profile", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Profile", exact: true })).toContainText(name + " browser");
    await expect(dialog).not.toBeVisible();
    const profileId = new URL(page.url()).searchParams.get("profile")!;
    const workspace = await (await request.get(`${apiUrl}/api/profiles/${profileId}/workspace`)).json() as Workspace;
    expect(workspace.themes).toEqual([]); expect(workspace.components).toHaveLength(5);
    await page.getByRole("link", { name: "Agent context", exact: true }).click();
    await expect(page.locator(".agent-page")).toContainText(profileId);
    await page.getByText(`Preset origin — ${name} 1.0.0`, { exact: true }).click();
    await expect(page.locator(".preset-origin")).toContainText("PRESET-LICENSES.txt");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download provenance and notices" }).click();
    expect((await downloadEvent).suggestedFilename()).toBe("PRESET.json");
  });
}

test("inline Project preset onboarding resumes after a lost response with the same Profile and Project", async ({ page, request }) => {
  const library = await (await request.get(apiUrl + "/api/profiles")).json() as ProfileLibrary;
  await page.goto(`${editor}/projects?profile=${library.originalProfileId}`);
  await page.getByLabel("Project folder", { exact: true }).fill(project);
  await page.getByLabel("Create new Profile", { exact: true }).check();
  await page.getByLabel("Starting point", { exact: true }).selectOption("preset");
  await page.getByRole("button", { name: /^Carbon Product/ }).click();
  let result: ProjectOnboardingResult | undefined;
  await page.route("**/api/**/project-onboardings", async (route) => {
    const response = await route.fetch(); result = await response.json() as ProjectOnboardingResult;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Connection interrupted after publication" }) });
  }, { times: 1 });
  await page.getByRole("button", { name: "Connect and discover screens" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  expect(result?.profile_id).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("status")).toContainText("saved for retry");
  await page.getByRole("button", { name: "Resume connection" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${result!.project.id}\\?profile=${result!.profile_id}`));
  const after = await (await request.get(apiUrl + "/api/profiles")).json() as ProfileLibrary;
  expect(after.profiles).toHaveLength(library.profiles.length + 1);
  const profile = after.profiles.find((p) => p.identity.id === result!.profile_id) as ProfileRegistration;
  expect(profile.identity.origin.preset?.id).toBe("carbon-product");
});

test("preset inspection fits a narrow viewport and keyboard selection keeps creation guarded", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(editor);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Mobile navigation" }).getByRole("button", { name: "New profile", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create independent profile" });
  await dialog.getByLabel("Name", { exact: true }).fill("Mobile preview");
  await dialog.getByLabel("Start with", { exact: true }).selectOption("preset");
  const option = dialog.getByRole("button", { name: /^USWDS Public Service/ });
  await option.focus(); await page.keyboard.press("Enter");
  await expect(option).toHaveAttribute("aria-pressed", "true");
  expect(await dialog.locator("form").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: "/tmp/monet-preset-mobile.png", fullPage: true });
  await dialog.getByLabel("Start with", { exact: true }).selectOption("scratch");
  await expect(dialog.getByRole("region", { name: /preview$/ })).toHaveCount(0);
  await dialog.getByLabel("Start with", { exact: true }).selectOption("preset");
  await expect(dialog.getByRole("button", { name: "Create profile", exact: true })).toBeDisabled();
});
