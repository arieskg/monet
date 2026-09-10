import { projectEvidenceSchema, type ProjectEvidenceBinding, type ProfileOwned } from "./profiles.js";
import { z } from "zod";
import type { DesignReview, ResolvedThemeToken, ThemeMode, TokenType } from "./model.js";
import { normalizeColour, normalizeDimension } from "./review.js";

export const SURFACE_VERSION = 1;
export const SURFACE_BODY_LIMIT = 16 * 1024 * 1024;
export const SURFACE_LIMITS = { html: 300_000, css: 300_000, nodes: 4000, depth: 48, declarations: 2000, assets: 24, imageBytes: 3 * 1024 * 1024, pixels: 12_000_000, revisions: 20 } as const;
const text = z.string().trim().max(300);
const image = z.object({ filename: text.min(1), data_url: z.string().max(4 * 1024 * 1024 + 100) }).strict();
export const surfaceInputSchema = z.object({
  title: text.min(1), context: z.string().max(2000).default(""),
  html: z.string().min(1).max(SURFACE_LIMITS.html), css: z.string().max(SURFACE_LIMITS.css).default(""),
  width: z.number().int().min(240).max(1920).default(1280), height: z.number().int().min(240).max(2160).default(900),
  mode: z.enum(["light", "dark"]).default("light"),
  assets: z.array(image).max(SURFACE_LIMITS.assets).default([]), screenshot: image.optional(),
}).strict();
export const storedSurfaceInputSchema = surfaceInputSchema.extend({ html: z.string().min(1).max(12 * 1024 * 1024) });
export type SurfaceInput = z.input<typeof surfaceInputSchema>;
export type NormalizedSurfaceInput = z.output<typeof surfaceInputSchema>;
export const surfaceMappingSchema = z.object({ declaration_id: text.min(1), token: text.min(1) }).strict();
export type SurfaceMapping = z.infer<typeof surfaceMappingSchema>;
export const surfaceSelectionSchema = z.object({
  profile_id: z.string().uuid().optional(), project: projectEvidenceSchema.optional(),
  mappings: z.array(surfaceMappingSchema).max(SURFACE_LIMITS.declarations).default([]),
  theme_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).optional(), mode: z.enum(["light", "dark"]).default("light"),
}).strict();
export type SurfaceSelection = z.input<typeof surfaceSelectionSchema>;
export const surfaceImportSchema = z.object({ input: surfaceInputSchema, selection: surfaceSelectionSchema.default({ mappings: [], mode: "light" }) }).strict();
export const surfaceRevisionSchema = z.object({ expected_revision: z.number().int().min(1), selection: surfaceSelectionSchema }).strict();
export interface SurfaceIssue { id: string; kind: "removed" | "unsupported" | "missing_asset" | "unmapped" | "ambiguous" | "invalid_mapping"; location: string; detail: string; count?: number }
export interface SurfaceDeclaration { id: string; location: string; property: string; value: string; important: boolean; mappable: boolean }
export interface SurfaceSnapshot { version: 1; hash: string; input: NormalizedSurfaceInput; issues: SurfaceIssue[] }
export interface SurfaceBinding extends SurfaceMapping { value: string }
export interface SurfaceRun extends ProfileOwned {
  revision: number; created_at: string; run_hash: string; snapshot_hash: string; workspace_fingerprint: string;
  project?: ProjectEvidenceBinding;
  theme_id?: string; mode: ThemeMode; requested_mode: ThemeMode; mappings: SurfaceMapping[]; bindings: SurfaceBinding[];
  issues: SurfaceIssue[]; review: DesignReview;
}
export interface SurfaceRecord extends ProfileOwned { version: 1; id: string; created_at: string; snapshot: SurfaceSnapshot; runs: SurfaceRun[] }
export interface SurfacePreview {
  snapshot: SurfaceSnapshot; run: SurfaceRun; original: string; applied: string;
  declarations: SurfaceDeclaration[]; candidates: Record<string, string[]>;
  tokens: { name: string; value: string; type: TokenType; foundation: string }[];
  stale: boolean; saved?: { id: string; revision: number; revisions: number[] };
}
export interface SurfaceSummary { id: string; title: string; created_at: string; revision: number }
export const surfaceGapSchema = z.object({
  revision: z.number().int().min(1), problem: z.string().trim().min(1).max(4000), expected: z.string().max(2000).default(""),
  issue_ids: z.array(text).min(1).max(8), include_screenshot: z.boolean().default(false),
}).strict();

/** Conservative families: dimension layout rules remain intact and never become spacing mappings. */
export function mappingFamily(property: string): "color" | "spacing" | "radius" | "typography" | "shadow" | "variable" | null {
  if (property.startsWith("--")) return "variable";
  if (/^(color|background-color|border(?:-(?:top|right|bottom|left))?-color|outline-color|text-decoration-color|caret-color|accent-color)$/.test(property)) return "color";
  if (/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/.test(property) || /^(gap|row-gap|column-gap)$/.test(property)) return "spacing";
  if (/^border(?:-(top|bottom)-(left|right))?-radius$/.test(property)) return "radius";
  if (/^(font-size|font-family|font-weight|line-height|letter-spacing)$/.test(property)) return "typography";
  return property === "box-shadow" ? "shadow" : null;
}
export function compatibleToken(property: string, token: Pick<ResolvedThemeToken, "type" | "foundation">): boolean {
  const family = mappingFamily(property);
  if (family === "variable") return ["color", "dimension", "font-family", "font-size", "font-weight", "number", "shadow"].includes(token.type);
  if (family === "color") return token.type === "color";
  if (family === "spacing" || family === "radius") return token.type === "dimension" && token.foundation === family;
  if (family === "typography") return property === "font-family" ? token.type === "font-family" : property === "font-weight" ? token.type === "font-weight" : ["dimension", "font-size", "number"].includes(token.type) && token.foundation === "typography";
  return family === "shadow" && token.type === "shadow";
}
export function equalStyleValue(left: string, right: string): boolean {
  const a = normalizeColour(left), b = normalizeColour(right);
  if (a && b) return a === b;
  const x = normalizeDimension(left), y = normalizeDimension(right);
  if (x && y) return x.amount === y.amount && x.unit === y.unit;
  return left.trim() === right.trim();
}
