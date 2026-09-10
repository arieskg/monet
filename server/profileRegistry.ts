import { randomUUID, createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ProfileIdentity, ProfileLibrary, ProfileRegistration, ProjectBinding } from "../shared/profiles.js";
import { atomicWrite, durableRemove, syncDirectory } from "./durableFiles.js";
import { withProfile, type ProfileScope } from "./workspace.js";
import { initializeStore, loadWorkspace } from "./fileStore.js";
import { recoverApplications } from "./applicationStore.js";
import { withWorkspaceRead } from "./writeLock.js";
import { validateWorkspace } from "./validate.js";
import { instantiateMonetStarter } from "./monetStarter.js";
import { gapKnowledge, knowledgeFingerprint } from "./gapDiagnosis.js";

const id = z.string().uuid();
const identitySchema = z.object({ version: z.literal(1), id, name: z.string().trim().min(1).max(100), created_at: z.string().datetime(),
  origin: z.object({ kind: z.enum(["enrolled", "scratch", "monet-starter", "fork"]), source_profile_id: id.optional(), source_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), starter_version: z.string().optional() }).strict() }).strict();
const registrationSchema = z.object({ identity: identitySchema, root: z.string().min(1) }).strict();
const pendingSchema = registrationSchema.extend({ stage: z.string().optional(), rename: z.boolean().optional() });
const projectSchema = z.object({ id, name: z.string().trim().min(1).max(100), profileId: id, bindingRevision: z.number().int().positive() }).strict();
const librarySchema = z.object({ version: z.literal(1), originalProfileId: id, profiles: z.array(registrationSchema), projects: z.array(projectSchema).default([]) }).strict();
type Library = z.infer<typeof librarySchema>;
const MANIFEST = "profile.json";
const KNOWLEDGE = ["principles", "foundations", "taxonomy", "components", "primitives", "patterns", "themes", "sources"];
const OWNED_PATHS = [...KNOWLEDGE, "references", "decisions", "tokens", "gaps", "proposals", "applications", "surfaces", "DESIGN_SYSTEM.md", "design-system.json", "STARTER-LICENSE.txt", MANIFEST];
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";
const conflict = (message: string) => Object.assign(new Error(message), { status: 409 });
async function json(file: string): Promise<unknown> { return JSON.parse(await readFile(file, "utf8")); }
export async function readProfileIdentity(root: string): Promise<ProfileIdentity | undefined> {
  try { return identitySchema.parse(await json(path.join(root, MANIFEST))); } catch (e) { if (missing(e)) return undefined; throw e; }
}
async function canonicalPath(root: string): Promise<string> {
  const absolute = path.resolve(root);
  try { return await realpath(absolute); } catch (e) {
    if (!missing(e) || path.dirname(absolute) === absolute) throw e;
    return path.join(await canonicalPath(path.dirname(absolute)), path.basename(absolute));
  }
}
function overlap(a: string, b: string): boolean { return a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep); }
/** Files backing two Profiles must never alias, including nested symlinks and hard links. */
export async function verifyProfileTree(root: string): Promise<void> {
  async function visit(file: string): Promise<void> {
    let stat; try { stat = await lstat(file); } catch (e) { if (missing(e)) return; throw e; }
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1) throw conflict("Profile storage cannot contain symlinks or multiply linked files.");
    if (stat.isDirectory()) for (const name of await readdir(file)) await visit(path.join(file, name));
  }
  for (const name of OWNED_PATHS) await visit(path.join(root, name));
}
export async function readOnlyProfileScope(root: string, expectedId?: string): Promise<ProfileScope> {
  const canonical = await realpath(root).catch((e) => { if (missing(e) && !expectedId) return path.resolve(root); throw e; });
  const parsedIdentity = await readProfileIdentity(canonical);
  const identity = parsedIdentity ? Object.freeze({ ...parsedIdentity, origin: Object.freeze({ ...parsedIdentity.origin }) }) : undefined;
  const inode = await lstat(canonical).catch((e) => { if (missing(e)) return undefined; throw e; });
  if (expectedId && identity?.id !== expectedId) throw conflict("Configured Profile ID does not match this workspace. No fallback is allowed.");
  return Object.freeze({ root: canonical, identity, verify: async () => {
    const currentInode = await lstat(canonical).catch((e) => { if (missing(e)) return undefined; throw e; });
    if (currentInode?.ino !== inode?.ino || currentInode?.dev !== inode?.dev) throw conflict("Profile storage identity changed. Restart after an offline move.");
    if (await realpath(canonical).catch(() => canonical) !== canonical || (await readProfileIdentity(canonical))?.id !== identity?.id) throw conflict("Profile storage identity changed. Restart with the correct registration.");
    await verifyProfileTree(canonical);
  } });
}

