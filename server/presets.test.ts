import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresetCatalog, presetFiles, readPresetReceipt } from "./presetCatalog.js";
import { ProfileRegistry } from "./profileRegistry.js";
import { createProfileService, createProfileStore } from "./profileService.js";
import { withProfile } from "./workspace.js";
import { validateWorkspace } from "./validate.js";
import type { PresetPackage, PresetSelection } from "../shared/presets.js";
import * as durable from "./durableFiles.js";
import { ProjectOnboarding } from "./projectOnboarding.js";
import { getProject, listProjects } from "./projectStore.js";
import { getSurface, saveSurface } from "./surfaceStore.js";

// These tests durably publish several complete Profiles; fsync can take longer under a full run.
vi.setConfig({ testTimeout: 30000, hookTimeout: 15000 });

let directory: string, root: string, registry: ProfileRegistry;
const catalogRoot = path.resolve(import.meta.dirname, "../presets/catalog");
const catalog = new PresetCatalog();
const ids = ["radix-product", "carbon-product", "uswds-public-service"];
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-presets-")); root = path.join(directory, "original");
  registry = new ProfileRegistry(path.join(directory, "library")); await registry.open(root);
  vi.stubEnv("MONET_AI_COMMAND", "");
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
async function create(id: string) {
  const detail = await catalog.detail(id);
  const registration = await registry.create({ name: detail.name, kind: "preset", preset: detail.selection });
  return { detail, registration, scope: await registry.scope(registration.identity.id) };
}

it.each(ids)("instantiates %s deterministically with complete, independently editable records and provenance", async (id) => {
  const a = await create(id), b = await create(id);
  expect(a.registration.identity.id).not.toBe(b.registration.identity.id);
  expect(a.registration.root).not.toBe(b.registration.root);
  expect(a.registration.identity.origin.preset).toEqual(a.detail.selection);
  expect(Object.isFrozen(a.scope.identity!.origin.preset)).toBe(true);
  const service = createProfileService(a.scope), store = createProfileStore(a.scope);
  const workspace = await service.getWorkspace();
  expect(workspace.themes).toEqual([]);
  expect(workspace.modes).toEqual(a.detail.supported_modes);
  const findings = validateWorkspace(workspace);
  expect(findings.filter((f) => f.level === "error")).toEqual([]);
  expect(findings).toHaveLength(id === "carbon-product" ? 2 : 0);
  expect(workspace.foundations).toEqual(a.detail.records.foundations);
  expect(workspace.principles).toEqual(a.detail.records.principles);
  expect(workspace.components).toEqual(a.detail.records.components);
  expect(workspace.patterns).toEqual(a.detail.records.patterns);
  for (const [file, bytes] of Object.entries(presetFiles(a.detail))) {
    expect(await readFile(path.join(a.registration.root, file), "utf8")).toBe(bytes);
    expect(await readFile(path.join(b.registration.root, file), "utf8")).toBe(bytes);
  }
  for (const mode of a.detail.supported_modes) {
    const resolved = await service.getWorkspace(undefined, mode);
    expect(resolved.activeMode).toBe(mode); expect(resolved.tokenIssues).toEqual([]);
    const context = await service.getDesignContext({ query: "Build a form with a button and a text input", mode });
    expect(context.theme).toBeNull(); expect(context.profile?.id).toBe(a.registration.identity.id);
    expect(context.components.some((c) => c.id === "button")).toBe(true);
    expect(JSON.stringify(context)).toContain("Monet adaptation");
    if (mode === "dark") expect(resolved.resolvedTokens.find((t) => t.name === "color.background")?.resolved_value).not.toBe(workspace.resolvedTokens.find((t) => t.name === "color.background")?.resolved_value);
  }
  if (id === "uswds-public-service") expect((await service.getWorkspace(undefined, "dark")).activeMode).toBe("light");
  const receipt = await withProfile(a.scope, readPresetReceipt);
  expect(receipt?.manifest).toEqual(a.detail.manifest);
  expect(await readFile(path.join(a.registration.root, "PRESET-LICENSES.txt"), "utf8")).toContain(a.detail.manifest.notices[0]!.text);
  for (const source of a.detail.manifest.sources) {
    const evidence = path.resolve(catalogRoot, "../evidence", id, `${source.id}.txt`);
    expect(hash(await readFile(evidence)), source.url).toBe(source.sha256);
  }
  const beforeB = await createProfileService(b.scope).getWorkspace();
  await store.files.savePrinciple(workspace.principles[0]!.id, { ...workspace.principles[0]!, title: "Only this Profile changed" });
  await store.files.saveFoundation(workspace.foundations[0]!.id, { ...workspace.foundations[0]!, guidance: "My own local guidance" });
  expect((await service.getWorkspace()).principles[0]!.title).toBe("Only this Profile changed");
  expect((await createProfileService(b.scope).getWorkspace()).foundations).toEqual(beforeB.foundations);
  expect((await createProfileService(b.scope).getWorkspace()).principles).toEqual(beforeB.principles);
  expect(await withProfile(a.scope, readPresetReceipt)).toEqual(receipt);
  expect(await catalog.detail(id)).toEqual(a.detail);
  const fork = await registry.create({ name: "Forked seed", kind: "fork", sourceProfileId: a.registration.identity.id });
  const forkScope = await registry.scope(fork.identity.id);
  expect(await withProfile(forkScope, readPresetReceipt)).toEqual(receipt);
  expect(await readFile(path.join(fork.root, "PRESET-LICENSES.txt"), "utf8")).toBe(await readFile(path.join(a.registration.root, "PRESET-LICENSES.txt"), "utf8"));
});

