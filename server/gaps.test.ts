import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GAP_IMAGE_LIMIT, gapInputSchema, type Gap } from "../shared/gaps.js";
import { createGap, deleteGap, decodeGapImage, diagnoseSavedGap, getGap, initializeStore, listGaps, loadWorkspace, readGapImage, regenerateExports } from "./fileStore.js";
import { diagnoseGap, gapKnowledge, gapAnalysisSchema } from "./gapDiagnosis.js";
import { runProvider, type ProviderTask } from "./aiProvider.js";
import { BUNDLED_WORKSPACE, setWorkspaceRoot } from "./workspace.js";

const faults = vi.hoisted(() => ({ rename: false }));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: async (from: string, to: string) => { if (faults.rename && to.includes("/gaps/")) throw new Error("Simulated disk failure"); await fs.rename(from, to); } };
});
vi.mock("./aiProvider.js", async (original) => ({ ...await original<typeof import("./aiProvider.js")>(), runProvider: vi.fn() }));

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOm0AAAAASUVORK5CYII=";
const image = { data_url: `data:image/png;base64,${png}`, filename: "product.png" };
const output = (): z.infer<typeof gapAnalysisSchema> => ({ conclusion: "More context is needed.", image_inspected: false, measured_errors: "not_assessed", findings: [{
  classification: "insufficient_evidence", conclusion: "The intended interaction is unclear.", reasoning: "The report alone does not establish the intended behavior.",
  evidence_ids: ["problem", "knowledge"], record_keys: [], uncertainty: ["Which state is affected?"], next_action: "Describe the expected resting and focused states.",
}] });
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-gaps-test-"));
  setWorkspaceRoot(directory);
  faults.rename = false;
  vi.stubEnv("MONET_AI_COMMAND", ""); vi.stubEnv("MONET_CODEX_EXECUTABLE", ""); vi.stubEnv("MONET_AI_IMAGES", "");
  vi.mocked(runProvider).mockReset();
});
afterEach(async () => { faults.rename = false; vi.unstubAllEnvs(); setWorkspaceRoot(BUNDLED_WORKSPACE); await rm(directory, { recursive: true, force: true }); });

