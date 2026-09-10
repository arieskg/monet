import { z } from "zod";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { captureRequestAllowed, PROJECT_LIMITS, type CaptureStrategy } from "../shared/projects.js";
import { SURFACE_LIMITS, type SurfaceInput } from "../shared/surfaces.js";
import { CAPTURE_SCRIPT } from "./projectCaptureScript.js";
import { SurfaceError } from "./surfaceSanitizer.js";

/**
 * Isolated capture: a headless Chromium with a throwaway profile loads one loopback URL, the
 * project's own code renders it, and the page is serialized into ordinary Surface input.
 *
 * Egress is denied twice: Chromium's host resolver maps every name except loopback to NOTFOUND,
 * and Playwright routing aborts any request (HTTP or WebSocket) that is not the capture origin's
 * own loopback port. Service workers are blocked, downloads refused, popups closed, dialogs
 * dismissed, and the whole capture has a hard deadline. Nothing from the capture browser reaches
 * Monet except the validated JSON below, which then passes through the Surface sanitizer.
 */
export const CAPTURE_BROWSER_VARIABLE = "MONET_CAPTURE_BROWSER";
export interface CaptureTarget { url: string; port: number; width: number; height: number; mode: "light" | "dark"; strategy: CaptureStrategy }
export interface RawCapture {
  title: string; html: string; computed_html: string; css: string; style_rules: number; node_count: number;
  assets: SurfaceInput["assets"]; screenshot?: SurfaceInput["screenshot"];
  blocked: { host: string; count: number }[]; warnings: string[]; browser: string; duration_ms: number; final_path: string;
}
const rawSchema = z.object({
  title: z.string().max(300), html: z.string().max(4 * SURFACE_LIMITS.html), computed_html: z.string().max(8 * SURFACE_LIMITS.html), css: z.string().max(2 * SURFACE_LIMITS.css),
  style_rules: z.number().int().nonnegative().max(1_000_000), node_count: z.number().int().nonnegative().max(10_000_000),
  assets: z.array(z.object({ filename: z.string().regex(/^asset-\d{1,3}$/), data_url: z.string().max(4 * 1024 * 1024 + 100) }).strict()).max(SURFACE_LIMITS.assets),
  warnings: z.array(z.string().max(300)).max(50),
}).strict().refine((value) => value.assets.reduce((sum, asset) => sum + asset.data_url.length, 0) <= 14 * 1024 * 1024, { message: "Asset budget exceeded." });
const oversizeSchema = z.object({ oversize: z.string().max(300), warnings: z.array(z.string().max(300)).max(50) }).strict();

let active = false;
export function captureBusy(): boolean { return active; }

function launchChoices(env: NodeJS.ProcessEnv): { label: string; options: LaunchOptions }[] {
  const args = ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1", "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check", "--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,InterestFeedContentSuggestions,PrivacySandboxSettings4"];
  const configured = (env[CAPTURE_BROWSER_VARIABLE] ?? "").trim();
  const choices: { label: string; options: LaunchOptions }[] = [];
  if (configured) choices.push(configured.includes("/") || configured.includes("\\") ? { label: configured, options: { executablePath: configured } } : { label: configured, options: { channel: configured } });
  else choices.push({ label: "chrome", options: { channel: "chrome" } }, { label: "chromium", options: {} });
  return choices.map((choice) => ({ label: choice.label, options: { ...choice.options, headless: true, args, timeout: 20_000, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false } }));
}
async function launch(env: NodeJS.ProcessEnv): Promise<{ browser: Browser; label: string }> {
  const failures: string[] = [];
  for (const choice of launchChoices(env)) {
    try { return { browser: await chromium.launch(choice.options), label: choice.label }; }
    catch (error) { failures.push(`${choice.label}: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`); }
  }
  throw new SurfaceError(`No capture browser is available. Install Google Chrome, run "pnpm exec playwright install chromium", or set ${CAPTURE_BROWSER_VARIABLE} to a Chromium channel or executable path. (${failures.join("; ")})`, 503);
}
const host = (url: string) => { try { const u = new URL(url); return u.host || u.protocol; } catch { return "invalid"; } };

