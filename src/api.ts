import type { ComponentDecision, Foundation, MarkdownDocument, PrimitiveDecision, Principle, Reference, ReferenceCollectionAnalysis, Source, TaxonomyCategory, Theme, ThemeMode, Workspace } from "./domain";
import type { Gap, GapDiagnosisResponse, GapInput, GapReviewInput, GapSummary } from "../shared/gaps";
import type { ApplicationReceipt, ApplyErrorKind, ApplyPlan, ApplyResult, GapProposalOverview, ProposalDraftResponse, ProposalRevisionInput, ProposalSummary, ProposalView } from "../shared/proposals";

import type { SurfaceInput, SurfaceSelection, SurfacePreview, SurfaceSummary } from "../shared/surfaces";

export interface ReferenceSaveInput extends Reference { asset_data_url?: string; asset_filename?: string }

export interface SourceRefreshResult { source: Source; discovered: number; mapped: number; needs_review: number; unmapped: number }

/** Facts about the running installation that the workspace records themselves do not carry. */
export interface Environment { root: string; appRoot: string; bundled: boolean; aiConfigured: boolean; aiVariable: string; aiImages?: boolean }

/** A failed request. An Apply refusal or rollback also says which gate refused it and carries the receipt, when writing had started. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public kind?: ApplyErrorKind | "refresh_failed", public receipt: ApplicationReceipt | null = null) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const value = await response.json() as { error?: string; kind?: ApplyErrorKind; receipt?: ApplicationReceipt | null };
  if (!response.ok) throw new ApiError(value.error ?? `Request failed (${response.status}).`, response.status, value.kind, value.receipt ?? null);
  return value as T;
}

export const api = {
  surfaces: () => request<SurfaceSummary[]>("/api/surfaces"),
  surface: (id: string, revision?: number) => request<SurfacePreview>(`/api/surfaces/${encodeURIComponent(id)}${revision ? `?revision=${revision}` : ""}`),
  previewSurface: (input: SurfaceInput, selection: SurfaceSelection) => request<SurfacePreview>("/api/surface-previews", { method: "POST", body: JSON.stringify({ input, selection }) }),
  saveSurface: (input: SurfaceInput, selection: SurfaceSelection) => request<SurfacePreview>("/api/surfaces", { method: "POST", body: JSON.stringify({ input, selection }) }),
  reviseSurface: (id: string, expected_revision: number, selection: SurfaceSelection, save: boolean) => request<SurfacePreview>(`/api/${save ? "surface-revisions" : "surface-previews"}/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ expected_revision, selection }) }),
  deleteSurface: (id: string) => request<{ ok: boolean }>("/api/surfaces/" + encodeURIComponent(id), { method: "DELETE" }),
  surfaceGap: (id: string, value: { revision: number; problem: string; expected: string; issue_ids: string[]; include_screenshot: boolean }) => request<Gap>("/api/surface-gaps/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  gaps: () => request<GapSummary[]>("/api/gaps"),
  gap: (id: string) => request<Gap>("/api/gaps/" + encodeURIComponent(id)),
  createGap: (value: GapInput) => request<Gap>("/api/gaps", { method: "POST", body: JSON.stringify(value) }),
  diagnoseGap: (id: string) => request<GapDiagnosisResponse>("/api/gap-diagnoses/" + encodeURIComponent(id), { method: "POST" }),
  deleteGap: (id: string) => request<{ ok: boolean }>("/api/gaps/" + encodeURIComponent(id), { method: "DELETE" }),
  saveGapReview: (id: string, value: GapReviewInput) => request<Gap>("/api/gap-reviews/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  gapImageUrl: (id: string) => "/api/gap-images/" + encodeURIComponent(id),
  // Proposals review and approve typed change sets; none of these routes writes a canonical record.
  proposals: (gapId?: string) => request<ProposalSummary[]>(`/api/proposals${gapId ? `?gap=${encodeURIComponent(gapId)}` : ""}`),
  gapProposals: (gapId: string) => request<GapProposalOverview>("/api/gap-proposals/" + encodeURIComponent(gapId)),
  proposal: (id: string) => request<ProposalView>("/api/proposals/" + encodeURIComponent(id)),
  createProposal: (gapId: string) => request<ProposalView>("/api/proposals", { method: "POST", body: JSON.stringify({ gap_id: gapId }) }),
  saveProposalRevision: (id: string, value: ProposalRevisionInput) => request<ProposalView>("/api/proposal-revisions/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  draftProposal: (id: string) => request<ProposalDraftResponse>("/api/proposal-drafts/" + encodeURIComponent(id), { method: "POST", body: "{}" }),
  approveProposal: (id: string, value: { revision: number; hash: string; note: string }) => request<ProposalView>("/api/proposal-approvals/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  rejectProposal: (id: string, reason: string) => request<ProposalView>("/api/proposal-rejections/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify({ reason }) }),
  supersedeProposal: (id: string) => request<ProposalView>("/api/proposal-supersessions/" + encodeURIComponent(id), { method: "POST", body: "{}" }),
  rebaseProposal: (id: string) => request<ProposalView>("/api/proposal-rebases/" + encodeURIComponent(id), { method: "POST", body: "{}" }),
  // Apply is the one route that writes canonical records: only an approved revision named by number and hash, through a journaled transaction.
  applyPlan: (id: string) => request<ApplyPlan>("/api/proposal-applications/" + encodeURIComponent(id)),
  applyProposal: (id: string, value: { revision: number; hash: string }) => request<ApplyResult>("/api/proposal-applications/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  applications: () => request<ApplicationReceipt[]>("/api/applications"),
  environment: () => request<Environment>("/api/environment"),
  workspace: (themeId?: string, mode?: ThemeMode) => {
    const params = new URLSearchParams();
    if (themeId) params.set("theme", themeId);
    if (mode) params.set("mode", mode);
    const query = params.toString();
    return request<Workspace>(`/api/workspace${query ? `?${query}` : ""}`);
  },
  savePrinciple: (value: Principle) => request("/api/principles/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  deletePrinciple: (id: string) => request("/api/principles/" + encodeURIComponent(id), { method: "DELETE" }),
  savePattern: (value: MarkdownDocument) => request("/api/patterns/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  deletePattern: (id: string) => request("/api/patterns/" + encodeURIComponent(id), { method: "DELETE" }),
  saveFoundation: (value: Foundation) => request("/api/foundations/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  savePrimitive: (value: PrimitiveDecision) => request("/api/primitives/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  savePrimitiveTaxonomy: (value: TaxonomyCategory[]) => request("/api/primitive-taxonomy", { method: "PUT", body: JSON.stringify(value) }),
  mergePrimitive: (source: string, target: string) => request("/api/primitive-merges/" + encodeURIComponent(source), { method: "POST", body: JSON.stringify({ target }) }),
  saveComponent: (value: ComponentDecision) => request("/api/components/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  saveTheme: (value: Theme) => request<Theme>("/api/themes/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  duplicateTheme: (id: string, name?: string) => request<Theme>("/api/theme-duplicates/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify({ name }) }),
  deleteTheme: (id: string) => request("/api/themes/" + encodeURIComponent(id), { method: "DELETE" }),
  setDefaultTheme: (id: string) => request("/api/default-theme", { method: "POST", body: JSON.stringify({ id }) }),
  saveSource: (value: Source) => request("/api/sources/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  refreshSource: (id: string) => request<SourceRefreshResult>("/api/source-refreshes/" + encodeURIComponent(id), { method: "POST" }),
  deleteSource: (id: string) => request("/api/sources/" + encodeURIComponent(id), { method: "DELETE" }),
  saveReference: (value: ReferenceSaveInput) => request<Reference>("/api/references/" + encodeURIComponent(value.id), { method: "PUT", body: JSON.stringify(value) }),
  analyzeReference: (id: string) => request<Reference>("/api/reference-analyses/" + encodeURIComponent(id), { method: "POST" }),
  deleteReference: (id: string) => request("/api/references/" + encodeURIComponent(id), { method: "DELETE" }),
  analyzeReferences: () => request<ReferenceCollectionAnalysis>("/api/reference-collection-analysis", { method: "POST" }),
  saveReferenceAnalysis: (value: ReferenceCollectionAnalysis) => request<ReferenceCollectionAnalysis>("/api/reference-collection-analysis", { method: "PUT", body: JSON.stringify(value) }),
  referenceAssetUrl: (id: string) => "/api/reference-assets/" + encodeURIComponent(id),
};
