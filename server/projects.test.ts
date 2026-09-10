import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createGap, getGap } from "./fileStore.js";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractHints, scanProject } from "./projectDiscovery.js";
import { startStaticServer } from "./projectStatic.js";
import { clearCaptureLedger, readCapture, storeCapture } from "./captureLedger.js";
import { ProfileRegistry } from "./profileRegistry.js";
import { BUNDLED_WORKSPACE, setWorkspaceRoot, withProfile, type ProfileScope } from "./workspace.js";
import { captureProjectScreen, checkProjectConnection, connectProject, disconnectProject, findScreens, getProject, interpretProject, listProjects, rescanProject } from "./projectStore.js";
import { deleteSurface, getSurface, listSurfaces, previewSurface, reviseSurface, saveSurface, surfaceToGap } from "./surfaceStore.js";
import type { RawCapture } from "./projectCapture.js";
import type { SurfaceCapture } from "../shared/projects.js";
import type { ProviderTask } from "./aiProvider.js";

let directory: string;
beforeEach(async () => { directory = await realpath(await mkdtemp(path.join(tmpdir(), "monet-projects-"))); clearCaptureLedger(); });
afterEach(async () => { vi.useRealTimers(); setWorkspaceRoot(BUNDLED_WORKSPACE); clearCaptureLedger(); await rm(directory, { recursive: true, force: true }); });
async function tree(root: string, files: Record<string, string>): Promise<string> {
  for (const [file, contents] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), contents); }
  return root;
}
const pkg = (deps: Record<string, string>, scripts: Record<string, string> = { dev: "vite" }, name = "fixture") => JSON.stringify({ name, dependencies: deps, scripts });