export class ProfileRegistry {
  private chain: Promise<unknown> = Promise.resolve();
  private data!: Library;
  private unavailable = new Map<string, string>();
  constructor(public directory = process.env.MONET_LIBRARY ?? path.join(os.homedir(), ".monet")) {}
  private async save(data: Library) { await atomicWrite(path.join(this.directory, "library.json"), JSON.stringify(data, null, 2) + "\n"); this.data = structuredClone(data); }
  private exclusive<T>(work: () => Promise<T>): Promise<T> { const run = this.chain.then(async () => { if (await lstat(path.join(this.directory, "pending-profile.json")).then(() => true, (e) => { if (missing(e)) return false; throw e; })) throw conflict("Profile publication is pending. Restart to recover before changing the library."); return work(); }); this.chain = run.catch(() => undefined); return run; }
  private checkRoot(root: string, excluding?: string) {
    if (overlap(root, path.resolve(this.directory)) && !root.startsWith(path.resolve(this.directory, "profiles") + path.sep)) throw conflict("Profile and library roots must not overlap.");
    if (this.data?.profiles.some((p) => p.identity.id !== excluding && overlap(root, p.root))) throw conflict("Profile roots must not duplicate or overlap another registration.");
  }
  async open(originalRoot: string): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    this.directory = await realpath(this.directory);
    try { this.data = librarySchema.parse(await json(path.join(this.directory, "library.json"))); }
    catch (e) { if (!missing(e)) throw e; this.data = { version: 1, originalProfileId: randomUUID(), profiles: [], projects: [] }; }
    // A completed publication whose registry write failed is recoverable, never silently deleted.
    try {
      const pending = pendingSchema.parse(await json(path.join(this.directory, "pending-profile.json")));
      if (pending.stage) {
        if (pending.root !== path.join(this.directory, "profiles", pending.identity.id) || pending.stage !== path.join(this.directory, "profiles", `.creating-${pending.identity.id}`)) throw conflict("Invalid staged Profile paths; evidence retained.");
        if (!await lstat(pending.root).then(() => true, (e) => { if (missing(e)) return false; throw e; })) {
          if ((await readProfileIdentity(pending.stage))?.id !== pending.identity.id) throw conflict("Incomplete Profile stage; evidence retained.");
          await verifyProfileTree(pending.stage); await rename(pending.stage, pending.root); await syncDirectory(path.dirname(pending.root));
        }
      }
      if ((await readProfileIdentity(pending.root))?.id !== pending.identity.id) throw conflict("Incomplete Profile publication requires repair; pending evidence retained.");
      this.checkRoot(pending.root, pending.identity.id);
      const existing = this.data.profiles.find((p) => p.identity.id === pending.identity.id);
      if (existing && existing.root !== pending.root) throw conflict("Pending Profile identity is already registered elsewhere.");
      if (pending.rename) await atomicWrite(path.join(pending.root, MANIFEST), JSON.stringify(pending.identity, null, 2) + "\n");
      await this.save({ ...this.data, originalProfileId: this.data.profiles.length ? this.data.originalProfileId : pending.identity.id, profiles: [...this.data.profiles.filter((p) => p.identity.id !== pending.identity.id), { identity: pending.identity, root: pending.root }] });
      await durableRemove(path.join(this.directory, "pending-profile.json"));
    } catch (e) { if (!missing(e)) throw e; }
    const requestedRoot = await canonicalPath(originalRoot);
    const registeredOriginal = this.data.profiles.find((p) => p.root === requestedRoot);
    const root = registeredOriginal?.root ?? await realpath(originalRoot).catch(async (e) => { if (!missing(e)) throw e; await mkdir(originalRoot, { recursive: true }); return realpath(originalRoot); });
    if (!this.data.profiles.some((p) => p.root === root)) await this.enroll(root);
    const roots: string[] = [], ids = new Set<string>();
    for (const profile of this.data.profiles) {
      if (ids.has(profile.identity.id) || roots.some((r) => overlap(r, profile.root))) throw conflict("Duplicate Profile identity or overlapping roots in library.");
      ids.add(profile.identity.id); roots.push(profile.root);
      try {
        const scope = await this.scope(profile.identity.id);
        await withProfile(scope, async () => { await recoverProfile(); await withWorkspaceRead(() => loadWorkspace()); });
      } catch (e) { this.unavailable.set(profile.identity.id, e instanceof Error ? e.message : "Profile unavailable"); }
    }
    if (!ids.has(this.data.originalProfileId)) throw conflict("Original Profile registration is missing.");
    const projectIds = new Set<string>();
    for (const project of this.data.projects) {
      if (projectIds.has(project.id) || !ids.has(project.profileId)) throw conflict("Duplicate Project or unknown bound Profile in library.");
      projectIds.add(project.id);
    }
  }
  private async publish(registration: ProfileRegistration): Promise<void> {
    await atomicWrite(path.join(this.directory, "pending-profile.json"), JSON.stringify(registration));
    await this.save({ ...this.data, originalProfileId: this.data.profiles.length ? this.data.originalProfileId : registration.identity.id, profiles: [...this.data.profiles, registration] });
    await durableRemove(path.join(this.directory, "pending-profile.json"));
  }
  async enroll(rootInput: string): Promise<ProfileRegistration> {
    return this.exclusive(async () => {
      const root = await realpath(rootInput); this.checkRoot(root);
      const previous = await readProfileIdentity(root);
      if (previous && this.data.profiles.some((p) => p.identity.id === previous.id)) throw conflict("Profile identity already registered; use an explicit move or fork.");
      const empty = !previous && (await readdir(root)).length === 0;
      await verifyProfileTree(root);
      // Recovery uses legacy algorithms before an identity is added. Enrollment never regenerates exports.
      await withProfile(await readOnlyProfileScope(root), async () => { await recoverProfile(); await loadWorkspace(); });
      // A directory basename is only a label; it must still satisfy the identity schema or the library becomes unreadable.
      const identity: ProfileIdentity = previous ?? identitySchema.parse({ version: 1, id: randomUUID(), name: path.basename(root).trim().slice(0, 100) || "Original profile", created_at: new Date().toISOString(), origin: { kind: empty ? "scratch" : "enrolled" } });
      if (!previous) await atomicWrite(path.join(root, MANIFEST), JSON.stringify(identity, null, 2) + "\n");
      // Empty roots follow the same Theme-free scaffold as explicit scratch creation. Persist
      // identity first so interrupted initialization can resume before registration on restart.
      // Existing enrolled history never enters initialization or export regeneration.
      if (identity.origin.kind === "scratch") await withProfile(await readOnlyProfileScope(root, identity.id), () => initializeStore(false));
      const entry = { identity, root }; await this.publish(entry); return entry;
    });
  }
  async profileForRoot(root: string): Promise<string> {
    const canonical = await canonicalPath(root);
    const profile = this.data.profiles.find((p) => p.root === canonical);
    if (!profile) throw conflict("Startup workspace is not registered.");
    return profile.identity.id;
  }
  list(): ProfileLibrary { return { originalProfileId: this.data.originalProfileId, profiles: this.data.profiles.map((p) => ({ ...structuredClone(p), unavailable: this.unavailable.get(p.identity.id) })) }; }
  async scope(profileId: string): Promise<ProfileScope> {
    const entry = this.data.profiles.find((p) => p.identity.id === profileId);
    if (!entry) throw Object.assign(new Error("Unknown Profile."), { status: 404 });
    if (await realpath(entry.root) !== entry.root) throw conflict("Registered Profile root moved or became a symlink.");
    const scope = await readOnlyProfileScope(entry.root, profileId);
    await scope.verify?.();
    return Object.freeze({ ...scope, assertProject: (binding: import("../shared/profiles.js").ProjectEvidenceBinding) => this.assertBinding(binding.project_id, profileId, binding.binding_revision) });
  }
  async create(raw: unknown): Promise<ProfileRegistration> {
    const input = z.object({ name: identitySchema.shape.name, kind: z.enum(["scratch", "monet-starter", "fork"]), sourceProfileId: id.optional(), includeReferences: z.boolean().default(false) }).strict().parse(raw);
    if ((input.kind === "fork") !== Boolean(input.sourceProfileId)) throw conflict("Only forks require a source Profile.");
    return this.exclusive(async () => {
      const profileId = randomUUID(), root = path.resolve(this.directory, "profiles", profileId);
      const stage = path.resolve(this.directory, "profiles", `.creating-${profileId}`);
      await mkdir(stage, { recursive: true });
      let published = false;
      try {
        let origin: ProfileIdentity["origin"] = { kind: input.kind };
        if (input.kind === "monet-starter") origin = { kind: "monet-starter", ...await instantiateMonetStarter(stage) };
        if (input.kind === "fork") {
          const source = await this.scope(input.sourceProfileId!);
          await withProfile(source, () => withWorkspaceRead(async () => {
            await verifyProfileTree(source.root);
            const workspace = await loadWorkspace();
            const source_fingerprint = workspace.knowledgeFingerprint ?? knowledgeFingerprint(gapKnowledge(workspace));
            origin = { kind: "fork", source_fingerprint, source_profile_id: input.sourceProfileId! };
            for (const name of [...KNOWLEDGE, "STARTER-LICENSE.txt", ...(input.includeReferences ? ["references"] : [])]) {
              await cp(path.join(source.root, name), path.join(stage, name), { recursive: true, errorOnExist: true, force: false }).catch((e) => { if (!missing(e)) throw e; });
            }
          }));
        }
        const identity: ProfileIdentity = { version: 1, id: profileId, name: input.name, created_at: new Date().toISOString(), origin };
        await atomicWrite(path.join(stage, MANIFEST), JSON.stringify(identity, null, 2) + "\n");
        await withProfile(Object.freeze({ root: stage, identity }), async () => {
          // Starter/fork Themes, when present, are copied compatibility data, never a prerequisite.
          await initializeStore(false);
          const errors = validateWorkspace(await loadWorkspace()).filter((f) => f.level === "error");
          if (errors.length) throw conflict(`Profile seed validation failed: ${errors.map((f) => f.detail).join("; ")}`);
        });
        // Sync every copied file before publication, not only generated exports.
        async function flush(dir: string): Promise<void> { for (const entry of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await flush(file); else await atomicWrite(file, await readFile(file)); } await syncDirectory(dir); }
        await flush(stage);
        const registration = { identity, root };
        await atomicWrite(path.join(this.directory, "pending-profile.json"), JSON.stringify({ ...registration, stage }));
        published = true; // From here, retain the stage/publication for startup recovery on any failure.
        await rename(stage, root); await syncDirectory(path.dirname(root));
        await this.save({ ...this.data, profiles: [...this.data.profiles, registration] });
        await durableRemove(path.join(this.directory, "pending-profile.json")); return registration;
      } catch (e) { if (!published) await rm(stage, { recursive: true, force: true }); throw e; }
    });
  }
  async renameProfile(profileId: string, name: string): Promise<ProfileRegistration> {
    return this.exclusive(async () => {
      const scope = await this.scope(profileId);
      const identity = identitySchema.parse({ ...scope.identity, name });
      const entry = { identity, root: scope.root };
      // Refuse before recording a pending publication: a blocked Profile must not poison the library or rename itself at the next start.
      await withProfile(scope, () => withWorkspaceRead(async () => undefined));
      await atomicWrite(path.join(this.directory, "pending-profile.json"), JSON.stringify({ ...entry, rename: true }));
      await withProfile(scope, () => withWorkspaceRead(async () => { await atomicWrite(path.join(scope.root, MANIFEST), JSON.stringify(identity, null, 2) + "\n"); }));
      await this.save({ ...this.data, profiles: this.data.profiles.map((p) => p.identity.id === profileId ? entry : p) });
      await durableRemove(path.join(this.directory, "pending-profile.json")); return entry;
    });
  }
  async move(profileId: string, rootInput: string): Promise<void> {
    return this.exclusive(async () => {
      const previous = this.data.profiles.find((p) => p.identity.id === profileId);
      if (!previous) throw conflict("Unknown Profile.");
      // Registration repair only after an offline filesystem move. Never retarget live work.
      if (await lstat(previous.root).then(() => true, (e) => { if (missing(e)) return false; throw e; })) throw conflict("Stop editing and move the original directory offline before repairing its registration.");
      const root = await realpath(rootInput); this.checkRoot(root, profileId);
      const scope = await readOnlyProfileScope(root, profileId); await scope.verify?.();
      await withProfile(scope, () => recoverApplications());
      await this.save({ ...this.data, profiles: this.data.profiles.map((p) => p.identity.id === profileId ? { ...p, root } : p) });
      this.unavailable.delete(profileId);
    });
  }
  async bindProject(raw: unknown): Promise<ProjectBinding> {
    const project = projectSchema.parse(raw);
    return this.exclusive(async () => {
      await this.scope(project.profileId);
      const previous = this.data.projects.find((p) => p.id === project.id);
      if (previous && (previous.profileId !== project.profileId || previous.bindingRevision !== project.bindingRevision)) throw conflict("Project reassignment is not supported; historical evidence retains its binding.");
      if (!previous && project.bindingRevision !== 1) throw conflict("New Project bindings start at revision 1.");
      await this.save({ ...this.data, projects: [...this.data.projects.filter((p) => p.id !== project.id), project] }); return project;
    });
  }
  assertBinding(projectId: string, profileId: string, revision: number): void {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project || project.profileId !== profileId || project.bindingRevision !== revision) throw conflict("Project/Profile binding mismatch.");
  }
}

export function legacyProfileId(root: string): string { return `legacy-${createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 24)}`; }

async function recoverProfile(): Promise<void> {
  for (const recovery of await recoverApplications()) console.log(`Recovered application ${recovery.application_id} for proposal ${recovery.proposal_id}: ${recovery.outcome === "completed" ? "completed" : recovery.restored ? "rolled back, every record restored" : `rolled back, restore NOT verified (${recovery.failure ?? "unknown"})`}`);
}
