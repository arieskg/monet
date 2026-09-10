import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileRegistry, readOnlyProfileScope } from "./profileRegistry.js";
import { createProfileService, createProfileStore } from "./profileService.js";
import { BUNDLED_WORKSPACE, setWorkspaceRoot, withProfile, type ProfileScope } from "./workspace.js";
import { assertWorkspaceWrite, withWorkspaceRead, withWorkspaceWrite } from "./writeLock.js";
import { createGap, diagnoseSavedGap, getGap, loadWorkspace, saveGapReview, initializeStore } from "./fileStore.js";
import { approveProposal, createProposal, getProposal, proposalInternals, saveProposalRevision } from "./proposalStore.js";
import { applyProposal, planApplication, recoverApplications } from "./applicationStore.js";
import { getSurface, saveSurface, reviseSurface, surfaceToGap } from "./surfaceStore.js";
import { runProvider } from "./aiProvider.js";

const faults = vi.hoisted(() => ({ renamePath: "", count: 0, gate: null as null | { path: string; reached: () => void; wait: Promise<void> } }));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: async (from: string, to: string) => {
    if (faults.gate && to === faults.gate.path) { faults.gate.reached(); await faults.gate.wait; }
    if (faults.count && to.includes(faults.renamePath)) { faults.count--; throw new Error("Injected publication failure"); }
    return fs.rename(from, to);
  } };
});
vi.mock("./aiProvider.js", async (original) => ({ ...await original<typeof import("./aiProvider.js")>(), runProvider: vi.fn() }));
let directory: string, original: string, registry: ProfileRegistry, a: ProfileScope, b: ProfileScope;
beforeEach(async () => {
  faults.count = 0; faults.renamePath = ""; faults.gate = null;
  vi.stubEnv("MONET_AI_COMMAND", ""); vi.stubEnv("MONET_CODEX_EXECUTABLE", "");
  directory = await realpath(await mkdtemp(path.join(tmpdir(), "monet-profiles-"))); original = path.join(directory, "original");
  await cp(BUNDLED_WORKSPACE, original, { recursive: true, filter: (p) => !/\/(gaps|proposals|applications|surfaces)(\/|$)/.test(p) && !p.endsWith("profile.json") });
  registry = new ProfileRegistry(path.join(directory, "library")); await registry.open(original);
  a = await registry.scope(registry.list().originalProfileId);
  const second = await registry.create({ name: "Product B", kind: "fork", sourceProfileId: a.identity!.id }); b = await registry.scope(second.identity.id);
});
afterEach(async () => { faults.count = 0; vi.unstubAllEnvs(); vi.clearAllMocks(); setWorkspaceRoot(BUNDLED_WORKSPACE); await rm(directory, { recursive: true, force: true }); });

async function approved(scope: ProfileScope) {
  return withProfile(scope, async () => {
    const gap = await createGap({ problem: "Actions inside cards need guidance" });
    await diagnoseSavedGap(gap.id);
    await saveGapReview(gap.id, { classification: "weak_guidance", conclusion: "Clarify card actions", record_keys: ["component:button"] });
    const proposal = await createProposal({ gap_id: gap.id });
    const edited = await saveProposalRevision(proposal.id, { summary: "Clarify actions", rationale: "Keep actions recognizable", changes: [{ target: "component:button", field: "notes", after: "Keep one primary action in each card." }] });
    const revision = edited.revisions[0]!;
    await approveProposal(proposal.id, { revision: revision.number, hash: revision.hash });
    return { gap, proposal: await getProposal(proposal.id), approval: { revision: revision.number, hash: revision.hash } };
  });
}

