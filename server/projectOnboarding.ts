import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { projectOnboardingSchema, type ProjectOnboardingResult } from "../shared/projectOnboarding.js";
import { ProfileRegistry } from "./profileRegistry.js";
import { atomicWrite } from "./durableFiles.js";
import { canonicalProjectRoot, connectProject, getProject } from "./projectStore.js";
import { withProfile } from "./workspace.js";
import { withWorkspaceRead } from "./writeLock.js";

const recordSchema = z.object({ version: z.literal(1), source_profile_id: z.string().uuid(),
  input: projectOnboardingSchema, profile_id: z.string().uuid(), project_id: z.string().uuid(),
  completed: z.boolean().default(false),
}).strict();

/** The immutable reservation is durable before Profile publication. Published records themselves
 * are the completion receipts. Replaying only fills the missing step; it never allocates new IDs.
 * One editing service owns the library, as in Profiles V1. No Profile write lock spans publication.
 */
export class ProjectOnboarding {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private registry: ProfileRegistry) {}
  run(sourceId: string, raw: unknown): Promise<ProjectOnboardingResult> {
    const input = projectOnboardingSchema.parse(raw);
    const run = this.chain.then(async () => {
      const source = await this.registry.scope(sourceId);
      await withProfile(source, () => withWorkspaceRead(async () => undefined));
      const file = path.join(this.registry.directory, "project-onboardings", `${input.operation_id}.json`);
      let record: z.infer<typeof recordSchema>;
      try { record = recordSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await withProfile(source, () => canonicalProjectRoot(input.project.root));
        record = { version: 1, source_profile_id: sourceId, input, profile_id: randomUUID(), project_id: randomUUID(), completed: false };
        await withProfile(Object.freeze({ root: this.registry.directory }), () => atomicWrite(file, JSON.stringify(record, null, 2) + "\n"));
      }
      if (record.source_profile_id !== sourceId || JSON.stringify(record.input) !== JSON.stringify(input)) {
        throw Object.assign(new Error("This onboarding ID belongs to a different Profile or request. Resume the original connection."), { status: 409 });
      }
      const profile = await withProfile(Object.freeze({ root: this.registry.directory }), () => this.registry.create(input.profile, record.profile_id));
      const scope = await this.registry.scope(profile.identity.id);
      const project = await withProfile(scope, () => record.completed ? getProject(record.project_id) : connectProject(input.project, record.project_id));
      if (!record.completed) {
        record.completed = true;
        await withProfile(Object.freeze({ root: this.registry.directory }), () => atomicWrite(file, JSON.stringify(record, null, 2) + "\n"));
      }
      return { operation_id: input.operation_id, profile_id: profile.identity.id, project };
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
