import { z } from "zod";
import type { ProfileOwned } from "./profiles.js";
import type { ThemeMode } from "./model.js";
import type { SurfacePreview } from "./surfaces.js";

/**
 * Local Project Connection (Surfaces V1.1): editor-only contracts for connecting a local project
 * directory to a Profile, discovering its screens deterministically, and capturing one screen in an
 * isolated browser into the existing static Surface import. Nothing here reads files or runs code.
 */
export const PROJECT_LIMITS = { entries: 6000, depth: 12, screens: 200, sourceFiles: 400, sourceBytes: 96 * 1024, packageBytes: 256 * 1024, hints: 12, hintLength: 80, captureSeconds: 60, ledger: 4, ledgerMs: 15 * 60 * 1000, directories: 300 } as const;
export const PROJECT_KINDS = ["static", "vite", "next", "astro", "sveltekit", "nuxt", "node"] as const;
export type ProjectKind = typeof PROJECT_KINDS[number];
export const CAPTURE_STRATEGIES = ["auto", "stylesheet", "computed"] as const;
export type CaptureStrategy = typeof CAPTURE_STRATEGIES[number];
export const CAPTURE_PRESETS = [{ label: "Desktop 1280 × 900", width: 1280, height: 900 }, { label: "Laptop 1440 × 900", width: 1440, height: 900 }, { label: "Tablet 768 × 1024", width: 768, height: 1024 }, { label: "Phone 390 × 844", width: 390, height: 844 }] as const;

export interface ProjectScreen {
  id: string; label: string; route: string; source: string;
  kind: "static_file" | "route" | "dynamic_route"; parameters: string[]; hints: string[];
  /** Provider-suggested interpretation, validated against this inventory. Never used for identity. */
  ai_label?: string; ai_summary?: string;
}
export interface ProjectInventory {
  version: 1; scanned_at: string; kind: ProjectKind; framework: string; package_name?: string;
  dev_command?: string; default_port?: number; static_builds: string[]; screens: ProjectScreen[];
  notices: string[]; entries: number; truncated: boolean; fingerprint: string;
  ai?: { status: "complete" | "failed"; interpreted_at: string; message: string };
}
export type ProjectCaptureSource = { kind: "dev_server"; base_url: string } | { kind: "static"; directory: string };
export interface ProjectRecord extends ProfileOwned {
  version: 1; id: string; name: string; root: string; binding_revision: number; created_at: string; updated_at: string;
  inventory: ProjectInventory; capture_defaults: { base_url?: string; width: number; height: number; mode: ThemeMode; strategy: CaptureStrategy };
}
export interface ProjectSummary { id: string; name: string; root: string; kind: ProjectKind; framework: string; screens: number; scanned_at: string; created_at: string }
export interface ScreenMatch { screen_id: string; score: number; reasons: string[] }
export interface ScreenFinderResult {
  query: string; deterministic: ScreenMatch[];
  ai: { status: "complete" | "unavailable" | "failed" | "not_requested"; message: string; matches: { screen_id: string; confidence: "high" | "medium" | "low"; reason: string }[] };
}
/** Server-attested provenance of a captured Surface. The client never supplies it. */
export interface SurfaceCapture {
  project_id: string; binding_revision: number; project_name: string; screen_id: string; screen_label: string; route: string;
  source: ProjectCaptureSource; strategy: "stylesheet" | "computed"; captured_at: string; width: number; height: number; mode: ThemeMode;
  browser: string; blocked: { host: string; count: number }[]; warnings: string[];
}
export interface ProjectCaptureResult { capture_id: string; expires_at: string; capture: SurfaceCapture; preview: SurfacePreview; fidelity: { html_bytes: number; css_bytes: number; assets: number; rules: number; rules_removed: number } }
export interface ProjectConnectionCheck { base_url: string; reachable: boolean; status?: number; server?: string; message: string }
export interface DirectoryListing { path: string; parent: string | null; home: string; entries: { name: string; path: string }[]; truncated: boolean }

