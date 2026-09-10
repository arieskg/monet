import { createHash } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { PROJECT_IGNORED, readProjectFile } from "./projectFiles.js";
import { PROJECT_LIMITS, humanizeRoute, type ProjectInventory, type ProjectKind, type ProjectScreen } from "../shared/projects.js";

/**
 * Deterministic, bounded project inspection. It reads directory names, `package.json`, config
 * files and a bounded prefix of route source files. It never follows symlinks, runs a script,
 * installs anything, or writes to the project. Framework detection is by dependency and file
 * layout; route derivation is by convention plus literal route strings. Anything it cannot
 * establish is reported as a notice, never guessed.
 */
const IGNORED = PROJECT_IGNORED;
const BUILD_DIRS = ["dist", "build", "out", "_site", "site", "public"];
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

async function readPrefix(root: string, relative: string, limit: number): Promise<string> {
  return (await readProjectFile(root, relative, limit)).toString("utf8");
}
/** Iterative walk with an entry budget; symlinks are recorded and never followed. */
async function walk(root: string, notices: string[]): Promise<{ files: string[]; entries: number; truncated: boolean }> {
  const files: string[] = []; const queue: [relative: string, depth: number][] = [["", 0]];
  let entries = 0, truncated = false, symlinks = 0;
  while (queue.length) {
    const [relative, depth] = queue.shift()!;
    let names: string[];
    try { names = [];
      const dir = await opendir(path.join(root, relative));
      for await (const entry of dir) { names.push(entry.name); if (names.length > PROJECT_LIMITS.entries - entries) { truncated = true; break; } }
      names.sort(); } catch (e) { if (missing(e)) continue; notices.push(`Could not read ${relative || "."}: ${(e as Error).message}`); continue; }
    for (const name of names) {
      if (++entries > PROJECT_LIMITS.entries) { truncated = true; break; }
      if (name.startsWith(".") && name !== ".well-known" || IGNORED.has(name)) continue;
      const child = relative ? `${relative}/${name}` : name;
      let stat; try { stat = await lstat(path.join(root, child)); } catch { continue; }
      if (stat.isSymbolicLink()) { symlinks++; continue; }
      if (stat.isDirectory()) { if (depth < PROJECT_LIMITS.depth) queue.push([child, depth + 1]); continue; }
      if (stat.isFile() && stat.nlink === 1) files.push(child);
    }
    if (truncated) break;
  }
  if (symlinks) notices.push(`${symlinks} symbolic link${symlinks === 1 ? "" : "s"} skipped; discovery never follows links.`);
  if (truncated) notices.push(`Scan stopped after ${PROJECT_LIMITS.entries.toLocaleString()} entries; some screens may be missing. Connect a narrower directory for complete discovery.`);
  return { files, entries, truncated };
}