describe("Gap capture and recovery", () => {
  it("reads missing Gaps as empty without writing, independently of canonical knowledge", async () => {
    expect(await listGaps()).toEqual([]);
    await loadWorkspace();
    expect(await readdir(directory)).toEqual([]);
  });

  it("persists the image and report together and reloads identical bytes without exposing base64", async () => {
    await initializeStore();
    const saved = await createGap({ problem: "Private product issue", context: "Private customer screen", image });
    expect(saved.diagnosis).toBeNull();
    expect(saved.image).toEqual({ filename: "product.png", media_type: "image/png", bytes: Buffer.from(png, "base64").length });
    expect(await getGap(saved.id)).toEqual(saved);
    expect((await readGapImage(saved.id)).contents).toEqual(Buffer.from(png, "base64"));
    expect(JSON.stringify(await listGaps())).not.toContain(png);
    expect(JSON.stringify(saved)).not.toContain(png);
    expect((await stat(path.join(directory, "gaps", `${saved.id}.json`))).mode & 0o777).toBe(0o600);
    expect((await readdir(path.join(directory, "gaps"))).length).toBe(1);
  });

  it("accepts nonvisual gaps but rejects blank reports, oversized input, client authority, and forged images", async () => {
    await initializeStore();
    expect((await createGap({ problem: "No guidance for font delivery" })).image).toBeNull();
    await expect(createGap({ problem: " " })).rejects.toThrow();
    await expect(createGap({ problem: "x", diagnosis: {} })).rejects.toThrow();
    await expect(createGap({ problem: "x", image: { data_url: "data:image/png;base64,PHNjcmlwdD4=", filename: "x.png" } })).rejects.toThrow(/contents/);
    expect(() => decodeGapImage("data:image/svg+xml;base64,PHN2Zz4=" )).toThrow(/PNG/);
    expect(() => decodeGapImage(`data:image/png;base64,${Buffer.alloc(GAP_IMAGE_LIMIT + 1).toString("base64")}`)).toThrow(/10 MB/);
    expect(gapInputSchema.safeParse({ problem: "x", usages: [{ kind: "unknown" }] }).success).toBe(false);
    expect(gapInputSchema.safeParse({ problem: "x", mode: "sepia" }).success).toBe(false);
  });

  it("rejects traversal and surfaces malformed Gap files instead of hiding them", async () => {
    await initializeStore();
    await expect(getGap("../principles/example")).rejects.toThrow(/Invalid record id/);
    await writeFile(path.join(directory, "gaps", "broken.json"), "{ invalid");
    await expect(listGaps()).rejects.toThrow();
  });

  it("saves deterministic review when AI is unavailable, then recovers from provider failure on retry", async () => {
    await initializeStore();
    const saved = await createGap({ problem: "Actions look unavailable", image });
    const offline = await diagnoseSavedGap(saved.id);
    expect(offline.diagnosis?.ai.status).toBe("unavailable");
    expect(offline.diagnosis?.image_status).toBe("not_inspected");
    expect(runProvider).not.toHaveBeenCalled();
    vi.stubEnv("MONET_AI_COMMAND", "configured-provider");
    vi.mocked(runProvider).mockRejectedValueOnce(new Error("timeout with private stderr"));
    expect((await diagnoseSavedGap(saved.id)).failed_retry?.ai.status).toBe("failed");
    expect((await getGap(saved.id)).diagnosis).toEqual(offline.diagnosis);
    expect((await getGap(saved.id)).report).toEqual(saved.report);
    expect((await readGapImage(saved.id)).contents).toEqual(Buffer.from(png, "base64"));
    expect(JSON.stringify(await getGap(saved.id))).not.toContain("private stderr");
    vi.mocked(runProvider).mockResolvedValueOnce(output());
    expect((await diagnoseSavedGap(saved.id)).diagnosis?.ai.status).toBe("complete");
    expect((await getGap(saved.id)).diagnosis?.findings[0]?.source).toBe("ai");
  });

  it("preserves a successful diagnosis byte-for-byte through failed and unavailable retries", async () => {
    await initializeStore(); vi.stubEnv("MONET_AI_COMMAND", "provider");
    const saved = await createGap({ problem: "Private report", image });
    vi.mocked(runProvider).mockResolvedValueOnce(output());
    const successful = await diagnoseSavedGap(saved.id);
    const file = path.join(directory, "gaps", `${saved.id}.json`);
    const before = await readFile(file);
    for (const failure of [new Error("private failure"), {}]) {
      if (failure instanceof Error) vi.mocked(runProvider).mockRejectedValueOnce(failure);
      else vi.mocked(runProvider).mockResolvedValueOnce(failure);
      const retry = await diagnoseSavedGap(saved.id);
      expect(retry.diagnosis).toEqual(successful.diagnosis);
      expect(retry.failed_retry?.ai.status).toBe("failed");
      expect(await readFile(file)).toEqual(before);
    }
    vi.stubEnv("MONET_AI_COMMAND", "");
    expect((await diagnoseSavedGap(saved.id)).failed_retry?.ai.status).toBe("unavailable");
    expect(await readFile(file)).toEqual(before);
  });

  it("persists a first failed diagnosis when no successful diagnosis exists", async () => {
    await initializeStore(); vi.stubEnv("MONET_AI_COMMAND", "provider");
    const saved = await createGap({ problem: "First analysis" });
    vi.mocked(runProvider).mockRejectedValue(new Error("private failure"));
    const result = await diagnoseSavedGap(saved.id);
    expect(result.failed_retry).toBeUndefined();
    expect(result.diagnosis?.ai.status).toBe("failed");
    expect((await getGap(saved.id)).diagnosis).toEqual(result.diagnosis);
  });

  it("deletes the report and embedded screenshot together", async () => {
    await initializeStore();
    const saved = await createGap({ problem: "Delete me", image });
    await deleteGap(saved.id);
    await expect(getGap(saved.id)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readGapImage(saved.id)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await listGaps()).toEqual([]);
    expect(await readdir(path.join(directory, "gaps"))).toEqual([]);
  });

  it("leaves reports, images, and existing diagnosis intact if the atomic replacement fails", async () => {
    await initializeStore();
    const saved = await createGap({ problem: "An existing report", image });
    await diagnoseSavedGap(saved.id);
    const before = await readFile(path.join(directory, "gaps", `${saved.id}.json`));
    faults.rename = true;
    await expect(diagnoseSavedGap(saved.id)).rejects.toThrow(/disk failure/);
    await expect(createGap({ problem: "Unsaved report", image })).rejects.toThrow(/disk failure/);
    expect(await readFile(path.join(directory, "gaps", `${saved.id}.json`))).toEqual(before);
    expect(await readdir(path.join(directory, "gaps"))).toEqual([`${saved.id}.json`]);
    faults.rename = false;
    expect((await diagnoseSavedGap(saved.id)).diagnosis).not.toBeNull();
  });

  it("keeps canonical records and exports unchanged, even after later export regeneration", async () => {
    await initializeStore();
    const before = await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8");
    const snapshot = await readFile(path.join(directory, "design-system.json"), "utf8");
    const saved = await createGap({ problem: "PRIVATE-CONTEXT-SECRET", image });
    await diagnoseSavedGap(saved.id);
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).toBe(before);
    expect(await readFile(path.join(directory, "design-system.json"), "utf8")).toBe(snapshot);
    expect(JSON.stringify(await loadWorkspace())).not.toContain("PRIVATE-CONTEXT-SECRET");
    await regenerateExports();
    expect(await readFile(path.join(directory, "design-system.json"), "utf8")).toBe(snapshot);
  });

  it("prevents overlapping diagnoses without leaving a durable stuck-running state", async () => {
    await initializeStore(); vi.stubEnv("MONET_AI_COMMAND", "provider");
    const saved = await createGap({ problem: "Slow analysis" });
    let release!: (value: unknown) => void;
    vi.mocked(runProvider).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = diagnoseSavedGap(saved.id);
    await vi.waitFor(() => expect(runProvider).toHaveBeenCalled());
    await expect(diagnoseSavedGap(saved.id)).rejects.toThrow(/already being diagnosed/);
    expect((await getGap(saved.id)).diagnosis).toBeNull();
    await expect(deleteGap(saved.id)).rejects.toThrow(/already being diagnosed/);
    release(output()); await first;
    vi.mocked(runProvider).mockResolvedValueOnce(output());
    expect((await diagnoseSavedGap(saved.id)).diagnosis?.ai.status).toBe("complete");
  });
});

