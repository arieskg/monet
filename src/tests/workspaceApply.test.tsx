// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyComponentDecision, type ApplyResult } from "../../shared/proposals";
import type { Workspace } from "../domain";
import { api, ApiError } from "../api";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceContext";
import { Layout } from "../components/Layout";
import { ComponentsPage } from "../pages/ComponentsPage";
import { DecisionsPage } from "../pages/DecisionsPage";

function workspace(notes: string, updated_at: string, withPattern = false): Workspace {
  return { principles: [], foundations: [], taxonomy: [{ id: "actions", name: "Actions", entries: [{ id: "button", name: "Button", category: "actions", description: "An action", aliases: [], relationships: [] }] }], primitiveTaxonomy: [], primitives: [], components: [{ ...emptyComponentDecision("button"), notes, updated_at }], patterns: withPattern ? [{ id: "card-actions", title: "Card actions", summary: "Visible actions", body: "Use clear actions.", status: "experimental", tags: [], order: 0, updated_at }] : [], sources: [], references: [], referenceAnalysis: { summary: "", recurring_preferences: [], suggestions: [], analyzed_at: "" }, decisionLog: [], themes: [], defaultThemeId: "default", activeThemeId: "default", activeMode: "light", modes: ["light"], baseResolvedTokens: [], resolvedTokens: [], tokenIssues: [], filesRoot: "/test/workspace" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const before = workspace("Before Apply", "before");
const after = workspace("After Apply", "after", true);
const result = { outcome: "applied", receipt: null, proposal: { status: "applied" } } as ApplyResult;
let state: ReturnType<typeof useWorkspace>;
let root: Root;
let container: HTMLDivElement;
function Probe() { state = useWorkspace(); return null; }
async function renderUpdate(work: () => void) {
  await act(async () => { work(); await Promise.resolve(); });
}
async function mount(route = "/components/button") {
  await renderUpdate(() => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={[route]}><WorkspaceProvider><Probe /><Routes><Route element={<Layout />}><Route path="/components/:id" element={<ComponentsPage />} /><Route path="/decisions" element={<DecisionsPage />} /></Route></Routes></WorkspaceProvider></MemoryRouter>);
  });
}
const notesEditor = () => container.querySelector<HTMLTextAreaElement>(".component-notes textarea");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  vi.spyOn(api, "workspace").mockResolvedValue(before);
  vi.spyOn(api, "environment").mockResolvedValue({ root: "/test", appRoot: "/app", bundled: false, aiConfigured: false, aiImages: false, aiVariable: "MONET_AI_COMMAND" });
  vi.spyOn(api, "applyProposal").mockResolvedValue(result);
  vi.spyOn(api, "saveComponent").mockResolvedValue({ ok: true });
});
afterEach(async () => { if (root) await renderUpdate(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Apply workspace refresh barrier", () => {
  it("keeps editors closed until WorkspaceContext contains the applied records, then saves the refreshed version", async () => {
    await mount();
    expect(notesEditor()?.value).toBe("Before Apply");
    const application = deferred<ApplyResult>();
    const refresh = deferred<Workspace>();
    vi.mocked(api.applyProposal).mockReturnValueOnce(application.promise);
    vi.mocked(api.workspace).mockReturnValueOnce(refresh.promise);
    let pending!: Promise<ApplyResult>;
    let finished = false;
    await renderUpdate(() => { pending = state.applyApprovedProposal("proposal", { revision: 1, hash: "a".repeat(64) }).then((value) => { finished = true; return value; }); });
    expect(state.editingBlocked).toBe(true);
    expect(state.workspace).toBeNull();
    expect(notesEditor()).toBeNull();
    await renderUpdate(() => { application.resolve(result); });
    expect(api.workspace).toHaveBeenCalledTimes(2);
    expect(finished).toBe(false);
    expect(notesEditor()).toBeNull();
    await act(async () => { refresh.resolve(after); await pending; });
    expect(state.editingBlocked).toBe(false);
    expect(state.workspace?.patterns.map((pattern) => pattern.id)).toContain("card-actions");
    expect(notesEditor()?.value).toBe("After Apply");
    vi.mocked(api.workspace).mockResolvedValue(after);
    await renderUpdate(() => { container.querySelector<HTMLButtonElement>(".save-decision-button")!.click(); });
    expect(api.saveComponent).toHaveBeenCalledWith(expect.objectContaining({ updated_at: "after", notes: "After Apply" }));
  });

  it("keeps editing blocked if the successful application cannot be refreshed, and supports retry", async () => {
    await mount();
    vi.mocked(api.workspace).mockRejectedValueOnce(new Error("Refresh unavailable"));
    await act(async () => { await expect(state.applyApprovedProposal("proposal", { revision: 1, hash: "a".repeat(64) })).rejects.toMatchObject({ kind: "write_failed" }); });
    expect(state.editingBlocked).toBe(true);
    expect(state.workspace).toBeNull();
    expect(notesEditor()).toBeNull();
    expect(container.textContent).toContain("Refresh unavailable");
    vi.mocked(api.workspace).mockResolvedValueOnce(after);
    await act(async () => { await state.reload(); });
    expect(state.editingBlocked).toBe(false);
    expect(notesEditor()?.value).toBe("After Apply");
  });

  it("discards an older workspace response that arrives after the Apply refresh", async () => {
    const oldRead = deferred<Workspace>();
    vi.mocked(api.workspace).mockReturnValueOnce(oldRead.promise).mockResolvedValue(after);
    await mount();
    await act(async () => { await state.applyApprovedProposal("proposal", { revision: 1, hash: "a".repeat(64) }); });
    expect(state.workspace).toEqual(after);
    await renderUpdate(() => { oldRead.resolve(before); });
    expect(state.workspace).toEqual(after);
    expect(notesEditor()?.value).toBe("After Apply");
  });

  it.each([false, true])("only resumes editing after a failed Apply if a safe workspace can be loaded (recovery blocked=%s)", async (blocked) => {
    await mount();
    const failure = new ApiError("Application failed", blocked ? 503 : 500, "write_failed");
    vi.mocked(api.applyProposal).mockRejectedValueOnce(failure);
    if (blocked) vi.mocked(api.workspace).mockRejectedValueOnce(new Error("Recovery required"));
    await act(async () => { await expect(state.applyApprovedProposal("proposal", { revision: 1, hash: "a".repeat(64) })).rejects.toBe(failure); });
    expect(state.editingBlocked).toBe(blocked);
    expect(notesEditor()?.value).toBe(blocked ? undefined : "Before Apply");
  });

  it("shows receipt-loading failures in the audit page and can retry", async () => {
    vi.spyOn(api, "applications").mockRejectedValueOnce(new Error("Unreadable receipt")).mockResolvedValue([]);
    await mount("/decisions");
    expect(container.textContent).toContain("Could not load application receipts: ");
    expect(container.textContent).toContain("Unreadable receipt");
    await renderUpdate(() => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Retry")!.click(); });
    expect(api.applications).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("Unreadable receipt");
  });
});