const text = z.string().trim().max(300);
export const projectConnectSchema = z.object({ name: text.max(100).optional(), root: z.string().trim().min(1).max(1024) }).strict();
export const projectSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dev_server"), base_url: z.string().trim().min(1).max(200) }).strict(),
  z.object({ kind: z.literal("static"), directory: z.string().max(200) }).strict(),
]);
export const projectCaptureSchema = z.object({
  screen_id: text.min(1), route: z.string().trim().max(500).optional(), source: projectSourceSchema,
  width: z.number().int().min(240).max(1920).default(1280), height: z.number().int().min(240).max(2160).default(900),
  mode: z.enum(["light", "dark"]).default("light"), strategy: z.enum(CAPTURE_STRATEGIES).default("auto"),
  title: text.optional(), context: z.string().max(2000).optional(),
}).strict();
export const projectFinderSchema = z.object({ query: z.string().trim().min(1).max(300), ai: z.boolean().default(false) }).strict();
export const projectConnectionCheckSchema = z.object({ base_url: z.string().trim().min(1).max(200) }).strict();

const STOP = new Set(["the", "a", "an", "of", "to", "me", "my", "show", "find", "open", "page", "screen", "view", "for", "in", "on", "and", "with", "where", "is", "that", "this", "it", "i"]);
/** Lower-case word tokens; camelCase, kebab-case and path separators split. */
export function tokenize(value: string): string[] {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
}
const singular = (token: string) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
function fieldScore(query: string[], field: string[]): number {
  let score = 0;
  for (const q of query) {
    const s = singular(q);
    if (field.some((f) => singular(f) === s)) score += 1;
    else if (s.length >= 3 && field.some((f) => f.startsWith(s) || s.startsWith(f) && f.length >= 3)) score += 0.5;
  }
  return score;
}
/** Deterministic ranking over route, labels, source name and extracted text hints. No provider involved. */
export function matchScreens(screens: readonly ProjectScreen[], rawQuery: string): ScreenMatch[] {
  const query = tokenize(rawQuery);
  if (!query.length) return [];
  const matches: ScreenMatch[] = [];
  for (const screen of screens) {
    const fields: [name: string, weight: number, tokens: string[]][] = [
      ["route", 3, tokenize(screen.route)], ["label", 3, tokenize(screen.label)], ["source", 2, tokenize(screen.source.split("/").pop() ?? "")],
      ["AI label", 2, tokenize(`${screen.ai_label ?? ""} ${screen.ai_summary ?? ""}`)], ["text", 1, tokenize(screen.hints.join(" "))],
    ];
    let score = 0; const reasons: string[] = [];
    for (const [name, weight, tokens] of fields) { const s = fieldScore(query, tokens); if (s > 0) { score += s * weight; reasons.push(`${name} matches`); } }
    if (score > 0) matches.push({ screen_id: screen.id, score: Math.round(score * 100) / 100, reasons });
  }
  return matches.sort((a, b) => b.score - a.score || a.screen_id.localeCompare(b.screen_id)).slice(0, 10);
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** Capture targets are loopback HTTP origins only. Never a remote host, another scheme, or a credentialed URL. */
export function loopbackOrigin(baseUrl: string): { origin: string; hostname: string; port: number } {
  let url: URL;
  try { url = new URL(baseUrl.trim()); } catch { throw new Error("Enter a local URL such as http://127.0.0.1:5173."); }
  if (url.protocol !== "http:" || url.username || url.password) throw new Error("Capture sources must be plain http:// loopback URLs without credentials.");
  if (!LOOPBACK.has(url.hostname)) throw new Error("Capture sources must be loopback hosts (127.0.0.1, localhost or [::1]). Remote hosts are never captured.");
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Capture source port is invalid.");
  return { origin: `http://${url.hostname}:${port}`, hostname: url.hostname, port };
}
/** Requests the capture browser may make: the same loopback port over http/ws (dev-server HMR), plus inline data. Everything else is blocked. */
export function captureRequestAllowed(candidate: string, port: number): boolean {
  if (/^(data|blob|about):/i.test(candidate)) return true;
  try {
    const url = new URL(candidate);
    return (url.protocol === "http:" || url.protocol === "ws:") && LOOPBACK.has(url.hostname) && Number(url.port || 80) === port;
  } catch { return false; }
}
export function humanizeRoute(route: string): string {
  const segments = route.split("/").filter((s) => s && !s.startsWith(":") && !s.startsWith("*"));
  if (!segments.length) return "Home";
  const last = segments[segments.length - 1]!.replace(/\.[a-z0-9]+$/i, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").trim();
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : "Home";
}
