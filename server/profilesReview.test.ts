/**
 * Independent adversarial probes for Profiles V1. These deliberately target paths the shipped
 * suite does not exercise: scope-stripped copies, fabricated provenance, library poisoning by a
 * failed rename, orphaned publications, over-long enrolled names, foreign receipts in listings,
 * theme-free Safe Apply, per-write verification cost, the central API guard, fork contents and
 * fresh-root initialization. Regression assertions below include the review fixes.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileRegistry } from "./profileRegistry.js";
import { createProfileService, createProfileStore } from "./profileService.js";
import { BUNDLED_WORKSPACE, setWorkspaceRoot, withProfile, type ProfileScope } from "./workspace.js";
import { createGap, diagnoseSavedGap, getGap, initializeStore, saveGapReview } from "./fileStore.js";
import { approveProposal, createProposal, getProposal, saveProposalRevision } from "./proposalStore.js";
import { applyProposal, listApplications, planApplication } from "./applicationStore.js";
import { protectApi } from "./apiProtection.js";

let directory: string, original: string, registry: ProfileRegistry, a: ProfileScope, b: ProfileScope;
const bundledFilter = (p: string) => !/\/(gaps|proposals|applications|surfaces)(\/|$)/.test(p) && !p.endsWith("profile.json");
beforeEach(async () => {
  vi.stubEnv("MONET_AI_COMMAND", ""); vi.stubEnv("MONET_CODEX_EXECUTABLE", "");
  directory = await realpath(await mkdtemp(path.join(tmpdir(), "monet-review-"))); original = path.join(directory, "original");
  await cp(BUNDLED_WORKSPACE, original, { recursive: true, filter: bundledFilter });
  registry = new ProfileRegistry(path.join(directory, "library")); await registry.open(original);
  a = await registry.scope(registry.list().originalProfileId);
  const second = await registry.create({ name: "Fork B", kind: "fork", sourceProfileId: a.identity!.id }); b = await registry.scope(second.identity.id);
});
afterEach(async () => { vi.unstubAllEnvs(); setWorkspaceRoot(BUNDLED_WORKSPACE); await rm(directory, { recursive: true, force: true }); });

async function approved(scope: ProfileScope, target = "component:button", field = "notes", after = "Keep one primary action in each card.") {
  return withProfile(scope, async () => {
    const gap = await createGap({ problem: "Actions inside cards need guidance" });
    await diagnoseSavedGap(gap.id);
    await saveGapReview(gap.id, { classification: "weak_guidance", conclusion: "Clarify card actions", record_keys: [target] });
    const proposal = await createProposal({ gap_id: gap.id });
    const edited = await saveProposalRevision(proposal.id, { summary: "Clarify actions", rationale: "Keep actions recognizable", changes: [{ target, field, after }] });
    const revision = edited.revisions[0]!;
    await approveProposal(proposal.id, { revision: revision.number, hash: revision.hash });
    return { gap, proposal: await getProposal(proposal.id), approval: { revision: revision.number, hash: revision.hash } };
  });
}
function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !["profile_id", "scope_version", "hash_schema"].includes(k)).map(([k, v]) => [k, strip(v)]));
  return value;
}
async function enrolledCopy(name: string): Promise<ProfileScope> {
  const root = path.join(directory, name);
  await cp(BUNDLED_WORKSPACE, root, { recursive: true, filter: bundledFilter });
  await withProfile({ root }, initializeStore);
  const entry = await registry.enroll(root);
  return registry.scope(entry.identity.id);
}

describe("cross-profile record laundering", () => {
  it("scope-stripped copies read as legacy evidence in an enrolled Profile but can neither be approved nor applied", async () => {
    const item = await approved(a);
    const eb = await enrolledCopy("legacy-b");
    for (const [dir, id] of [["gaps", item.gap.id], ["proposals", item.proposal.id]] as const) {
      const file = path.join(a.root, dir, `${id}.json`);
      await writeFile(path.join(eb.root, dir, `${id}.json`), JSON.stringify(strip(JSON.parse(await readFile(file, "utf8"))), null, 2));
    }
    const before = await readFile(path.join(eb.root, "components", "decisions.json"));
    await withProfile(eb, async () => {
      // Legacy acceptance is the documented behaviour: unscoped records belong to their enclosing enrolled workspace.
      expect((await getGap(item.gap.id)).profile_id).toBeUndefined();
      const plan = await planApplication(item.proposal.id);
      expect(plan.ready).toBe(false);
      expect(plan.blockers.map((blocker) => blocker.message).join(" ")).toMatch(/Profile-bound|integrity|hash/i);
      await expect(applyProposal(item.proposal.id, item.approval)).rejects.toThrow();
      await expect(approveProposal(item.proposal.id, item.approval)).rejects.toThrow();
    });
    expect((await readFile(path.join(eb.root, "components", "decisions.json"))).equals(before)).toBe(true);
  });
  it("a copied scoped receipt makes the whole receipts listing of the other Profile unavailable", async () => {
    const item = await approved(a);
    const result = await withProfile(a, () => applyProposal(item.proposal.id, item.approval));
    await cp(path.join(a.root, "applications", `${result.receipt!.id}.json`), path.join(b.root, "applications", `${result.receipt!.id}.json`));
    await expect(withProfile(b, () => listApplications())).rejects.toThrow(/different Profile/);
    // Canonical access is unaffected; only the listing fails closed.
    expect((await createProfileService(b).getWorkspace()).profile?.id).toBe(b.identity!.id);
  });
  it("rejects fabricated Surface provenance before creating a Gap", async () => {
    const provenance = { profile_id: a.identity!.id, surface_id: randomUUID(), revision: 7, run_hash: "a".repeat(64), snapshot_hash: "b".repeat(64) };
    await expect(withProfile(a, () => createGap({ problem: "Fabricated handoff", provenance }))).rejects.toThrow();
    expect(await createProfileStore(a).files.listGaps()).toEqual([]);
  });
  it("checks same-Profile Surface revision and hashes and retains copied history after deletion", async () => {
    const store = createProfileStore(a);
    const surface = await store.surfaces.saveSurface({ input: { title: "Evidence", html: '<div style="padding:13px">Evidence</div>' } });
    const provenance = { profile_id: a.identity!.id, surface_id: surface.saved!.id, revision: 1, run_hash: surface.run.run_hash, snapshot_hash: surface.snapshot.hash };
    for (const changed of [{ revision: 2 }, { run_hash: "a".repeat(64) }, { snapshot_hash: "b".repeat(64) }, { profile_id: b.identity!.id }]) {
      await expect(store.files.createGap({ problem: "Invalid handoff", provenance: { ...provenance, ...changed } })).rejects.toThrow(/provenance/);
    }
    const other = createProfileStore(b);
    await expect(other.files.createGap({ problem: "Foreign handoff", provenance })).rejects.toThrow(/Profile/);
    await cp(path.join(a.root, "surfaces", `${surface.saved!.id}.json`), path.join(b.root, "surfaces", `${surface.saved!.id}.json`));
    await expect(other.files.createGap({ problem: "Relabeled handoff", provenance: { ...provenance, profile_id: b.identity!.id } })).rejects.toThrow(/Profile/);
    expect(await store.files.listGaps()).toEqual([]); expect(await other.files.listGaps()).toEqual([]);
    // The older saved revision remains valid even after a new comparison is saved.
    await store.surfaces.reviseSurface(surface.saved!.id, { expected_revision: 1, selection: { mode: "dark" } });
    const gap = await store.files.createGap({ problem: "Valid historical handoff", provenance });
    expect(gap.report.provenance).toEqual(provenance);
    await store.surfaces.deleteSurface(surface.saved!.id);
    expect((await store.files.getGap(gap.id)).report.provenance).toEqual(provenance);
    await expect(store.files.createGap({ problem: "Deleted evidence", provenance })).rejects.toThrow();
  });
});

describe("library integrity", () => {
  it("a rename refused by a blocked Profile leaves no pending publication and is not applied at the next start", async () => {
    await mkdir(path.join(a.root, "applications"), { recursive: true });
    await writeFile(path.join(a.root, "applications", "bogus.journal.json"), "{}");
    const before = a.identity!.name;
    await expect(registry.renameProfile(a.identity!.id, "Renamed while blocked")).rejects.toThrow(/application|recovery/i);
    await expect(readFile(path.join(registry.directory, "pending-profile.json"), "utf8")).rejects.toThrow();
    expect((await registry.create({ name: "Still creatable", kind: "scratch" })).identity.name).toBe("Still creatable");
    const reopened = new ProfileRegistry(registry.directory); await reopened.open(original);
    expect(reopened.list().profiles.find((p) => p.identity.id === a.identity!.id)?.identity.name).toBe(before);
  });
  it("an orphaned pending publication prevents every Profile from starting", async () => {
    const id = randomUUID();
    await writeFile(path.join(registry.directory, "pending-profile.json"), JSON.stringify({ identity: { version: 1, id, name: "Ghost", created_at: new Date().toISOString(), origin: { kind: "scratch" } }, root: path.join(registry.directory, "profiles", id), stage: path.join(registry.directory, "profiles", `.creating-${id}`) }));
    await expect(new ProfileRegistry(registry.directory).open(original)).rejects.toThrow(/Incomplete Profile stage/);
  });
  it("enrolling a root whose basename exceeds the name limit keeps the library readable", async () => {
    const root = path.join(directory, "x".repeat(101)); await mkdir(root);
    const entry = await registry.enroll(root);
    expect(entry.identity.name).toHaveLength(100);
    expect((await registry.scope(entry.identity.id)).identity?.id).toBe(entry.identity.id);
    const reopened = new ProfileRegistry(registry.directory); await reopened.open(original);
    expect(reopened.list().profiles.find((p) => p.identity.id === entry.identity.id)?.unavailable).toBeUndefined();
  });
  it("concurrent creations serialize into distinct identities without leftover stages", async () => {
    const [first, second] = await Promise.all([registry.create({ name: "One", kind: "scratch" }), registry.create({ name: "Two", kind: "scratch" })]);
    expect(first.identity.id).not.toBe(second.identity.id);
    expect((await readdir(path.join(registry.directory, "profiles"))).filter((n) => n.startsWith(".creating-"))).toEqual([]);
    expect(registry.list().profiles).toHaveLength(4);
  });
  it("forks copy knowledge only: no private evidence, decision log, receipts or identity", async () => {
    const item = await approved(a); await withProfile(a, () => applyProposal(item.proposal.id, item.approval));
    const plain = await registry.create({ name: "Plain fork", kind: "fork", sourceProfileId: a.identity!.id });
    const withRefs = await registry.create({ name: "Ref fork", kind: "fork", sourceProfileId: a.identity!.id, includeReferences: true });
    const plainEntries = await readdir(plain.root), refEntries = await readdir(withRefs.root);
    for (const name of ["gaps", "proposals", "applications", "surfaces"]) { expect(await readdir(path.join(plain.root, name))).toEqual([]); }
    expect(await readdir(path.join(plain.root, "decisions"))).toEqual([]);
    expect((await readdir(path.join(a.root, "decisions"))).length).toBeGreaterThan(0);
    expect(plainEntries).not.toContain("STARTER-LICENSE.txt");
    expect(JSON.parse(await readFile(path.join(plain.root, "references", "registry.json"), "utf8"))).toEqual([]);
    expect(JSON.parse(await readFile(path.join(withRefs.root, "references", "registry.json"), "utf8"))).toEqual(JSON.parse(await readFile(path.join(a.root, "references", "registry.json"), "utf8")));
    expect(refEntries).toContain("references");
    expect(JSON.parse(await readFile(path.join(plain.root, "profile.json"), "utf8")).id).toBe(plain.identity.id);
  }, 20000);
});

describe("theme-free Profiles", () => {
  it("runs Surfaces, Gaps, Proposals and Safe Apply on a scratch Profile with no Theme at all", async () => {
    const created = await registry.create({ name: "Scratch", kind: "scratch" }), scope = await registry.scope(created.identity.id);
    const store = createProfileStore(scope);
    await store.files.savePrinciple("clarity", { id: "clarity", title: "Clarity", body: "# Clarity\n\nSay less.", order: 0, updated_at: "" });
    expect((await store.files.loadWorkspace(undefined, "dark")).themes).toEqual([]);
    const surface = await store.surfaces.saveSurface({ input: { title: "T", html: '<div style="padding:13px">Evidence</div>' }, selection: { mode: "dark", profile_id: scope.identity!.id } });
    expect(surface.run.theme_id).toBeUndefined(); expect(surface.run.profile_id).toBe(scope.identity!.id);
    expect((await store.surfaces.getSurface(surface.saved!.id)).run.run_hash).toBe(surface.run.run_hash);
    const gap = await store.surfaces.surfaceToGap(surface.saved!.id, { revision: 1, problem: "Spacing", issue_ids: [surface.run.issues[0]!.id] });
    expect(gap.report.theme_id).toBeUndefined(); expect(gap.report.provenance?.surface_id).toBe(surface.saved!.id);
    const item = await approved(scope, "principle:clarity", "body", "# Clarity\n\nSay less, and say it once.");
    const result = await withProfile(scope, () => applyProposal(item.proposal.id, item.approval));
    expect(result.outcome).toBe("applied"); expect(result.receipt?.profile_id).toBe(scope.identity!.id);
    expect((await store.files.loadWorkspace()).principles.find((p) => p.id === "clarity")?.body).toContain("say it once");
    await expect(store.files.setDefaultTheme("default")).rejects.toThrow();
  });
});

describe("verification cost", () => {
  it("reports how per-write full-tree verification scales with reference asset count", async () => {
    const store = createProfileStore(a);
    const time = async () => { const principle = (await store.files.loadWorkspace()).principles[0]!; const start = performance.now(); await store.files.savePrinciple(principle.id, { ...principle, title: `T ${Math.random()}` }); return Math.round(performance.now() - start); };
    const baseline = await time();
    const assets = path.join(a.root, "references", "assets"); await mkdir(assets, { recursive: true });
    await Promise.all(Array.from({ length: 3000 }, (_, i) => writeFile(path.join(assets, `asset-${i}.png`), "x")));
    const loaded = await time();
    console.log(`savePrinciple: ${baseline} ms with 3 assets, ${loaded} ms with 3003 assets`);
    expect(loaded).toBeGreaterThan(0);
  });
});

describe("central API guard", () => {
  const request = (headers: Record<string, string>, method = "GET") => ({ headers, method }) as unknown as IncomingMessage;
  it("keeps the editor and native clients working and refuses other local origins, missing ports and non-JSON bodies", () => {
    expect(() => protectApi(request({ host: "127.0.0.1:43140" }))).not.toThrow();
    expect(() => protectApi(request({ host: "localhost:43140", origin: "http://localhost:43140" }, "POST"))).toThrow(/application\/json/);
    expect(() => protectApi(request({ host: "localhost:43140", origin: "http://localhost:43140", "content-type": "application/json; charset=utf-8" }, "POST"))).not.toThrow();
    expect(() => protectApi(request({ host: "127.0.0.1:43141", "content-length": "0" }, "POST"))).not.toThrow();
    expect(() => protectApi(request({ host: "127.0.0.1:43141", "transfer-encoding": "chunked" }, "POST"))).toThrow(/application\/json/);
    expect(() => protectApi(request({ host: "127.0.0.1:43141", origin: "http://127.0.0.1:43140" }, "DELETE"))).toThrow(/application\/json/);
    expect(() => protectApi(request({ host: "127.0.0.1" }))).toThrow(/loopback/);
    expect(() => protectApi(request({ host: "127.0.0.1:43141", origin: "http://localhost:9999", "sec-fetch-site": "same-site" }))).toThrow(/editor origin/);
    expect(() => protectApi(request({ host: "127.0.0.1:43141", origin: "null" }))).toThrow(/editor origin/);
    expect(() => protectApi(request({ host: "[::1]:43141" }))).toThrow(/loopback/);
  });
});

describe("startup root seeding", () => {
  it.each([true, false])("initializes a usable Theme-free scratch MONET_ROOT (directory exists: %s)", async (exists) => {
    const dir = await mkdtemp(path.join(tmpdir(), "monet-empty-root-")), root = path.join(dir, "empty"); if (exists) await mkdir(root);
    const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, MONET_ROOT: root, MONET_LIBRARY: path.join(dir, "library"), MONET_PORT: "0", MONET_AI_COMMAND: "", MONET_CODEX_EXECUTABLE: "" }, stdio: ["ignore", "pipe", "pipe"] });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let output = "", errors = ""; const timer = setTimeout(() => reject(new Error("timed out")), 15000);
        child.stderr.on("data", (data) => { errors += data; }); child.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
        child.stdout.on("data", (data) => { output += data; const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!); } });
      });
      const workspace = await (await fetch(url + "/api/workspace")).json() as { themes: unknown[]; taxonomy: unknown[] };
      console.log(`empty MONET_ROOT after startup: ${JSON.stringify((await readdir(root)).sort())}; themes=${workspace.themes.length}`);
      expect(workspace.themes).toEqual([]);
      expect(await readdir(root)).toEqual(expect.arrayContaining(["profile.json", "taxonomy", "foundations", "principles", "DESIGN_SYSTEM.md", "design-system.json", "tokens"]));
      expect(JSON.parse(await readFile(path.join(root, "taxonomy", "components.json"), "utf8"))).toEqual([]);
      expect(JSON.parse(await readFile(path.join(root, "taxonomy", "primitives.json"), "utf8"))).toEqual([]);
      expect(await readdir(path.join(root, "themes"))).toEqual([]);
      const identity = JSON.parse(await readFile(path.join(root, "profile.json"), "utf8"));
      expect(identity.origin.kind).toBe("scratch");
      const saved = await fetch(url + "/api/principles/clarity", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "clarity", title: "Clarity", body: "# Clarity\n\nSay less.", order: 0, updated_at: "" }) });
      expect(saved.status).toBe(200);
      expect(await readFile(path.join(root, "DESIGN_SYSTEM.md"), "utf8")).toContain("Clarity");
      const library = new ProfileRegistry(path.join(dir, "library")); await library.open(root);
      expect(library.list().originalProfileId).toBe(identity.id);
      expect((await createProfileService(await library.scope(identity.id)).getWorkspace()).principles).toHaveLength(1);
    } finally { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } await rm(dir, { recursive: true, force: true }); }
  }, 30000);
});
