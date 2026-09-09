import { z } from "zod";
import type { DesignReview, RetrievalProvenance } from "./model.js";

export const GAP_IMAGE_LIMIT = 10 * 1024 * 1024;
export const GAP_CLASSIFICATIONS = ["missing_decision", "weak_guidance", "retrieval_relationship", "conflicting_guidance", "implementation_violation", "project_specific", "insufficient_evidence"] as const;
export const gapClassificationLabels: Record<typeof GAP_CLASSIFICATIONS[number], string> = {
  missing_decision: "Missing design decision", weak_guidance: "Existing guidance too weak",
  retrieval_relationship: "Retrieval / relationship problem", conflicting_guidance: "Conflicting guidance",
  implementation_violation: "Implementation violation already covered", project_specific: "Project-specific / keep local",
  insufficient_evidence: "Insufficient evidence",
};
const shortText = z.string().trim().max(300);
export const gapUsageSchema = z.object({
  id: shortText.optional(), location: shortText.optional(), kind: z.enum(["style", "token", "component", "contrast"]),
  property: shortText.optional(), value: shortText.optional(), token: shortText.optional(), component: shortText.optional(),
  foreground: shortText.optional(), background: shortText.optional(), usage: z.enum(["text", "non-text", "decorative"]).optional(),
}).strict();
export const gapInputSchema = z.object({
  problem: z.string().trim().min(1, "Describe what went wrong.").max(6000),
  context: z.string().trim().max(4000).default(""), expected: z.string().trim().max(4000).default(""),
  notes: z.string().trim().max(6000).default(""), original_query: z.string().trim().max(500).default(""),
  delivered_guidance: z.string().trim().max(12000).default(""),
  theme_id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).optional(), mode: z.enum(["light", "dark"]).optional(),
  usages: z.array(gapUsageSchema).max(200).default([]),
  image: z.object({ data_url: z.string().max(Math.ceil(GAP_IMAGE_LIMIT * 4 / 3) + 100), filename: shortText }).strict().optional(),
}).strict();
export type GapInput = z.input<typeof gapInputSchema>;
export type GapReport = Omit<z.output<typeof gapInputSchema>, "image">;
export interface GapImage { media_type: "image/png" | "image/jpeg" | "image/webp"; filename: string; bytes: number }
export interface GapRecordLink { key: string; title: string; route: string }
export interface GapFinding {
  classification: typeof GAP_CLASSIFICATIONS[number]; conclusion: string; reasoning: string;
  evidence_ids: string[]; record_keys: string[]; uncertainty: string[]; next_action: string;
  source: "deterministic" | "ai";
  check?: string;
  basis?: "monet_rule" | "wcag_floor";
  contradiction?: boolean;
}
export interface GapDiagnosis {
  version: 1; created_at: string; workspace_fingerprint: string;
  conclusion: string; findings: GapFinding[];
  /** AI prose never replaces a measured error headline. Optional for saved V1 records. */
  interpretation?: string;
  contradiction?: boolean;
  image_observations?: string[];
  evidence: { id: string; description: string }[]; records: GapRecordLink[];
  retrieval: { query: string; coverage: string; provenance: RetrievalProvenance[]; notices: string[] };
  conformance: DesignReview; knowledge_count: number;
  ai: { status: "complete" | "unavailable" | "failed"; message: string };
  image_status: "not_supplied" | "not_inspected" | "provider_reported_inspected";
  limitations: string[];
}
export const GAP_REVIEW_CLASSIFICATIONS = ["missing_decision", "weak_guidance", "conflicting_guidance", "retrieval_relationship"] as const;
/**
 * A person's own classification of a diagnosed Gap, with required record citations. This is the
 * eligibility path when no AI provider is configured: the deterministic diagnosis cannot classify
 * a Gap as missing or weak guidance, so a reviewer states it and cites the records concerned.
 */
export const gapReviewInputSchema = z.object({
  classification: z.enum(GAP_REVIEW_CLASSIFICATIONS),
  conclusion: z.string().trim().min(1, "State what the review concluded.").max(2000),
  reasoning: z.string().trim().max(6000).default(""),
  record_keys: z.array(z.string().trim().min(1).max(200)).min(1, "Cite at least one Monet record.").max(10),
  /** Required to be true when the diagnosis measured conformance errors: the reviewer confirms they are not excusing them. */
  acknowledges_measured_errors: z.boolean().default(false),
}).strict();
export type GapReviewInput = z.input<typeof gapReviewInputSchema>;
export interface GapHumanReview extends z.output<typeof gapReviewInputSchema> {
  created_at: string;
  /** The diagnosis this review classified; a later diagnosis makes the review inert. */
  diagnosis_created_at: string;
  workspace_fingerprint: string;
}
/** Editor-only feedback. Deliberately not part of Workspace or DesignContext. */
export interface Gap {
  version: 1; id: string; created_at: string; report: GapReport; image: GapImage | null;
  diagnosis: GapDiagnosis | null;
  /** Optional human review of the latest diagnosis. Absent on V1 records. */
  review?: GapHumanReview | null;
}
export type GapSummary = Pick<Gap, "id" | "created_at" | "image"> & { problem: string; context: string; diagnosed: boolean };
/** A failed retry is returned separately and never written over a successful diagnosis. */
export type GapDiagnosisResponse = Gap & { failed_retry?: GapDiagnosis };