interface PackageInfo { name?: string; deps: Set<string>; scripts: Record<string, string> }
async function readPackage(root: string, notices: string[]): Promise<PackageInfo | null> {
  const file = path.join(root, "package.json");
  let stat; try { stat = await lstat(file); } catch (e) { if (missing(e)) return null; throw e; }
  if (!stat.isFile()) return null;
  if (stat.size > PROJECT_LIMITS.packageBytes) { notices.push("package.json exceeds 256 KB and was not read."); return { deps: new Set(), scripts: {} }; }
  try {
    const parsed = JSON.parse(await readPrefix(root, "package.json", PROJECT_LIMITS.packageBytes)) as { name?: unknown; dependencies?: unknown; devDependencies?: unknown; scripts?: unknown };
    const deps = new Set<string>();
    for (const group of [parsed.dependencies, parsed.devDependencies]) if (group && typeof group === "object") for (const key of Object.keys(group)) deps.add(key);
    const scripts: Record<string, string> = {};
    if (parsed.scripts && typeof parsed.scripts === "object") for (const [key, value] of Object.entries(parsed.scripts)) if (typeof value === "string") scripts[key] = value.slice(0, 500);
    return { name: typeof parsed.name === "string" ? parsed.name.slice(0, 100) : undefined, deps, scripts };
  } catch { notices.push("package.json is not valid JSON; framework detection used file layout only."); return { deps: new Set(), scripts: {} }; }
}
function detectKind(pkg: PackageInfo | null, files: string[]): { kind: ProjectKind; framework: string; port: number } {
  const has = (dep: string) => pkg?.deps.has(dep) ?? false;
  if (has("next")) return { kind: "next", framework: "Next.js", port: 3000 };
  if (has("astro")) return { kind: "astro", framework: "Astro", port: 4321 };
  if (has("@sveltejs/kit")) return { kind: "sveltekit", framework: "SvelteKit", port: 5173 };
  if (has("nuxt")) return { kind: "nuxt", framework: "Nuxt", port: 3000 };
  if (has("vite")) return { kind: "vite", framework: has("react-router-dom") || has("react-router") ? "Vite + React Router" : has("vue-router") ? "Vite + Vue Router" : "Vite", port: 5173 };
  if (pkg) return { kind: "node", framework: has("react-scripts") ? "Create React App" : "Node project", port: 3000 };
  return { kind: "static", framework: files.some((f) => f.endsWith(".html")) ? "Static HTML" : "Directory", port: 0 };
}
async function configuredPort(root: string, kind: ProjectKind, pkg: PackageInfo | null, fallback: number): Promise<number | undefined> {
  if (kind === "static") return undefined;
  for (const name of ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs", "astro.config.mjs", "astro.config.ts", "nuxt.config.ts", "svelte.config.js"]) {
    try { const source = await readPrefix(root, name, 32 * 1024); const match = /port\b[^\n;]{0,80}?(\d{4,5})\b/i.exec(source); if (match && Number(match[1]) <= 65535) return Number(match[1]); } catch { /* Missing, linked or non-regular configs are not inspected. */ }
  }
  const script = pkg?.scripts.dev ?? pkg?.scripts.start ?? "";
  const flag = /(?:--port|-p)[\s=]+(\d{2,5})\b/.exec(script);
  return flag && Number(flag[1]) > 0 && Number(flag[1]) <= 65535 ? Number(flag[1]) : fallback;
}
function devCommand(root: string, pkg: PackageInfo | null, files: string[]): string | undefined {
  if (!pkg) return undefined;
  const script = ["dev", "start", "serve", "preview"].find((name) => pkg.scripts[name]);
  if (!script) return undefined;
  const manager = files.includes("pnpm-lock.yaml") ? "pnpm" : files.includes("yarn.lock") ? "yarn" : files.includes("bun.lockb") || files.includes("bun.lock") ? "bun" : "npm";
  return `cd ${("'" + root.replace(/'/g, "'\\''") + "'")} && ${manager} run ${script}`;
}

const dynamicSegment = /^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/;
/** File-convention route: `(group)` and `_private` segments vanish, `[param]` becomes `:param`. */
function conventionRoute(segments: string[]): { route: string; parameters: string[] } | null {
  const out: string[] = [], parameters: string[] = [];
  for (const segment of segments) {
    if (/^\(.*\)$/.test(segment)) continue;
    if (segment.startsWith("@") || segment.startsWith("_")) return null;
    const dynamic = dynamicSegment.exec(segment);
    if (dynamic) { parameters.push(dynamic[1]!); out.push(`:${dynamic[1]}`); } else out.push(segment);
  }
  return { route: "/" + out.join("/"), parameters };
}
function screenId(kind: string, route: string, source: string): string { return "scr-" + createHash("sha256").update(`${kind}\n${route}\n${source}`).digest("hex").slice(0, 12); }
function addScreen(screens: Map<string, ProjectScreen>, route: string, source: string, parameters: string[], kindHint: ProjectScreen["kind"], label?: string): void {
  if (screens.size >= PROJECT_LIMITS.screens) return;
  const kind = parameters.length ? "dynamic_route" : kindHint;
  const id = screenId(kind, route, source);
  if (!screens.has(id)) screens.set(id, { id, label: label ?? humanizeRoute(route), route, source, kind, parameters, hints: [] });
}
function fileRoute(relativeNoExt: string): string { const trimmed = relativeNoExt.replace(/(^|\/)index$/, "$1"); return "/" + trimmed.replace(/\/$/, ""); }