describe("bounded deterministic discovery", () => {
  it("lists static HTML files as screens and ignores hidden, dependency and linked content", async () => {
    const outside = await tree(path.join(directory, "outside"), { "leak.html": "<h1>Leak</h1>" });
    const root = await tree(path.join(directory, "static"), { "index.html": "<title>Welcome home</title><h1>Welcome to the site</h1>", "about.html": "<h1>About us</h1>", "docs/guide.html": "<h1>Guide</h1>", "node_modules/x/index.html": "<h1>dep</h1>", ".hidden/secret.html": "<h1>hidden</h1>" });
    await symlink(outside, path.join(root, "linked"));
    const inventory = await scanProject(root);
    expect(inventory.kind).toBe("static"); expect(inventory.dev_command).toBeUndefined(); expect(inventory.default_port).toBeUndefined();
    expect(inventory.screens.map((s) => [s.route, s.source])).toEqual([["/", "index.html"], ["/about", "about.html"], ["/docs/guide", "docs/guide.html"]]);
    expect(inventory.screens[0]!.hints).toEqual(["Welcome home", "Welcome to the site"]);
    expect(inventory.static_builds).toEqual([""]); expect(inventory.notices.join(" ")).toMatch(/symbolic link/);
    expect(inventory.screens.every((s) => !/leak|hidden|dep/.test(s.source))).toBe(true);
  });
  it("derives Next.js app and pages routes by convention, skipping parallel, private and API paths", async () => {
    const root = await tree(path.join(directory, "next"), { "package.json": pkg({ next: "15", react: "19" }, { dev: "next dev -p 3100" }), "app/page.tsx": "export default () => <h1>Dashboard overview</h1>", "app/(marketing)/pricing/page.tsx": "x", "app/blog/[slug]/page.tsx": "x", "app/@modal/page.tsx": "x", "app/_private/page.tsx": "x", "app/api/route.ts": "x", "pages/legacy.tsx": "x", "pages/api/hello.ts": "x", "pages/_app.tsx": "x", "pages/docs/[...parts].tsx": "x", "yarn.lock": "" });
    const inventory = await scanProject(root);
    expect(inventory.kind).toBe("next"); expect(inventory.default_port).toBe(3100); expect(inventory.dev_command).toBe(`cd '${root}' && yarn run dev`);
    expect(inventory.screens.map((s) => s.route)).toEqual(["/", "/blog/:slug", "/docs/:parts", "/legacy", "/pricing"]);
    expect(inventory.screens.find((s) => s.route === "/blog/:slug")).toMatchObject({ kind: "dynamic_route", parameters: ["slug"] });
    expect(inventory.notices.join(" ")).toMatch(/Dynamic routes need a real parameter/);
  });
  it("derives Astro, SvelteKit and Nuxt pages and treats built copies as static builds", async () => {
    const astro = await scanProject(await tree(path.join(directory, "astro"), { "package.json": pkg({ astro: "5" }), "astro.config.mjs": "export default { server: { port: 4400 } }", "src/pages/index.astro": "<h1>Blog home</h1>", "src/pages/about.md": "# About", "src/pages/blog/[...slug].astro": "x", "dist/index.html": "<h1>built</h1>" }));
    expect(astro.kind).toBe("astro"); expect(astro.default_port).toBe(4400); expect(astro.static_builds).toEqual(["dist"]);
    expect(astro.screens.map((s) => s.route)).toEqual(["/", "/about", "/blog/:slug"]);
    const svelte = await scanProject(await tree(path.join(directory, "svelte"), { "package.json": pkg({ "@sveltejs/kit": "2" }), "src/routes/+page.svelte": "x", "src/routes/(app)/dashboard/+page.svelte": "x", "src/routes/items/[id]/+page.svelte": "x" }));
    expect(svelte.screens.map((s) => s.route)).toEqual(["/", "/dashboard", "/items/:id"]);
    const nuxt = await scanProject(await tree(path.join(directory, "nuxt"), { "package.json": pkg({ nuxt: "3" }), "pages/index.vue": "x", "pages/users/[id].vue": "x" }));
    expect(nuxt.screens.map((s) => s.route)).toEqual(["/", "/users/:id"]);
  });
  it("reads React Router literals, skips redirects, resolves lazy components for hints, and never executes code", async () => {
    const root = await tree(path.join(directory, "vite"), {
      "package.json": pkg({ vite: "7", "react-router-dom": "7" }), "pnpm-lock.yaml": "", "vite.config.ts": "const appPort = Number(process.env.APP_PORT ?? 43130);\nexport default { server: { port: appPort } }",
      "index.html": "<div id=root></div>", "src/App.tsx": `import { HomePage } from "./pages/HomePage";\nconst SessionsPage = lazy(() => import("./pages/SessionsPage").then((m) => ({ default: m.SessionsPage })));\nexport default () => <Routes><Route element={<Layout />}><Route index element={<HomePage />} /><Route path="exercise/:exerciseId" element={<ExercisePage />} /><Route path="exercises" element={<Navigate to="/" replace />} /><Route path="sessions" element={<SessionsPage />} /><Route path="*" element={<Navigate to="/" />} /></Route></Routes>;`,
      "src/pages/HomePage.tsx": `export function HomePage() { process.exit(1); return <main><h1>Practice a difficult conversation</h1><p className="lead">Choose a scenario and prepare.</p><button onClick={() => fetch("/x")}>Start</button></main>; }`,
      "src/pages/SessionsPage.tsx": `export function SessionsPage() { return <h1>Your past sessions</h1>; }`,
    });
    const inventory = await scanProject(root);
    expect(inventory.framework).toBe("Vite + React Router"); expect(inventory.default_port).toBe(43130); expect(inventory.dev_command).toMatch(/pnpm run dev$/);
    expect(inventory.screens.map((s) => [s.route, s.source, s.label])).toEqual([["/", "src/pages/HomePage.tsx", "Home"], ["/exercise/:exerciseId", "src/App.tsx", "Exercise"], ["/sessions", "src/pages/SessionsPage.tsx", "Sessions"]]);
    expect(inventory.screens[0]!.hints).toEqual(["Practice a difficult conversation", "Choose a scenario and prepare.", "Start"]);
    expect(inventory.screens[2]!.hints).toEqual(["Your past sessions"]);
  });
  it("bounds the walk, reports truncation, and keeps hints free of code", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 6100; i++) files[`pages/p${i}.html`] = `<h1>Page ${i}</h1>`;
    const inventory = await scanProject(await tree(path.join(directory, "huge"), files));
    expect(inventory.truncated).toBe(true); expect(inventory.entries).toBeGreaterThan(6000); expect(inventory.screens.length).toBeLessThanOrEqual(200);
    expect(extractHints(`const url = "https://evil.test/x"; <p>{value}</p><h1>Real heading</h1> "src/pages/x.tsx" "className=\\"a b\\"" "SELECT * FROM users; drop table"`)).toEqual(["Real heading"]);
    await expect(scanProject(path.join(directory, "missing"))).rejects.toThrow();
  }, 30000);
});