describe("Gap diagnosis evidence boundaries", () => {
  async function fixture() {
    setWorkspaceRoot(BUNDLED_WORKSPACE);
    const workspace = await loadWorkspace();
    const gap: Gap = { version: 1, id: "example", created_at: "", image: null, diagnosis: null,
      report: gapInputSchema.omit({ image: true }).parse({ problem: "Secondary actions disappear", context: "A grid of cards", original_query: "buttons and cards" }) };
    return { workspace, gap };
  }

  it("supplies full canonical knowledge beyond retrieval, relationships, compact output, and conformance", async () => {
    const { workspace, gap } = await fixture();
    let captured: ProviderTask | undefined;
    const diagnosis = await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async (task) => { captured = task; return output(); });
    expect(diagnosis.ai.status).toBe("complete");
    expect(diagnosis.knowledge_count).toBeGreaterThan(diagnosis.records.length);
    expect(captured?.prompt).toContain("COMPLETE CANONICAL KNOWLEDGE");
    expect(captured?.prompt).toContain('"relationships"');
    expect(captured?.prompt).toContain('"component:textarea"');
    expect(captured?.prompt).toContain("CONFORMANCE");
    expect(captured?.prompt).not.toContain(workspace.filesRoot);
    expect(captured?.prompt).not.toContain('"asset_path"');
    expect(gapKnowledge(workspace).some((r) => r.key.startsWith("reference:"))).toBe(false);
  });

  it("allows mixed semantic findings with validated record citations", async () => {
    const { workspace, gap } = await fixture();
    const raw = output();
    raw.findings = [
      { ...raw.findings[0]!, classification: "weak_guidance", record_keys: ["component:button"] },
      { ...raw.findings[0]!, classification: "project_specific", record_keys: [] },
    ];
    const diagnosis = await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => raw);
    expect(diagnosis.findings.map((f) => f.classification)).toEqual(["weak_guidance", "project_specific"]);
    expect(diagnosis.records.some((r) => r.key === "component:button")).toBe(true);
  });

  it("rejects fabricated citations, malformed output, and image claims from a text-only provider", async () => {
    const { workspace, gap } = await fixture();
    for (const raw of [{ ...output(), image_inspected: true }, {}, { ...output(), findings: [{ ...output().findings[0], record_keys: ["component:invented"] }] }, { ...output(), findings: [{ ...output().findings[0], evidence_ids: ["screenshot"] }] }]) {
      const diagnosis = await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => raw);
      expect(diagnosis.ai.status).toBe("failed");
      expect(diagnosis.findings.every((f) => f.source === "deterministic")).toBe(true);
    }
  });

  it("only passes an image when explicitly enabled and honestly handles a provider declining inspection", async () => {
    const { workspace, gap } = await fixture();
    gap.image = { filename: "product.png", media_type: "image/png", bytes: 10 };
    const attachment = { bytes: Buffer.from(png, "base64"), extension: "png" as const };
    let passedImage: ProviderTask["image"];
    const runner = async (task: ProviderTask) => { passedImage = task.image; return output(); };
    const text = await diagnoseGap(gap, workspace, attachment, { MONET_AI_COMMAND: "provider" }, runner);
    expect(passedImage).toBeUndefined(); expect(text.image_status).toBe("not_inspected");
    const declined = await diagnoseGap(gap, workspace, attachment, { MONET_AI_COMMAND: "provider", MONET_AI_IMAGES: "1" }, runner);
    expect(passedImage).toEqual(attachment);
    expect(declined.image_status).toBe("not_inspected");
    expect(declined.limitations.join(" ")).toContain("did not inspect");
    const inspected = await diagnoseGap(gap, workspace, attachment, { MONET_AI_COMMAND: "provider", MONET_AI_IMAGES: "1" }, async () => ({ ...output(), image_inspected: true, image_observations: ["A pale control appears against a pale background."] }));
    expect(inspected.image_status).toBe("provider_reported_inspected");
    expect(inspected.evidence.some((e) => e.id === "screenshot")).toBe(true);
  });

  it("preserves measured violations alongside semantic analysis and does not turn missing evidence into violations", async () => {
    const { workspace, gap } = await fixture();
    gap.report.usages = [{ kind: "contrast", foreground: "#ffffff", background: "#ffffff", usage: "text" }];
    const result = await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => output());
    expect(result.findings.some((f) => f.source === "deterministic" && f.classification === "implementation_violation")).toBe(true);
    gap.report.usages = [];
    const empty = await diagnoseGap(gap, workspace, undefined, {});
    expect(empty.findings.map((f) => f.classification)).toEqual(["insufficient_evidence"]);
    expect(empty.conformance.coverage.checked).toBe(0);
  });

  it("keeps the 1:1 WCAG result above a contradictory missing-decision interpretation", async () => {
    const { workspace, gap } = await fixture();
    gap.report.usages = [{ kind: "contrast", foreground: "#fff", background: "#fff", usage: "text" }];
    const raw = output();
    raw.conclusion = "This is missing guidance, not an implementation violation.";
    raw.findings = [{ ...raw.findings[0]!, classification: "missing_decision", record_keys: ["foundation:color"] }];
    const result = await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => raw);
    expect(result.ai.status).toBe("complete");
    expect(result.conclusion).toContain("WCAG floor");
    expect(result.conclusion).not.toContain("Monet guidance");
    expect(result.interpretation).toBe(raw.conclusion);
    expect(result.contradiction).toBe(true);
    expect(result.findings[0]).toMatchObject({ check: "contrast_below_minimum", basis: "wcag_floor", record_keys: [] });
    expect(result.findings[0]?.reasoning).toContain("1.00:1");
    expect(result.findings[1]).toMatchObject({ source: "ai", contradiction: true });
    raw.measured_errors = "disputed";
    raw.findings[0]!.classification = "project_specific";
    expect((await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => raw)).contradiction).toBe(true);
  });

  it("retains Monet record keys and check ids for measured token and component errors", async () => {
    const { workspace, gap } = await fixture();
    workspace.components.find((c) => c.id === "button")!.status = "do_not_use";
    gap.report.usages = [{ kind: "component", component: "button" }, { kind: "style", property: "padding-top", value: "{neutral.white}" }];
    const result = await diagnoseGap(gap, workspace, undefined, {});
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ check: "component_do_not_use", basis: "monet_rule", record_keys: ["component:button"] }),
      expect.objectContaining({ check: "token_type_mismatch", basis: "monet_rule", record_keys: ["foundation:color"] }),
    ]));
    expect(result.records.map((r) => r.key)).toEqual(expect.arrayContaining(["component:button", "foundation:color"]));
  });

  it("keeps AI-only implementation violations interpretive", async () => {
    const { workspace, gap } = await fixture();
    const raw = output();
    raw.findings[0] = { ...raw.findings[0]!, classification: "implementation_violation", record_keys: ["component:button"] };
    const result = await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => raw);
    expect(result.ai.status).toBe("complete");
    expect(result.findings).toEqual([expect.objectContaining({ source: "ai", contradiction: false })]);
    expect(result.conformance.coverage.checked).toBe(0);
  });

  it("requires two distinct conflict records, nearest missing-decision records, and report evidence", async () => {
    const { workspace, gap } = await fixture();
    for (const overrides of [
      { classification: "conflicting_guidance", record_keys: ["component:button"] },
      { classification: "conflicting_guidance", record_keys: ["component:button", "component:button"] },
      { classification: "missing_decision", record_keys: [] },
      { evidence_ids: ["knowledge", "retrieval"] },
    ]) {
      const raw = { ...output(), findings: [{ ...output().findings[0], ...overrides }] };
      expect((await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => raw)).ai.status).toBe("failed");
    }
    const valid = { ...output(), findings: [{ ...output().findings[0], classification: "conflicting_guidance", record_keys: ["component:button", "foundation:color"] }] };
    expect((await diagnoseGap(gap, workspace, undefined, { MONET_AI_COMMAND: "provider" }, async () => valid)).ai.status).toBe("complete");
  });

  it("rejects unsupported image claims and screenshot-only evidence even with image input", async () => {
    const { workspace, gap } = await fixture();
    const attachment = { bytes: Buffer.from(png, "base64"), extension: "png" as const };
    for (const raw of [
      { ...output(), image_inspected: true },
      { ...output(), image_inspected: true, image_observations: [] },
      { ...output(), image_inspected: true, image_observations: [" "] },
      { ...output(), image_observations: ["I saw a button."] },
      { ...output(), image_inspected: true, image_observations: ["A button."], findings: [{ ...output().findings[0], evidence_ids: ["screenshot", "knowledge"] }] },
    ]) {
      const result = await diagnoseGap(gap, workspace, attachment, { MONET_AI_COMMAND: "provider", MONET_AI_IMAGES: "1" }, async () => raw);
      expect(result.ai.status).toBe("failed");
      expect(result.image_status).not.toBe("provider_reported_inspected");
    }
  });

  it("reports theme/mode fallback and fingerprints changes to guidance", async () => {
    const { workspace, gap } = await fixture();
    gap.report.theme_id = "missing-theme";
    const first = await diagnoseGap(gap, workspace, undefined, {});
    expect(first.limitations.join(" ")).toContain("theme was not found");
    const modified = structuredClone(workspace); modified.principles[0]!.body += " Changed guidance.";
    expect((await diagnoseGap(gap, modified, undefined, {})).workspace_fingerprint).not.toBe(first.workspace_fingerprint);
  });
});