/** Route literals from React Router / Vue Router source, with one-hop component resolution for hints. */
async function literalRoutes(root: string, files: string[], screens: Map<string, ProjectScreen>, notices: string[]): Promise<void> {
  const candidates = files.filter((f) => /^(src|app|pages|client|frontend)\//.test(f) && /\.(tsx|jsx|ts|js|vue|mjs)$/.test(f) && !/\.(test|spec|stories)\./.test(f)).slice(0, PROJECT_LIMITS.sourceFiles);
  if (files.length > PROJECT_LIMITS.sourceFiles && candidates.length === PROJECT_LIMITS.sourceFiles) notices.push(`Route literal search stopped after ${PROJECT_LIMITS.sourceFiles} source files.`);
  for (const file of candidates) {
    let source: string;
    try { source = await readPrefix(root, file, PROJECT_LIMITS.sourceBytes); } catch { continue; }
    if (!/<Route\b|createBrowserRouter|createHashRouter|createMemoryRouter|useRoutes\(|createRouter\(/.test(source)) continue;
    const imports = new Map<string, string>();
    for (const match of source.matchAll(/import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s+["']([^"']+)["']/g)) for (const name of match[0].replace(/import|from|["'{}*]/g, " ").split(/[\s,]+/)) if (/^[A-Z]\w*$/.test(name)) imports.set(name, match[1]!);
    for (const match of source.matchAll(/(?:const|let)\s+([A-Z]\w*)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g)) imports.set(match[1]!, match[2]!);
    for (const tag of source.matchAll(/<Route\b([^>]*)>/g)) {
      const attributes = tag[1]!;
      if (/<Navigate\b/.test(attributes)) continue;
      const pathValue = /\bpath=(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/.exec(attributes);
      const index = /\bindex\b/.test(attributes);
      if (!pathValue && !index) continue;
      let route = pathValue ? (pathValue[1] ?? pathValue[2] ?? pathValue[3] ?? "") : "/";
      if (route === "*" || route.includes("*")) continue;
      route = "/" + route.replace(/^\/+/, "");
      const parameters = [...route.matchAll(/:(\w+)/g)].map((m) => m[1]!);
      const component = /\belement=\{\s*<([A-Z]\w*)/.exec(attributes)?.[1];
      const resolved = component && imports.get(component) ? await resolveModule(root, path.posix.dirname(file), imports.get(component)!, files) : null;
      addScreen(screens, route, resolved ?? file, parameters, "route", component ? humanizeComponent(component) : undefined);
    }
    if (/createRouter\(|createBrowserRouter|createHashRouter|createMemoryRouter|useRoutes\(/.test(source)) {
      for (const match of source.matchAll(/\bpath:\s*["'`]([^"'`]*)["'`]/g)) {
        const route = "/" + match[1]!.replace(/^\/+/, "");
        if (route.includes("*")) continue;
        addScreen(screens, route, file, [...route.matchAll(/:(\w+)/g)].map((m) => m[1]!), "route");
      }
    }
  }
}
function humanizeComponent(name: string): string { return humanizeRoute("/" + name.replace(/(Page|Screen|View|Route)$/, "")); }
async function resolveModule(root: string, from: string, specifier: string, files: string[]): Promise<string | null> {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(from, specifier));
  if (base.startsWith("..")) return null;
  for (const candidate of [base, ...[".tsx", ".jsx", ".ts", ".js", ".vue", "/index.tsx", "/index.jsx", "/index.ts", "/index.js"].map((ext) => base + ext)]) if (files.includes(candidate)) return candidate;
  void root; return null;
}

/** Visible text hints from a bounded source prefix: JSX/HTML text and sentence-like strings. Never code paths or identifiers. */
export function extractHints(source: string): string[] {
  const hints = new Set<string>();
  const consider = (raw: string) => {
    const value = raw.replace(/\s+/g, " ").trim();
    if (value.length < 3 || value.length > PROJECT_LIMITS.hintLength || hints.size >= PROJECT_LIMITS.hints) return;
    const letters = (value.match(/[A-Za-zÀ-ɏ぀-ヿ一-鿿]/g) ?? []).length;
    if (letters < 3 || letters / value.length < 0.6 || /[{}<>;=\\/|$@`]|https?:|\.\w{2,4}$|^[a-z0-9_-]+$/.test(value)) return;
    hints.add(value);
  };
  for (const match of source.matchAll(/<title>([^<]{3,120})<\/title>/gi)) consider(match[1]!);
  for (const match of source.matchAll(/>([^<>{}]{3,120})</g)) consider(match[1]!);
  for (const match of source.matchAll(/["'`]([^"'`\n]{6,120})["'`]/g)) if (match[1]!.includes(" ")) consider(match[1]!);
  return [...hints];
}

export async function scanProject(rootInput: string): Promise<ProjectInventory> {
  const root = await realpath(rootInput);
  if (!(await lstat(root)).isDirectory()) throw Object.assign(new Error("Project root must be a directory."), { status: 400 });
  const notices: string[] = [];
  const pkg = await readPackage(root, notices);
  const { files, entries, truncated } = await walk(root, notices);
  const { kind, framework, port } = detectKind(pkg, files);
  const screens = new Map<string, ProjectScreen>();
  const staticBuilds = ["", ...BUILD_DIRS].filter((dir) => files.includes(dir ? `${dir}/index.html` : "index.html") && !(kind !== "static" && dir === ""));
  if (kind === "static") {
    if (!staticBuilds.includes("") && files.some((f) => f.endsWith(".html"))) staticBuilds.unshift("");
    for (const file of files.filter((f) => f.endsWith(".html"))) {
      const withoutExt = file.replace(/\.html?$/, "");
      addScreen(screens, fileRoute(withoutExt), file, [], "static_file");
    }
    if (!screens.size) notices.push("No HTML files found. Static discovery lists .html files; framework projects need a package.json.");
  }
  if (kind === "next") {
    for (const file of files) {
      const app = /^(?:src\/)?app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(file);
      if (app) { const route = conventionRoute(app[1] ? app[1].split("/") : []); if (route) addScreen(screens, route.route, file, route.parameters, "route"); continue; }
      const pages = /^(?:src\/)?pages\/(.+)\.(?:tsx|jsx|ts|js|mdx)$/.exec(file);
      if (pages && !/^(?:api\/|_app|_document|_error|404|500)/.test(pages[1]!)) { const segments = pages[1]!.split("/"); if (segments[segments.length - 1] === "index") segments.pop(); const route = conventionRoute(segments); if (route) addScreen(screens, route.route, file, route.parameters, "route"); }
    }
  }
  if (kind === "astro") for (const file of files) { const match = /^src\/pages\/(.+)\.(?:astro|md|mdx|html)$/.exec(file); if (match) { const segments = match[1]!.split("/"); if (segments[segments.length - 1] === "index") segments.pop(); const route = conventionRoute(segments); if (route) addScreen(screens, route.route, file, route.parameters, "route"); } }
  if (kind === "sveltekit") for (const file of files) { const match = /^src\/routes\/(?:(.*)\/)?\+page\.(?:svelte|md|svx)$/.exec(file); if (match) { const route = conventionRoute(match[1] ? match[1].split("/") : []); if (route) addScreen(screens, route.route, file, route.parameters, "route"); } }
  if (kind === "nuxt") for (const file of files) { const match = /^(?:app\/)?pages\/(.+)\.vue$/.exec(file); if (match) { const segments = match[1]!.split("/"); if (segments[segments.length - 1] === "index") segments.pop(); const route = conventionRoute(segments); if (route) addScreen(screens, route.route, file, route.parameters, "route"); } }
  if (kind === "vite" || kind === "node" || kind === "sveltekit" && !screens.size) {
    await literalRoutes(root, files, screens, notices);
    for (const file of files.filter((f) => /^[^/]+\.html$/.test(f))) if (file === "index.html" ? !screens.size : true) addScreen(screens, file === "index.html" ? "/" : `/${file}`, file, [], "static_file");
    if (!screens.size) notices.push("No route literals or HTML entry files were found. Add screens by capturing a route you know exists once the dev server runs.");
  }
  if (kind === "astro" && !screens.size) notices.push("No pages found under src/pages.");
  let reads = 0;
  for (const screen of screens.values()) {
    if (reads++ >= PROJECT_LIMITS.screens) break;
    try { screen.hints = extractHints(await readPrefix(root, screen.source, PROJECT_LIMITS.sourceBytes)); } catch { /* unreadable source is not an error; the screen keeps its route */ }
  }
  const ordered = [...screens.values()].sort((a, b) => a.route.localeCompare(b.route) || a.source.localeCompare(b.source));
  if (ordered.some((s) => s.kind === "dynamic_route")) notices.push("Dynamic routes need a real parameter value before capture; enter the exact path to capture.");
  if (kind !== "static") notices.push("Framework screens are captured from a dev server that you start yourself. Monet never installs dependencies or runs project scripts.");
  if (staticBuilds.length && kind !== "static") notices.push(`A built copy exists in ${staticBuilds.map((d) => d || ".").join(", ")}; it can be captured without a dev server, but it may lack live data.`);
  const fingerprint = createHash("sha256").update(JSON.stringify(ordered.map((s) => [s.id, s.route, s.source, s.kind]))).digest("hex");
  return { version: 1, scanned_at: new Date().toISOString(), kind, framework, package_name: pkg?.name, dev_command: devCommand(root, pkg, files),
    default_port: await configuredPort(root, kind, pkg, port), static_builds: staticBuilds, screens: ordered, notices, entries, truncated, fingerprint };
}