describe("throwaway static server", () => {
  it("serves files beneath one directory only, with SPA fallback and no traversal, symlink or listing", async () => {
    const outside = await tree(path.join(directory, "outside"), { "secret.txt": "top secret" });
    const root = await tree(path.join(directory, "site"), { "dist/index.html": "<h1>app</h1>", "dist/assets/app.css": "body{}", "dist/notes.txt": "notes", "dist/.env": "SECRET=1", "dist/.git/config": "x" });
    await symlink(path.join(outside, "secret.txt"), path.join(root, "dist", "link.txt"));
    const server = await startStaticServer(root, "dist");
    try {
      const get = (p: string, init?: RequestInit) => fetch(server.origin + p, init);
      expect(await (await get("/")).text()).toBe("<h1>app</h1>"); expect((await get("/assets/app.css")).headers.get("content-type")).toBe("text/css; charset=utf-8");
      expect((await get("/sessions")).status).toBe(200); expect(await (await get("/sessions")).text()).toBe("<h1>app</h1>");
      await writeFile(path.join(root, "dist", "about.html"), "<h1>about</h1>"); expect(await (await get("/about")).text()).toBe("<h1>about</h1>");
      expect((await get("/.env")).status).toBe(404); expect((await get("/.git/config")).status).toBe(404); expect((await get("/%2eenv")).status).toBe(404);
      expect((await get("/missing.png")).status).toBe(404); expect((await get("/link.txt")).status).toBe(404); expect((await get("/assets/")).status).toBe(404);
      expect((await get("/../package.json")).status).toBe(404); expect((await get("/%2e%2e/%2e%2e/outside/secret.txt")).status).toBe(404);
      expect((await get("/notes.txt", { method: "POST" })).status).toBe(403); expect((await get("/", { method: "HEAD" })).status).toBe(200);
      const forged = await new Promise<number | undefined>((resolve, reject) => { const req = httpRequest(server.origin + "/", { headers: { host: "evil.test" } }, (r) => { r.resume(); r.on("end", () => resolve(r.statusCode)); }); req.on("error", reject); req.end(); });
      expect(forged).toBe(403);
      expect((await get("/index.html")).headers.get("cache-control")).toBe("no-store");
    } finally { await server.close(); }
    await expect(startStaticServer(root, "../outside")).rejects.toThrow(/relative/);
    await expect(startStaticServer(root, "/etc")).rejects.toThrow(/relative/);
  });
});

const capture = (over: Partial<SurfaceCapture> = {}): SurfaceCapture => ({ project_id: "6d8b9c1e-2f3a-4b5c-8d6e-7f8091a2b3c4", binding_revision: 1, project_name: "Fixture", screen_id: "scr-1", screen_label: "Home", route: "/", source: { kind: "static", directory: "" }, strategy: "stylesheet", captured_at: new Date().toISOString(), width: 1000, height: 700, mode: "light", browser: "test", blocked: [], warnings: [], ...over });
describe("capture ledger", () => {
  it("scopes entries to the capturing Profile, evicts beyond four, and expires", () => {
    const first = storeCapture({ title: "A", context: "", html: "<p>a</p>", css: "", width: 1000, height: 700, mode: "light", assets: [] }, capture());
    expect(readCapture(first.id).capture.route).toBe("/");
    const other: ProfileScope = Object.freeze({ root: "/tmp/other", identity: { version: 1 as const, id: "11111111-1111-4111-8111-111111111111", name: "Other", created_at: new Date().toISOString(), origin: { kind: "scratch" as const } } });
    expect(() => withProfile(other, () => readCapture(first.id))).toThrow(/not found/);
    for (let i = 0; i < 4; i++) storeCapture({ title: `B${i}`, context: "", html: "<p>b</p>", css: "", width: 1000, height: 700, mode: "light", assets: [] }, capture());
    expect(() => readCapture(first.id)).toThrow(/not found/);
    vi.useFakeTimers(); const now = Date.now();
    const late = storeCapture({ title: "C", context: "", html: "<p>c</p>", css: "", width: 1000, height: 700, mode: "light", assets: [] }, capture());
    vi.setSystemTime(now + 16 * 60 * 1000);
    expect(() => readCapture(late.id)).toThrow(/expired/);
  });
});