async function alteredCatalog(mutate: (bundle: PresetPackage) => void): Promise<{ selection: PresetSelection; catalog: PresetCatalog; directory: string }> {
  const destination = path.join(directory, "catalog"); await cp(catalogRoot, destination, { recursive: true });
  const entries = JSON.parse(await readFile(path.join(destination, "index.json"), "utf8")) as PresetSelection[];
  const first = entries[0]!, file = path.join(destination, first.id + ".json");
  const bundle = JSON.parse(await readFile(file, "utf8")) as PresetPackage; mutate(bundle);
  const bytes = JSON.stringify(bundle); first.version = bundle.manifest.version; first.sha256 = hash(bytes);
  await writeFile(file, bytes); await writeFile(path.join(destination, "index.json"), JSON.stringify(entries));
  return { selection: first, catalog: new PresetCatalog(destination), directory: destination };
}

it("catalog updates/removal never mutate existing Profiles, their exports or their retained attribution", async () => {
  const a = await create(ids[0]!); const before = await readFile(path.join(a.registration.root, "DESIGN_SYSTEM.md"));
  const changed = await alteredCatalog((b) => { b.manifest.version = "1.1.0"; b.records.principles[0]!.title = "Changed future preset"; });
  registry.presets = changed.catalog;
  await expect(registry.create({ name: "Stale preview", kind: "preset", preset: a.detail.selection })).rejects.toThrow(/unavailable or changed/);
  const future = await registry.create({ name: "New version", kind: "preset", preset: changed.selection });
  expect(future.identity.id).not.toBe(a.registration.identity.id);
  expect((await createProfileService(await registry.scope(future.identity.id)).getWorkspace()).principles[0]!.title).toBe("Changed future preset");
  await rm(changed.directory, { recursive: true });
  const reopened = new ProfileRegistry(registry.directory, changed.catalog); await reopened.open(root);
  expect((await readFile(path.join(a.registration.root, "DESIGN_SYSTEM.md"))).equals(before)).toBe(true);
  expect((await withProfile(await reopened.scope(a.registration.identity.id), readPresetReceipt))?.selection.version).toBe("1.0.0");
});

const corruptions: [string, (bundle: PresetPackage) => void][] = [
  ["unsupported package version", (b) => { Object.assign(b.manifest, { package_version: 2 }); }],
  ["unsupported Monet schema", (b) => { Object.assign(b.manifest, { monet_schema: 2 }); }],
  ["path injection", (b) => { b.records.foundations[0]!.id = "../../escape"; }],
  ["malformed token", (b) => { Object.assign(b.records.foundations[0]!.tokens[0]!, { value: {} }); }],
  ["broken dark reference", (b) => { b.records.foundations[0]!.tokens[0]!.modes = { dark: "{missing.token}" }; }],
  ["duplicate token", (b) => { b.records.foundations[0]!.tokens.push(b.records.foundations[0]!.tokens[0]!); }],
  ["missing record provenance", (b) => { b.manifest.provenance.shift(); }],
  ["invalid provenance reference", (b) => { b.manifest.provenance[0]!.sources = ["absent"]; }],
  ["unsupported declared modes", (b) => { b.manifest.supported_modes = ["light"]; }],
  ["broken component links", (b) => { b.records.components[0]!.foundations = ["missing"]; }],
  ["missing notices", (b) => { b.manifest.notices = []; }],
  ["Theme requirement", (b) => { Object.assign(b.records, { themes: [] }); }],
];
it.each(corruptions)("rejects %s before publishing any Profile", async (_label, mutate) => {
  const changed = await alteredCatalog(mutate); registry.presets = changed.catalog;
  await expect(registry.create({ name: "Invalid seed", kind: "preset", preset: changed.selection })).rejects.toThrow();
  expect(registry.list().profiles).toHaveLength(1);
  expect(await readdir(path.join(registry.directory, "profiles")).catch(() => [])).toEqual([]);
});
it("rejects invalid JSON, checksum corruption, unknown identity/version and URL/path inputs", async () => {
  const changed = await alteredCatalog(() => undefined), input = { name: "Invalid", kind: "preset", preset: changed.selection };
  registry.presets = changed.catalog;
  await writeFile(path.join(changed.directory, input.preset.id + ".json"), "{");
  await expect(registry.create(input)).rejects.toThrow(/checksum/);
  await expect(registry.create({ ...input, preset: { ...input.preset, id: "unknown" } })).rejects.toThrow(/Unknown preset/);
  await expect(registry.create({ ...input, preset: { ...input.preset, version: "99.0.0" } })).rejects.toThrow(/version/);
  await expect(registry.create({ ...input, preset: { ...input.preset, id: "../outside" } })).rejects.toThrow();
  await expect(registry.create({ ...input, preset: { ...input.preset, url: "https://example.com" } })).rejects.toThrow();
  const entries = [{ ...changed.selection, sha256: hash("{") }]; await writeFile(path.join(changed.directory, "index.json"), JSON.stringify(entries));
  await expect(changed.catalog.load(entries[0]!)).rejects.toThrow();
  expect(registry.list().profiles).toHaveLength(1);
});