describe("independent profile storage and enrollment", () => {
  it("enrolls in place without altering any pre-existing bytes; retains identity on reopen", async () => {
    expect(Object.isFrozen(a.identity)).toBe(true); expect(Object.isFrozen(a.identity!.origin)).toBe(true);
    const listed = registry.list(); listed.profiles[0]!.identity.name = "Cannot mutate registry";
    expect(registry.list().profiles[0]!.identity.name).not.toBe("Cannot mutate registry");
    const source = path.join(directory, "legacy"); await cp(BUNDLED_WORKSPACE, source, { recursive: true, filter: (p) => !/\/(gaps|proposals|applications|surfaces)(\/|$)/.test(p) && !p.endsWith("profile.json") });
    const files: Record<string, Buffer> = {};
    async function inventory(root: string) { for (const entry of await readdir(root, { withFileTypes: true })) { const file = path.join(root, entry.name); if (entry.isDirectory()) await inventory(file); else files[file] = await readFile(file); } }
    await inventory(source); const entry = await registry.enroll(source);
    for (const [file, bytes] of Object.entries(files)) expect((await readFile(file)).equals(bytes), file).toBe(true);
    const reopened = new ProfileRegistry(registry.directory); await reopened.open(original);
    expect(reopened.list().profiles.find((p) => p.root === source)?.identity.id).toBe(entry.identity.id);
  });
  it("creates theme-free scratch profiles and independent starter/forks without private evidence", async () => {
    const { gap } = await approved(a);
    const scratch = await registry.create({ name: "Scratch", kind: "scratch" });
    const workspace = await createProfileService(await registry.scope(scratch.identity.id)).getWorkspace(undefined, "dark");
    expect(workspace.themes).toEqual([]); expect(workspace.foundations).toEqual([]); expect(workspace.activeMode).toBe("light");
    const seed = await registry.create({ name: "Seed", kind: "monet-starter" });
    expect(seed.identity.origin).toMatchObject({ kind: "monet-starter", starter_version: "monet-0.1.0" });
    const fork = await registry.create({ name: "Fork", kind: "fork", sourceProfileId: a.identity!.id });
    const store = createProfileStore(await registry.scope(fork.identity.id));
    expect(await store.files.listGaps()).toEqual([]); expect(await store.proposals.listProposals()).toEqual([]); expect(await store.applications.listApplications()).toEqual([]);
    await expect(store.files.getGap(gap.id)).rejects.toThrow();
    expect(fork.identity.origin.source_profile_id).toBe(a.identity!.id);
  }, 20000); // Starter instantiation, staging flush and validation are fsync-heavy under parallel test load.
  it("rejects duplicate roots, nested roots, identity copies, and symlink aliases", async () => {
    await expect(registry.enroll(original)).rejects.toThrow(/overlap/);
    const nested = path.join(original, "nested"); await mkdir(nested); await expect(registry.enroll(nested)).rejects.toThrow(/overlap/);
    const alias = path.join(directory, "alias"); await symlink(original, alias); await expect(registry.enroll(alias)).rejects.toThrow(/overlap/);
    const copy = path.join(directory, "copy"); await cp(original, copy, { recursive: true }); await expect(registry.enroll(copy)).rejects.toThrow(/identity already/);
    await rm(path.join(b.root, "components"), { recursive: true }); await symlink(path.join(a.root, "components"), path.join(b.root, "components"));
    await expect(registry.scope(b.identity!.id)).rejects.toThrow(/symlinks/);
  });
  it("moves only an absent original, keeps identity and rejects stale captured scopes", async () => {
    const moved = path.join(directory, "moved");
    await expect(registry.move(a.identity!.id, moved)).rejects.toThrow(/offline/);
    await rename(original, moved); await registry.move(a.identity!.id, moved);
    expect((await registry.scope(a.identity!.id)).root).toBe(moved);
    await expect(createProfileService(a).getWorkspace()).rejects.toThrow(/identity changed/);
    await expect(readOnlyProfileScope(moved, b.identity!.id)).rejects.toThrow(/does not match/);
  });
  it("binds projects to one Profile without a Theme and refuses rebinding/mismatches", async () => {
    const project = { id: randomUUID(), name: "App", profileId: a.identity!.id, bindingRevision: 1 };
    await registry.bindProject(project); expect(() => registry.assertBinding(project.id, project.profileId, 1)).not.toThrow();
    expect(() => registry.assertBinding(project.id, b.identity!.id, 1)).toThrow(/mismatch/);
    expect(() => registry.assertBinding(project.id, project.profileId, 2)).toThrow(/mismatch/);
    await expect(registry.bindProject({ ...project, profileId: b.identity!.id, bindingRevision: 2 })).rejects.toThrow(/reassignment/);
  });
});