describe("Profile-bound project records and capture pipeline", () => {
  let registry: ProfileRegistry, a: ProfileScope, b: ProfileScope, project: string;
  const raw = (over: Partial<RawCapture> = {}): RawCapture => ({ title: "Fixture", html: '<!DOCTYPE html><html><head><title>t</title></head><body><main class="panel"><h1>Practice</h1><button style="color:#112233">Start</button></main></body></html>', computed_html: '<!DOCTYPE html><html><head></head><body style="background-color:rgb(255, 255, 255)"><main style="display:grid;padding-top:16px"><h1 style="color:rgb(17, 34, 51)">Practice</h1></main></body></html>', css: ":root{--panel:#ffffff}.panel{background-color:var(--panel);border-radius:8px}", style_rules: 2, node_count: 9, assets: [], blocked: [{ host: "evil.test", count: 3 }], warnings: ["fake browser"], browser: "fake 1", duration_ms: 5, final_path: "/", ...over });
  beforeEach(async () => {
    const original = path.join(directory, "original");
    await cp(BUNDLED_WORKSPACE, original, { recursive: true, filter: (p) => !/\/(gaps|proposals|applications|surfaces|projects)(\/|$)/.test(p) && !p.endsWith("profile.json") });
    registry = new ProfileRegistry(path.join(directory, "library")); await registry.open(original);
    a = await registry.scope(registry.list().originalProfileId);
    b = await registry.scope((await registry.create({ name: "Other", kind: "scratch" })).identity.id);
    project = await tree(path.join(directory, "app"), { "index.html": "<h1>Welcome home</h1>", "about.html": "<h1>About us</h1>", "dist/index.html": "<h1>built</h1>" });
  });
  it("connects, binds, lists, rescans and disconnects within one Profile; other Profiles never see it", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    expect(record).toMatchObject({ profile_id: a.identity!.id, scope_version: 2, name: "app", root: await realpath(project), binding_revision: 1 });
    expect(registry.list().profiles.length).toBe(2);
    expect(a.projectBinding!(record.id)).toMatchObject({ profileId: a.identity!.id, bindingRevision: 1 }); expect(b.projectBinding!(record.id)).toBeUndefined();
    expect((await withProfile(a, listProjects)).map((p) => p.name)).toEqual(["app"]); expect(await withProfile(b, listProjects)).toEqual([]);
    await expect(withProfile(b, () => getProject(record.id))).rejects.toThrow();
    // A copied record file in another Profile is refused because the library binding names Profile A.
    await mkdir(path.join(b.root, "projects"), { recursive: true }); await writeFile(path.join(b.root, "projects", `${record.id}.json`), (await readFile(path.join(a.root, "projects", `${record.id}.json`), "utf8")).replace(a.identity!.id, b.identity!.id));
    await expect(withProfile(b, () => getProject(record.id))).rejects.toThrow(/registered binding/); await expect(withProfile(b, listProjects)).rejects.toThrow(/registered binding/);
    await writeFile(path.join(project, "contact.html"), "<h1>Contact</h1>");
    const rescanned = await withProfile(a, () => rescanProject(record.id)); expect(rescanned.inventory.screens.map((s) => s.route)).toContain("/contact");
    await withProfile(a, () => disconnectProject(record.id)); expect(await withProfile(a, listProjects)).toEqual([]);
    expect(a.projectBinding!(record.id)).toBeDefined(); // Historical evidence keeps its binding; reassignment stays refused.
  });
  it("refuses roots that are missing, files, home, the library or a Profile", async () => {
    await writeFile(path.join(directory, "file.txt"), "x");
    for (const [root, pattern] of [[path.join(directory, "nope"), /does not exist/], [path.join(directory, "file.txt"), /must be a directory/], ["relative/path", /absolute/], [registry.directory, /Profile or the Monet library/], [a.root, /Profile or the Monet library/], [path.dirname(a.root), /Profile or the Monet library/]] as const) await expect(withProfile(a, () => connectProject({ root })), root).rejects.toThrow(pattern);
    await expect(withProfile(Object.freeze({ root: a.root, identity: a.identity }), () => connectProject({ root: project }))).rejects.toThrow(/registered Profile/);
  });
  it("finds screens deterministically and validates provider output against the inventory", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    const plain = await withProfile(a, () => findScreens(record.id, { query: "about us" }));
    expect(plain.deterministic[0]?.screen_id).toBe(record.inventory.screens.find((s) => s.route === "/about")!.id); expect(plain.ai.status).toBe("not_requested");
    expect((await withProfile(a, () => findScreens(record.id, { query: "about", ai: true }, { MONET_AI_COMMAND: "" }))).ai.status).toBe("unavailable");
    const env = { MONET_AI_COMMAND: "fake" };
    const prompts: string[] = [];
    const honest = async (task: ProviderTask) => { prompts.push(task.prompt); return { matches: [{ screen_id: record.inventory.screens[0]!.id, confidence: "high", reason: "The home page" }, { screen_id: record.inventory.screens[0]!.id, confidence: "low", reason: "duplicate" }] }; };
    const found = await withProfile(a, () => findScreens(record.id, { query: "home", ai: true }, env, honest));
    expect(found.ai.status).toBe("complete"); expect(found.ai.matches).toHaveLength(1);
    expect(prompts[0]).toContain("untrusted"); expect(prompts[0]).not.toContain(a.root);
    const liar = async () => ({ matches: [{ screen_id: "scr-fabricated", confidence: "high", reason: "x" }] });
    expect((await withProfile(a, () => findScreens(record.id, { query: "home", ai: true }, env, liar))).ai).toMatchObject({ status: "failed", matches: [] });
    const labelled = await withProfile(a, () => interpretProject(record.id, env, async () => ({ screens: [{ screen_id: record.inventory.screens[0]!.id, label: "Landing", summary: "First thing visitors see." }] })));
    expect(labelled.inventory.screens[0]).toMatchObject({ ai_label: "Landing", route: "/", source: "index.html" }); expect(labelled.inventory.ai?.status).toBe("complete");
    const failed = await withProfile(a, () => interpretProject(record.id, env, async () => ({ screens: [{ screen_id: "scr-fabricated", label: "Evil", summary: "x" }] })));
    expect(failed.inventory.ai?.status).toBe("failed"); expect(failed.inventory.screens[0]!.ai_label).toBe("Landing");
    await expect(withProfile(a, () => interpretProject(record.id, { MONET_AI_COMMAND: "" }))).rejects.toThrow(/no provider/);
    await expect(withProfile(a, () => checkProjectConnection(record.id, { base_url: "http://evil.test:5173" }))).rejects.toThrow(/loopback/);
    await expect(withProfile(a, () => checkProjectConnection(record.id, { base_url: "http://127.0.0.1:43141" }, { MONET_PORT: "43141" }))).rejects.toThrow(/Monet itself/);
    expect((await withProfile(a, () => checkProjectConnection(record.id, { base_url: "http://127.0.0.1:1" }))).reachable).toBe(false);
  });
  it("captures through a fake browser step into an attested Surface with a fixed evaluation target", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    const home = record.inventory.screens.find((s) => s.route === "/")!;
    const targets: string[] = [];
    const fake = async (target: { url: string; port: number }) => { targets.push(target.url); expect((await fetch(target.url)).status).toBe(200); return raw(); };
    await expect(withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, source: { kind: "dev_server", base_url: "http://evil.test:3000" } }, {}, fake))).rejects.toThrow(/loopback/);
    await expect(withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, source: { kind: "static", directory: "build" } }, {}, fake))).rejects.toThrow(/not a discovered static build/);
    await expect(withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, route: "/items/:id", source: { kind: "static", directory: "" } }, {}, fake))).rejects.toThrow(/real value/);
    await expect(withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, route: "//evil.test/x", source: { kind: "static", directory: "" } }, {}, fake))).rejects.toThrow(/path starting with/);
    await expect(withProfile(a, () => captureProjectScreen(record.id, { screen_id: "scr-unknown", source: { kind: "static", directory: "" } }, {}, fake))).rejects.toThrow(/Unknown screen/);
    const result = await withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, source: { kind: "static", directory: "" }, width: 1000, height: 700 }, {}, fake));
    expect(targets[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(result.capture).toMatchObject({ project_id: record.id, binding_revision: 1, screen_id: home.id, route: "/", strategy: "stylesheet", blocked: [{ host: "evil.test", count: 3 }] });
    expect(result.preview.original).toContain("Practice"); expect(result.preview.capture?.project_name).toBe("app"); expect(result.fidelity).toMatchObject({ rules: 2, rules_removed: 0 });
    expect((await withProfile(a, () => getProject(record.id))).capture_defaults).toMatchObject({ width: 1000, height: 700 });
    // The client never supplies provenance: a foreign Profile cannot use the id, and contradictory project evidence is refused.
    await expect(withProfile(b, () => previewSurface({ capture_id: result.capture_id, selection: {} }))).rejects.toThrow(/not found/);
    await expect(withProfile(a, () => saveSurface({ capture_id: result.capture_id, selection: { project: { project_id: "6d8b9c1e-2f3a-4b5c-8d6e-7f8091a2b3c4", binding_revision: 1 } } }))).rejects.toThrow(/does not match the captured project/);
    await expect(withProfile(a, () => saveSurface({ capture_id: result.capture_id, input: { title: "x", html: "<p>x</p>" }, selection: {} }))).rejects.toThrow();
    const saved = await withProfile(a, () => saveSurface({ capture_id: result.capture_id, title: "Home · renamed", selection: { mode: "light" } }));
    expect(saved.saved).toBeDefined(); expect(saved.snapshot.input.title).toBe("Home · renamed"); expect(saved.run.project).toEqual({ project_id: record.id, binding_revision: 1 }); expect(saved.capture?.strategy).toBe("stylesheet");
    await expect(withProfile(a, () => previewSurface({ capture_id: result.capture_id, selection: {} }))).rejects.toThrow(/not found/); // Saving consumes the capture.
    const revised = await withProfile(a, () => reviseSurface(saved.saved!.id, { expected_revision: 1, selection: { mode: "dark" } }));
    expect(revised.run.project).toEqual({ project_id: record.id, binding_revision: 1 }); expect(revised.capture?.route).toBe("/");
    expect((await withProfile(a, listSurfaces))[0]!.capture).toMatchObject({ project_name: "app", route: "/" });
    expect((await withProfile(a, () => getSurface(saved.saved!.id))).capture?.project_id).toBe(record.id);
    await expect(withProfile(b, () => getSurface(saved.saved!.id))).rejects.toThrow();
    // Tampered stored provenance is rejected on read.
    const file = path.join(a.root, "surfaces", `${saved.saved!.id}.json`);
    await writeFile(file, (await readFile(file, "utf8")).replace('"strategy": "stylesheet"', '"strategy": "magic"'));
    await expect(withProfile(a, () => getSurface(saved.saved!.id))).rejects.toThrow();
  });
  it("chooses computed styles when stylesheet capture would drop most rules, and refuses oversize documents", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    const home = record.inventory.screens.find((s) => s.route === "/")!;
    const framework = raw({ css: ".md\\:flex{display:flex}[data-a]{color:red}.x:hover{color:red}.ok{color:blue}", style_rules: 4 });
    const auto = await withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, source: { kind: "static", directory: "" } }, {}, async () => framework));
    expect(auto.capture.strategy).toBe("computed"); expect(auto.fidelity).toMatchObject({ rules: 4, rules_removed: 3, css_bytes: 0 }); expect(auto.preview.original).toMatch(/background-color:rgb\(255,\s?255,\s?255\)/); expect(auto.capture.warnings.join(" ")).toMatch(/computed styles were inlined/);
    const forced = await withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, source: { kind: "static", directory: "" }, strategy: "stylesheet" }, {}, async () => framework));
    expect(forced.capture.strategy).toBe("stylesheet"); expect(forced.preview.original).toContain(".ok{color:blue}");
    const huge = raw({ html: "<p>" + "x".repeat(400_000) + "</p>", computed_html: "" });
    await expect(withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, source: { kind: "static", directory: "" } }, {}, async () => huge))).rejects.toThrow(/exceeds the 300 KB/);
    const hostile = raw({ html: '<!DOCTYPE html><html><head></head><body><script>parent.pwned=1</script><img src="https://evil.test/x" onerror="alert(1)"><p>Safe</p></body></html>' });
    const result = await withProfile(a, () => captureProjectScreen(record.id, { screen_id: home.id, source: { kind: "static", directory: "" } }, {}, async () => hostile));
    expect(result.preview.original).not.toMatch(/<script|onerror|evil\.test/); expect(result.preview.original).toContain("Safe");
  });
  it("does not redeem one capture twice concurrently and labels computed evidence accurately", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    const result = await withProfile(a, () => captureProjectScreen(record.id, { screen_id: record.inventory.screens[0]!.id, source: { kind: "static", directory: "" }, strategy: "computed" }, {}, async () => raw()));
    const saves = await Promise.allSettled([1, 2].map(() => withProfile(a, () => saveSurface({ capture_id: result.capture_id, selection: {} }))));
    expect(saves.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    expect(result.preview.run.review.scope).toContain("computed");
    expect(result.preview.run.review.scope).not.toContain("authored declarations only");
  });
  it("records the final captured route after a same-app redirect", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    const result = await withProfile(a, () => captureProjectScreen(record.id, { screen_id: record.inventory.screens[0]!.id, source: { kind: "static", directory: "" } }, {}, async () => raw({ final_path: "/login" })));
    expect(result.capture.route).toBe("/login");
  });
  it("keeps delayed AI, capture, save and Gap work in their original Profile", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    const screen = record.inventory.screens[0]!;
    let release!: () => void, started!: () => void;
    const gate = { promise: new Promise<void>((resolve) => { release = resolve; }), resolve: () => release() };
    const begun = { promise: new Promise<void>((resolve) => { started = resolve; }), resolve: () => started() };
    const capturing = withProfile(a, () => captureProjectScreen(record.id, { screen_id: screen.id, source: { kind: "static", directory: "" } }, {}, async () => { begun.resolve(); await gate.promise; return raw(); }));
    const finding = withProfile(a, () => findScreens(record.id, { query: "welcome", ai: true }, { MONET_AI_COMMAND: "fake" }, async () => { await gate.promise; return { matches: [{ screen_id: screen.id, confidence: "high", reason: "Welcome" }] }; }));
    await begun.promise;
    expect(await withProfile(b, listProjects)).toEqual([]);
    gate.resolve();
    const result = await capturing;
    expect((await finding).ai.matches[0]?.screen_id).toBe(screen.id);
    await expect(withProfile(b, () => saveSurface({ capture_id: result.capture_id, selection: {} }))).rejects.toThrow(/not found/);
    const saved = await withProfile(a, () => saveSurface({ capture_id: result.capture_id, selection: {} }));
    const gap = await withProfile(a, () => surfaceToGap(saved.saved!.id, { revision: 1, problem: "Review this observation", expected: "Match the intended style", issue_ids: [saved.run.issues[0]!.id], include_screenshot: false }));
    expect(gap.profile_id).toBe(a.identity!.id);
    const other = await withProfile(a, () => connectProject({ root: project, name: "Another binding" }));
    await expect(withProfile(a, () => createGap({ ...gap.report, project: { project_id: other.id, binding_revision: 1 } }))).rejects.toThrow(/does not match saved Surface/);
    await expect(withProfile(b, () => getGap(gap.id))).rejects.toThrow();
    await withProfile(a, () => deleteSurface(saved.saved!.id));
    expect((await withProfile(a, () => getGap(gap.id))).report.provenance).toEqual(gap.report.provenance);
  });
  it("refuses a project root replaced with a Profile symlink before capture", async () => {
    const record = await withProfile(a, () => connectProject({ root: project }));
    await rename(project, project + "-moved"); await symlink(a.root, project);
    const fake = vi.fn(async () => raw());
    await expect(withProfile(a, () => captureProjectScreen(record.id, { screen_id: record.inventory.screens[0]!.id, source: { kind: "static", directory: "" } }, {}, fake))).rejects.toThrow(/Profile|moved|link/);
    expect(fake).not.toHaveBeenCalled();
    await expect(withProfile(a, () => rescanProject(record.id))).rejects.toThrow();
  });
});
