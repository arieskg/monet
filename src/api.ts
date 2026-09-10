import type { ProfileIdentity, ProfileLibrary, ProfileRegistration } from "../shared/profiles";
import type { ComponentDecision, Foundation, MarkdownDocument, PrimitiveDecision, Principle, Reference, ReferenceCollectionAnalysis, Source, TaxonomyCategory, Theme, ThemeMode, Workspace } from "./domain";
import type { Gap, GapDiagnosisResponse, GapInput, GapReviewInput, GapSummary } from "../shared/gaps";
import type { ApplicationReceipt, ApplyErrorKind, ApplyPlan, ApplyResult, GapProposalOverview, ProposalDraftResponse, ProposalRevisionInput, ProposalSummary, ProposalView } from "../shared/proposals";

import type { SurfaceInput, SurfaceSelection, SurfacePreview, SurfaceSummary } from "../shared/surfaces";
import type { DirectoryListing, ProjectCaptureResult, ProjectConnectionCheck, ProjectRecord, ProjectSummary, ScreenFinderResult } from "../shared/projects";

/** A manual import carries its input; a project capture carries only the server-held capture id. */
export type SurfaceImport = { input: SurfaceInput } | { capture_id: string; title?: string; context?: string };

export interface ReferenceSaveInput extends Reference { asset_data_url?: string; asset_filename?: string }

export interface SourceRefreshResult { source: Source; discovered: number; mapped: number; needs_review: number; unmapped: number }

/** Facts about the running installation that the workspace records themselves do not carry. */
export interface Environment { profile?: ProfileIdentity; root: string; appRoot: string; bundled: boolean; aiConfigured: boolean; aiVariable: string; aiImages?: boolean }

/** A failed request. An Apply refusal or rollback also says which gate refused it and carries the receipt, when writing had started. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public kind?: ApplyErrorKind | "refresh_failed", public receipt: ApplicationReceipt | null = null) { super(message); }
}

/** Each document has an immutable API binding. Switching uses a new document so stale closures
 * and pending promises cannot address, repopulate, or mutate the next Profile's UI. */
export function createProfileApi(profileId?: string) {
const scoped = (path: string) => profileId ? path.replace(/^\/api/, `/api/profiles/${encodeURIComponent(profileId)}`) : path;
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(scoped(path), { ...init, headers: { "content-type": "application/json", ...(profileId ? { "x-monet-profile": profileId } : {}), ...init?.headers } });
  if (profileId && response.headers.get("x-monet-profile") && response.headers.get("x-monet-profile") !== profileId) throw new ApiError("Response belongs to another Profile.", 409);
  const value = await response.json() as { error?: string; kind?: ApplyErrorKind; receipt?: ApplicationReceipt | null };
  if (!response.ok) throw new ApiError(value.error ?? `Request failed (${response.status}).`, response.status, value.kind, value.receipt ?? null);
  return value as T;
}