describe("adversarial isolation", () => {
  it("keeps queued writes and identical IDs in their captured profile after legacy root changes", async () => {
    const first = createProfileStore(a), second = createProfileStore(b);
    const before = await second.files.loadWorkspace(), principle = (await first.files.loadWorkspace()).principles[0]!;
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>((r) => { release = r; }); const started = new Promise<void>((r) => { reached = r; });
    const hold = withProfile(a, () => withWorkspaceWrite(async () => { reached(); await gate; })); await started;
    const write = first.files.savePrinciple(principle.id, { ...principle, title: "Only A changed" });
    setWorkspaceRoot(b.root);
    const independent = await second.files.loadWorkspace(); expect(independent.principles[0]!.title).toBe(before.principles[0]!.title);
    release(); await hold; await write;
    expect((await first.files.loadWorkspace()).principles[0]!.title).toBe("Only A changed");
    expect((await second.files.loadWorkspace()).principles).toEqual(before.principles);
    await withProfile(a, () => withWorkspaceWrite(async () => {
      expect(() => withProfile(b, assertWorkspaceWrite)).toThrow(/write boundary/);
      expect(() => withProfile(b, () => withWorkspaceRead(loadWorkspace))).toThrow(/Cross-profile/);
    }));
  });
  it("retains provider ownership across switches and refuses completion into a moved root", async () => {
    const store = createProfileStore(a), gap = await store.files.createGap({ problem: "Private A evidence" });
    vi.stubEnv("MONET_AI_COMMAND", "fixture");
    let finish!: (value: unknown) => void, reached!: () => void;
    const started = new Promise<void>((r) => { reached = r; });
    vi.mocked(runProvider).mockImplementation(async () => { reached(); return new Promise((r) => { finish = r; }); });
    const job = store.files.diagnoseSavedGap(gap.id); await started;
    await createProfileStore(b).files.createGap({ problem: "Private B evidence" }); setWorkspaceRoot(b.root);
    finish({ conclusion: "No decision", image_inspected: false, measured_errors: "not_assessed", findings: [] });
    expect((await job).profile_id).toBe(a.identity!.id);
    expect((await store.files.getGap(gap.id)).diagnosis?.profile_id).toBe(a.identity!.id);
    const startedAgain = new Promise<void>((r) => { reached = r; });
    const movedJob = store.files.diagnoseSavedGap(gap.id); await startedAgain;
    await rename(a.root, path.join(directory, "offline")); finish({});
    await expect(movedJob).rejects.toThrow(/identity changed/);
  });
  it("binds new approvals and Apply to one Profile, including copied IDs and hashes", async () => {
    const item = await approved(a), beforeB = await createProfileService(b).getWorkspace();
    expect(item.proposal.revisions[0]).toMatchObject({ hash_schema: 2, profile_id: a.identity!.id });
    const revision = item.proposal.revisions[0]!;
    expect(proposalInternals.revisionHash({ ...revision, profile_id: b.identity!.id })).not.toBe(revision.hash);
    await cp(path.join(a.root, "gaps", item.gap.id + ".json"), path.join(b.root, "gaps", item.gap.id + ".json"));
    await cp(path.join(a.root, "proposals", item.proposal.id + ".json"), path.join(b.root, "proposals", item.proposal.id + ".json"));
    await expect(withProfile(b, () => getGap(item.gap.id))).rejects.toThrow(/different Profile/);
    await expect(withProfile(b, () => applyProposal(item.proposal.id, item.approval))).rejects.toThrow(/different Profile/);
    const result = await withProfile(a, () => applyProposal(item.proposal.id, item.approval));
    expect(result.receipt?.profile_id).toBe(a.identity!.id);
    expect((await createProfileService(b).getWorkspace()).components).toEqual(beforeB.components);
    expect((await withProfile(a, () => applyProposal(item.proposal.id, item.approval))).outcome).toBe("already_applied");
  });
  it("preserves legacy revision hashes and requires a new scoped approval before Apply", async () => {
    const legacy = path.join(directory, "unregistered"); await cp(BUNDLED_WORKSPACE, legacy, { recursive: true, filter: (p) => !/\/(gaps|proposals|applications|surfaces)(\/|$)/.test(p) && !p.endsWith("profile.json") });
    await withProfile({ root: legacy }, initializeStore);
    const item = await approved({ root: legacy }); const file = path.join(legacy, "proposals", item.proposal.id + ".json"), bytes = await readFile(file);
    const entry = await registry.enroll(legacy), scope = await registry.scope(entry.identity.id);
    expect((await readFile(file)).equals(bytes)).toBe(true);
    const plan = await withProfile(scope, () => planApplication(item.proposal.id)); expect(plan.ready).toBe(false); expect(plan.blockers.some((b) => /Profile-bound/.test(b.message))).toBe(true);
    await withProfile(scope, async () => {
      const revision = item.proposal.revisions[0]!;
      const next = await saveProposalRevision(item.proposal.id, { summary: revision.summary, rationale: revision.rationale, changes: revision.changes.map((c) => ({ target: c.target, field: c.field, operation: c.operation, after: c.after })) });
      expect(next.revisions[0]!.hash).toBe(revision.hash); expect(next.revisions[1]!.hash).not.toBe(revision.hash);
      const approved = next.revisions[1]!; await approveProposal(item.proposal.id, { revision: approved.number, hash: approved.hash });
      expect((await applyProposal(item.proposal.id, { revision: approved.number, hash: approved.hash })).outcome).toBe("applied");
    });
  });
  it("rejects foreign comparisons, copied Surface runs, and foreign recovery journals without writing", async () => {
    const surface = await withProfile(a, () => saveSurface({ input: { title: "A", html: '<div style="padding:13px">Evidence</div>' }, selection: { mode: "light" } }));
    expect(surface.run.profile_id).toBe(a.identity!.id);
    await expect(withProfile(b, () => saveSurface({ input: { title: "B", html: "<p>B</p>" }, selection: { profile_id: a.identity!.id } }))).rejects.toThrow(/different Profile/);
    const id = surface.saved!.id;
    await cp(path.join(a.root, "surfaces", id + ".json"), path.join(b.root, "surfaces", id + ".json"));
    await expect(withProfile(b, () => getSurface(id))).rejects.toThrow(/different Profile/);
    const gap = await withProfile(a, () => surfaceToGap(id, { revision: 1, problem: "Spacing needs review", issue_ids: [surface.run.issues[0]!.id] }));
    expect(gap.report.provenance?.profile_id).toBe(a.identity!.id);
    const journal = path.join(b.root, "applications", randomUUID() + ".journal.json"); await writeFile(journal, JSON.stringify({ profile_id: a.identity!.id }));
    const before = await readFile(path.join(b.root, "components", "decisions.json"));
    await expect(withProfile(b, recoverApplications)).rejects.toThrow();
    expect((await readFile(path.join(b.root, "components", "decisions.json"))).equals(before)).toBe(true); expect(await readFile(journal, "utf8")).toContain(a.identity!.id);
    expect((await createProfileService(a).getWorkspace()).profile?.id).toBe(a.identity!.id);
  });
  it("rejects malformed seed creation without registering or overwriting another Profile", async () => {
    await writeFile(path.join(a.root, "foundations", "broken.json"), "{");
    const before = registry.list().profiles.length;
    await expect(registry.create({ name: "Broken", kind: "fork", sourceProfileId: a.identity!.id })).rejects.toThrow();
    expect(registry.list().profiles).toHaveLength(before);
    expect((await readdir(path.join(registry.directory, "profiles"))).some((n) => n.startsWith(".creating-"))).toBe(false);
  });
});


