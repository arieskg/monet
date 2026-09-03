import type { ComponentDecision, Foundation, MarkdownDocument, PrimitiveDecision, Principle, Reference, ReferenceCollectionAnalysis, Source, TaxonomyCategory, Theme, ThemeMode, Workspace } from "./domain";

export interface ReferenceSaveInput extends Reference { asset_data_url?: string; asset_filename?: string }

export interface SourceRefreshResult { source: Source; discovered: number; mapped: number; needs_review: number; unmapped: number }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const value = await response.json() as { error?: string };
  if (!response.ok) throw new Error(value.error ?? `Request failed (${response.status}).`);
  return value as T;
}

export const api = {
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