return {
  surfaces: () => request<SurfaceSummary[]>("/api/surfaces"),
  surface: (id: string, revision?: number) => request<SurfacePreview>(`/api/surfaces/${encodeURIComponent(id)}${revision ? `?revision=${revision}` : ""}`),
  previewSurface: (source: SurfaceImport, selection: SurfaceSelection) => request<SurfacePreview>("/api/surface-previews", { method: "POST", body: JSON.stringify({ ...source, selection }) }),
  saveSurface: (source: SurfaceImport, selection: SurfaceSelection) => request<SurfacePreview>("/api/surfaces", { method: "POST", body: JSON.stringify({ ...source, selection }) }),
  // Local projects: Profile-bound connections, deterministic discovery, optional AI interpretation and isolated capture.
  projects: () => request<ProjectSummary[]>("/api/projects"),
  project: (id: string) => request<ProjectRecord>("/api/projects/" + encodeURIComponent(id)),
  connectProject: (value: { root: string; name?: string }) => request<ProjectRecord>("/api/projects", { method: "POST", body: JSON.stringify(value) }),
  disconnectProject: (id: string) => request<{ ok: boolean }>("/api/projects/" + encodeURIComponent(id), { method: "DELETE" }),
  rescanProject: (id: string) => request<ProjectRecord>("/api/project-scans/" + encodeURIComponent(id), { method: "POST", body: "{}" }),
  interpretProject: (id: string) => request<ProjectRecord>("/api/project-interpretations/" + encodeURIComponent(id), { method: "POST", body: "{}" }),
  findScreens: (id: string, value: { query: string; ai: boolean }) => request<ScreenFinderResult>("/api/project-screen-finders/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  checkProjectConnection: (id: string, base_url: string) => request<ProjectConnectionCheck>("/api/project-connections/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify({ base_url }) }),
  captureScreen: (id: string, value: { screen_id: string; route?: string; source: { kind: "dev_server"; base_url: string } | { kind: "static"; directory: string }; width: number; height: number; mode: ThemeMode; strategy: "auto" | "stylesheet" | "computed" }) => request<ProjectCaptureResult>("/api/project-captures/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  reviseSurface: (id: string, expected_revision: number, selection: SurfaceSelection, save: boolean) => request<SurfacePreview>(`/api/${save ? "surface-revisions" : "surface-previews"}/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ expected_revision, selection }) }),
  deleteSurface: (id: string) => request<{ ok: boolean }>("/api/surfaces/" + encodeURIComponent(id), { method: "DELETE" }),
  surfaceGap: (id: string, value: { revision: number; problem: string; expected: string; issue_ids: string[]; include_screenshot: boolean }) => request<Gap>("/api/surface-gaps/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  gaps: () => request<GapSummary[]>("/api/gaps"),
  gap: (id: string) => request<Gap>("/api/gaps/" + encodeURIComponent(id)),
  createGap: (value: GapInput) => request<Gap>("/api/gaps", { method: "POST", body: JSON.stringify(value) }),
  diagnoseGap: (id: string) => request<GapDiagnosisResponse>("/api/gap-diagnoses/" + encodeURIComponent(id), { method: "POST" }),
  deleteGap: (id: string) => request<{ ok: boolean }>("/api/gaps/" + encodeURIComponent(id), { method: "DELETE" }),
  saveGapReview: (id: string, value: GapReviewInput) => request<Gap>("/api/gap-reviews/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify(value) }),
  gapImageUrl: (id: string) => scoped("/api/gap-images/" + encodeURIComponent(id)),
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
  referenceAssetUrl: (id: string) => scoped("/api/reference-assets/" + encodeURIComponent(id)),
};

}
export const api = createProfileApi(typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("profile") ?? undefined);
export const directoryApi = {
  async list(path?: string): Promise<DirectoryListing> {
    const response = await fetch(`/api/directories${path ? `?path=${encodeURIComponent(path)}` : ""}`);
    const value = await response.json() as DirectoryListing & { error?: string }; if (!response.ok) throw new Error(value.error ?? "Unable to list folders."); return value;
  },
};
export const profileApi = {
  async rename(id: string, name: string): Promise<void> {
    const response = await fetch(`/api/profile-names/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!response.ok) throw new Error("Unable to rename Profile.");
  },
  async list(): Promise<ProfileLibrary> { const response = await fetch("/api/profiles"); if (!response.ok) throw new Error("Unable to load Profiles."); return response.json() as Promise<ProfileLibrary>; },
  async create(input: { name: string; kind: "scratch" | "monet-starter" | "fork"; sourceProfileId?: string; includeReferences?: boolean }): Promise<ProfileRegistration> {
    const response = await fetch("/api/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json() as ProfileRegistration & { error?: string }; if (!response.ok) throw new Error(result.error ?? "Unable to create Profile."); return result;
  },
};
export function switchProfile(id: string): void { window.location.assign(`/?profile=${encodeURIComponent(id)}`); }