describe("publication and recovery failures", () => {
  it.each(["library.json", "/profiles/"])("recovers an interrupted %s publication and blocks further creation until recovery", async (target) => {
    faults.renamePath = target === "library.json" ? path.join(registry.directory, target) : path.join(registry.directory, "profiles");
    // The directory-rename case is covered by a prepared stage below; fail only registry commit here.
    if (target === "/profiles/") faults.renamePath = path.join(registry.directory, "library.json");
    faults.count = 1;
    await expect(registry.create({ name: "Recover me", kind: "scratch" })).rejects.toThrow(/Injected/);
    expect(registry.list().profiles).toHaveLength(2);
    await expect(registry.create({ name: "No duplicate", kind: "scratch" })).rejects.toThrow(/publication is pending/);
    if (target === "/profiles/") {
      const pending = JSON.parse(await readFile(path.join(registry.directory, "pending-profile.json"), "utf8")) as { root: string; stage: string };
      await rename(pending.root, pending.stage); // Crash immediately before the stage-to-root rename.
    }
    const reopened = new ProfileRegistry(registry.directory); await reopened.open(original);
    expect(reopened.list().profiles).toHaveLength(3);
    expect(reopened.list().profiles.filter((p) => p.identity.name === "Recover me")).toHaveLength(1);
    await expect(readFile(path.join(registry.directory, "pending-profile.json"))).rejects.toThrow();
  });
  it("failed identity enrollment leaves historical bytes and registrations untouched", async () => {
    const root = path.join(directory, "unenrolled"); await mkdir(root); await mkdir(path.join(root, "principles"));
    const file = path.join(root, "principles", "one.md"); await writeFile(file, "# Original bytes\n");
    faults.renamePath = path.join(root, "profile.json"); faults.count = 1;
    await expect(registry.enroll(root)).rejects.toThrow(/Injected/);
    expect(await readFile(file, "utf8")).toBe("# Original bytes\n"); expect(registry.list().profiles).toHaveLength(2);
    await expect(readFile(path.join(root, "profile.json"))).rejects.toThrow();
    await registry.enroll(root); expect(registry.list().profiles).toHaveLength(3);
  });
  it("resumes failed fresh-root initialization with the same identity before publishing", async () => {
    const root = path.join(directory, "fresh"); await mkdir(root);
    faults.renamePath = path.join(root, "taxonomy", "components.json"); faults.count = 1;
    await expect(registry.enroll(root)).rejects.toThrow(/Injected/);
    const identity = JSON.parse(await readFile(path.join(root, "profile.json"), "utf8"));
    expect(identity.origin.kind).toBe("scratch");
    expect(registry.list().profiles).toHaveLength(2);
    await expect(readFile(path.join(registry.directory, "pending-profile.json"))).rejects.toThrow();
    const reopened = new ProfileRegistry(registry.directory); await reopened.open(root);
    const scope = await reopened.scope(identity.id);
    expect((await createProfileService(scope).getWorkspace()).themes).toEqual([]);
    expect(JSON.parse(await readFile(path.join(root, "taxonomy", "components.json"), "utf8"))).toEqual([]);
    expect(await readFile(path.join(root, "DESIGN_SYSTEM.md"), "utf8")).toContain("Design");
    const fork = await reopened.create({ name: "Scratch fork", kind: "fork", sourceProfileId: identity.id });
    expect((await createProfileService(await reopened.scope(fork.identity.id)).getWorkspace()).themes).toEqual([]);
  });
  it("renaming a Profile preserves identity, proposal hashes, approvals and receipts", async () => {
    const item = await approved(a); await withProfile(a, () => applyProposal(item.proposal.id, item.approval));
    const before = await readFile(path.join(a.root, "proposals", item.proposal.id + ".json"));
    const renamed = await registry.renameProfile(a.identity!.id, "New product label");
    expect(renamed.identity.id).toBe(a.identity!.id);
    expect((await readFile(path.join(a.root, "proposals", item.proposal.id + ".json"))).equals(before)).toBe(true);
    expect((await createProfileService(await registry.scope(a.identity!.id)).getWorkspace()).profile?.name).toBe("New product label");
  });
  it("a failed Apply blocks only its Profile, rejects a foreign journal and recovers in the original", async () => {
    const item = await approved(a);
    faults.renamePath = path.join(a.root, "components", "decisions.json"); faults.count = 10;
    await expect(withProfile(a, () => applyProposal(item.proposal.id, item.approval))).rejects.toThrow();
    faults.count = 0;
    const journalName = (await readdir(path.join(a.root, "applications"))).find((n) => n.endsWith(".journal.json"))!;
    expect(journalName).toBeTruthy();
    await expect(createProfileService(a).getWorkspace()).rejects.toThrow(/recovery|unavailable|restore/i);
    expect((await createProfileService(b).getWorkspace()).profile?.id).toBe(b.identity!.id);
    await cp(path.join(a.root, "applications", journalName), path.join(b.root, "applications", journalName));
    const bytes = await readFile(path.join(b.root, "components", "decisions.json"));
    await expect(withProfile(b, recoverApplications)).rejects.toThrow(/Profile|recovery/i);
    expect((await readFile(path.join(b.root, "components", "decisions.json"))).equals(bytes)).toBe(true);
    const recovered = await withProfile(a, recoverApplications); expect(recovered[0]!.restored).toBe(true);
    expect((await createProfileService(a).getWorkspace()).profile?.id).toBe(a.identity!.id);
  });
});