export async function captureScreen(target: CaptureTarget, env: NodeJS.ProcessEnv = process.env): Promise<RawCapture> {
  if (active) throw new SurfaceError("A capture is already running. Wait for it to finish.", 429);
  active = true;
  const started = Date.now();
  const blocked = new Map<string, number>();
  const block = (url: string) => blocked.set(host(url), (blocked.get(host(url)) ?? 0) + 1);
  let browser: Browser | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    const launched = await launch(env);
    browser = launched.browser;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new SurfaceError(`Capture exceeded ${PROJECT_LIMITS.captureSeconds} seconds and was stopped.`, 504)); void browser?.close().catch(() => undefined); }, PROJECT_LIMITS.captureSeconds * 1000); });
    const work = (async () => {
      const context = await browser!.newContext({ viewport: { width: target.width, height: target.height }, colorScheme: target.mode, serviceWorkers: "block", acceptDownloads: false, reducedMotion: "reduce", deviceScaleFactor: 1, javaScriptEnabled: true, bypassCSP: false, ignoreHTTPSErrors: false, locale: "en-US", offline: false });
      context.setDefaultTimeout(20_000);
      await context.route("**/*", (route) => { const url = route.request().url(); if (captureRequestAllowed(url, target.port)) return route.continue(); block(url); return route.abort("blockedbyclient"); });
      await context.routeWebSocket((url) => !captureRequestAllowed(url.href, target.port), (ws) => { block(ws.url()); });
      const page = await context.newPage();
      // Register after the capture page exists: the context also reports its own first page here.
      context.on("page", (popup) => { if (popup !== page) void popup.close().catch(() => undefined); });
      page.on("dialog", (dialog) => { void dialog.dismiss().catch(() => undefined); });
      const warnings: string[] = [];
      try { await page.goto(target.url, { waitUntil: "load", timeout: 20_000 }); }
      catch (error) { throw new SurfaceError(`The screen could not be loaded from ${target.url}: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}. Start the project's dev server and check the URL.`, 502); }
      if (!captureRequestAllowed(page.url(), target.port)) throw new SurfaceError("The page navigated away from its loopback origin; capture refused.", 502);
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => warnings.push("Network activity did not settle within 6 seconds; the capture reflects the page at that moment."));
      await page.waitForTimeout(300);
      const options = { strategy: target.strategy, limits: { elements: 3500, css: SURFACE_LIMITS.css, assets: SURFACE_LIMITS.assets, assetBytes: SURFACE_LIMITS.imageBytes, totalAssetBytes: 9 * 1024 * 1024 } };
      let result: unknown;
      // Page-controlled exception text never reaches the editor: the page can break its own capture, not Monet's messages.
      try { result = await page.evaluate(`(${CAPTURE_SCRIPT})(${JSON.stringify(options)})`); }
      catch { throw new SurfaceError("The page interfered with capture and no document could be serialized. Try the computed-style strategy or a different screen.", 502); }
      const oversize = oversizeSchema.safeParse(result);
      if (oversize.success) throw new SurfaceError(oversize.data.oversize, 413);
      const parsed = rawSchema.safeParse(result);
      if (!parsed.success) throw new SurfaceError("The capture browser returned an unexpected document shape; the page may have interfered with capture. Try the computed-style strategy or a different screen.", 502);
      let screenshot: SurfaceInput["screenshot"];
      try {
        let bytes = await page.screenshot({ type: "png", timeout: 10_000 });
        let type: "png" | "jpeg" = "png";
        if (bytes.length > SURFACE_LIMITS.imageBytes) { bytes = await page.screenshot({ type: "jpeg", quality: 82, timeout: 10_000 }); type = "jpeg"; }
        if (bytes.length <= SURFACE_LIMITS.imageBytes) screenshot = { filename: `capture.${type}`, data_url: `data:image/${type};base64,${bytes.toString("base64")}` };
        else warnings.push("The screenshot exceeded 3 MB and was not kept.");
      } catch { warnings.push("A screenshot could not be taken."); }
      await context.close();
      return { ...parsed.data, warnings: [...parsed.data.warnings, ...warnings], screenshot, blocked: [...blocked].map(([h, count]) => ({ host: h, count })).sort((a, b) => b.count - a.count).slice(0, 40), browser: `${launched.label} ${browser!.version()}`, duration_ms: Date.now() - started, final_path: new URL(page.url()).pathname };
    })();
    work.catch(() => undefined); // The deadline may win; the abandoned work's rejection must not crash the service.
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5_000))]).catch(() => undefined);
    active = false;
  }
}