async function interrupt(boundary: "seed" | "pending" | "registry") {
  const selection = (await catalog.list())[0]!.selection, write = durable.atomicWrite;
  let tripped = false;
  vi.spyOn(durable, "atomicWrite").mockImplementation(async (file, bytes) => {
    if (!tripped && (boundary === "seed" && file.endsWith("foundations/color.json") || boundary === "pending" && file.endsWith("pending-profile.json") || boundary === "registry" && file.endsWith("library.json"))) {
      tripped = true;
      if (boundary === "pending") await write(file, bytes);
      throw new Error("Interrupted preset creation");
    }
    await write(file, bytes);
  });
  await expect(registry.create({ name: "Interrupted", kind: "preset", preset: selection })).rejects.toThrow(/Interrupted/);
  expect(tripped).toBe(true); vi.restoreAllMocks(); return selection;
}
it.each(["seed", "pending", "registry"] as const)("recovers interrupted preset creation at %s without a partial or duplicate Profile", async (boundary) => {
  const selection = await interrupt(boundary);
  expect(registry.list().profiles).toHaveLength(1);
  const reopened = new ProfileRegistry(registry.directory); await reopened.open(root);
  if (boundary === "seed") {
    expect(reopened.list().profiles).toHaveLength(1);
    expect(await readdir(path.join(registry.directory, "profiles"))).toEqual([]);
    await reopened.create({ name: "Retried", kind: "preset", preset: selection });
  }
  expect(reopened.list().profiles).toHaveLength(2);
  const profile = reopened.list().profiles[1]!;
  expect(validateWorkspace(await createProfileService(await reopened.scope(profile.identity.id)).getWorkspace())).toEqual([]);
  expect(await readFile(path.join(profile.root, "PRESET-LICENSES.txt"), "utf8")).toContain("MIT License");
});
it.each(["record", "missing notice", "provenance", "identity"])("retains interrupted publication evidence when %s is corrupted", async (kind) => {
  await interrupt("pending");
  const pending = JSON.parse(await readFile(path.join(registry.directory, "pending-profile.json"), "utf8")) as { stage: string };
  if (kind === "record") await writeFile(path.join(pending.stage, "foundations/color.json"), "{}");
  if (kind === "missing notice") await rm(path.join(pending.stage, "PRESET-LICENSES.txt"));
  if (kind === "provenance") await writeFile(path.join(pending.stage, "PRESET.json"), "{}");
  if (kind === "identity") {
    const file = path.join(pending.stage, "profile.json"), identity = JSON.parse(await readFile(file, "utf8"));
    identity.origin = { kind: "scratch" }; await writeFile(file, JSON.stringify(identity));
  }
  await expect(new ProfileRegistry(registry.directory).open(root)).rejects.toThrow(/evidence retained/);
  expect(await readFile(path.join(registry.directory, "pending-profile.json"), "utf8")).toContain("Interrupted");
});