it("switches during simultaneous Safe Apply with identical proposal and canonical IDs", async () => {
  const first = await approved(a), second = await approved(b);
  const proposalFile = path.join(b.root, "proposals", second.proposal.id + ".json");
  const secondProposal = { ...second.proposal, id: first.proposal.id };
  // Keep only persisted fields; each Profile has its own independently approved content/hash.
  const persisted = JSON.parse(await readFile(proposalFile, "utf8")) as { id: string };
  await writeFile(path.join(b.root, "proposals", first.proposal.id + ".json"), JSON.stringify({ ...persisted, id: first.proposal.id }));
  await rm(proposalFile);
  let release!: () => void, reached!: () => void;
  const wait = new Promise<void>((r) => { release = r; }), started = new Promise<void>((r) => { reached = r; });
  faults.gate = { path: path.join(a.root, "components", "decisions.json"), reached, wait };
  const applying = withProfile(a, () => applyProposal(first.proposal.id, first.approval)); await started;
  setWorkspaceRoot(b.root);
  try {
    const resultB = await withProfile(b, () => applyProposal(secondProposal.id, second.approval));
    expect(resultB.receipt?.profile_id).toBe(b.identity!.id);
  } finally { release(); faults.gate = null; }
  const resultA = await applying; expect(resultA.receipt?.profile_id).toBe(a.identity!.id);
  expect(resultA.receipt?.hash).not.toBe(second.approval.hash);
  expect((await readdir(path.join(a.root, "applications"))).some((n) => n.endsWith(".journal.json"))).toBe(false);
  expect((await readdir(path.join(b.root, "applications"))).some((n) => n.endsWith(".journal.json"))).toBe(false);
});


it("preserves completed legacy receipts and Surface hashes through enrollment and later scoped revisions", async () => {
  const legacy = path.join(directory, "old-history"); await cp(BUNDLED_WORKSPACE, legacy, { recursive: true, filter: (p) => !/\/(gaps|proposals|applications|surfaces)(\/|$)/.test(p) && !p.endsWith("profile.json") });
  await withProfile({ root: legacy }, initializeStore);
  const item = await approved({ root: legacy });
  const result = await withProfile({ root: legacy }, () => applyProposal(item.proposal.id, item.approval));
  const surface = await withProfile({ root: legacy }, () => saveSurface({ input: { title: "Historical", html: '<p style="padding:13px">Old evidence</p>' } }));
  const receiptFile = path.join(legacy, "applications", result.receipt!.id + ".json"), surfaceFile = path.join(legacy, "surfaces", surface.saved!.id + ".json");
  const receiptBytes = await readFile(receiptFile), surfaceBytes = await readFile(surfaceFile);
  const registration = await registry.enroll(legacy), scope = await registry.scope(registration.identity.id);
  expect((await readFile(receiptFile)).equals(receiptBytes)).toBe(true); expect((await readFile(surfaceFile)).equals(surfaceBytes)).toBe(true);
  expect((await withProfile(scope, () => applyProposal(item.proposal.id, item.approval))).outcome).toBe("already_applied");
  expect((await withProfile(scope, () => getSurface(surface.saved!.id))).run.run_hash).toBe(surface.run.run_hash);
  const next = await withProfile(scope, () => reviseSurface(surface.saved!.id, { expected_revision: 1, selection: { mode: "light" } }));
  expect(next.run.profile_id).toBe(scope.identity!.id);
  expect((await withProfile(scope, () => getSurface(surface.saved!.id, 1))).run.run_hash).toBe(surface.run.run_hash);
});