it.each(["before publication", "pending publication"])("resumes inline preset onboarding after %s with the pinned identity and version", async (boundary) => {
  const selection = (await catalog.list())[0]!.selection, source = registry.list().originalProfileId;
  const projectRoot = path.join(directory, "app"); await mkdir(projectRoot);
  await writeFile(path.join(projectRoot, "index.html"), "<h1>App</h1>");
  const input = { operation_id: randomUUID(), project: { root: projectRoot }, profile: { name: "Interrupted inline", kind: "preset", preset: selection } };
  const write = durable.atomicWrite;
  vi.spyOn(durable, "atomicWrite").mockImplementation(async (file, bytes) => {
    if (file.endsWith("pending-profile.json")) {
      if (boundary === "pending publication") await write(file, bytes);
      throw new Error("Interrupted inline publication");
    }
    await write(file, bytes);
  });
  await expect(new ProjectOnboarding(registry).run(source, input)).rejects.toThrow(/Interrupted inline/);
  const reserved = JSON.parse(await readFile(path.join(registry.directory, "project-onboardings", input.operation_id + ".json"), "utf8")) as { profile_id: string; project_id: string };
  vi.restoreAllMocks();
  // A durable staged seed can recover even after that version disappears from the catalog.
  const reopened = new ProfileRegistry(registry.directory, boundary === "pending publication" ? new PresetCatalog(path.join(directory, "removed-catalog")) : catalog);
  await reopened.open(root);
  const resumed = new ProjectOnboarding(reopened);
  const [a, b] = await Promise.all([resumed.run(source, input), resumed.run(source, input)]);
  expect(a).toEqual(b); expect(a.profile_id).toBe(reserved.profile_id); expect(a.project.id).toBe(reserved.project_id);
  expect(reopened.list().profiles).toHaveLength(2);
  expect((await withProfile(await reopened.scope(a.profile_id), readPresetReceipt))?.selection).toEqual(selection);
});

it.each(ids)("connects Projects and scopes Surfaces, Gaps and Safe Apply for %s", async (id) => {
  const a = await create(id), b = await create(id), projectRoot = path.join(directory, "app");
  await mkdir(projectRoot); await writeFile(path.join(projectRoot, "index.html"), "<h1>Project</h1>");
  const input = { operation_id: randomUUID(), project: { root: projectRoot }, profile: { name: "Inline preset", kind: "preset", preset: a.detail.selection } };
  const onboarding = new ProjectOnboarding(registry), sourceId = registry.list().originalProfileId;
  const connected = await onboarding.run(sourceId, input);
  expect(await onboarding.run(sourceId, input)).toEqual(connected);
  const scope = await registry.scope(connected.profile_id);
  expect((await withProfile(scope, listProjects))[0]?.id).toBe(connected.project.id);
  await expect(withProfile(b.scope, () => getProject(connected.project.id))).rejects.toThrow();
  const surface = await withProfile(scope, () => saveSurface({ input: { title: "Observed form", html: '<label>Name<input></label><button>Continue</button>' }, selection: { mode: "light", project: { project_id: connected.project.id, binding_revision: 1 } } }));
  expect(surface.run.profile_id).toBe(connected.profile_id);
  await expect(withProfile(b.scope, () => getSurface(surface.saved!.id))).rejects.toThrow();
  const store = createProfileStore(a.scope), other = createProfileStore(b.scope);
  const before = await other.files.loadWorkspace();
  const gap = await store.files.createGap({ problem: "Clarify the button action guidance" });
  await store.files.diagnoseSavedGap(gap.id);
  await store.files.saveGapReview(gap.id, { classification: "weak_guidance", conclusion: "Clarify the action", record_keys: ["component:button"] });
  const proposal = await store.proposals.createProposal({ gap_id: gap.id });
  const edited = await store.proposals.saveProposalRevision(proposal.id, { summary: "Clarify button", rationale: "Explicit action guidance", changes: [{ target: "component:button", field: "notes", after: "Keep the action label explicit." }] });
  const revision = edited.revisions[0]!, approval = { revision: revision.number, hash: revision.hash };
  await store.proposals.approveProposal(proposal.id, approval);
  await cp(path.join(a.registration.root, "gaps", gap.id + ".json"), path.join(b.registration.root, "gaps", gap.id + ".json"));
  await cp(path.join(a.registration.root, "proposals", proposal.id + ".json"), path.join(b.registration.root, "proposals", proposal.id + ".json"));
  await expect(other.files.getGap(gap.id)).rejects.toThrow(/different Profile/);
  await expect(other.applications.applyProposal(proposal.id, approval)).rejects.toThrow(/different Profile/);
  expect((await store.applications.applyProposal(proposal.id, approval)).receipt?.profile_id).toBe(a.registration.identity.id);
  expect((await other.files.loadWorkspace()).components).toEqual(before.components);
  expect((await withProfile(a.scope, readPresetReceipt))?.selection).toEqual(a.detail.selection);
});
