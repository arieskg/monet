import { z } from "zod";
/** Profile identity is independent of local paths, projects and compatibility Themes. */
export interface ProfileIdentity {
  version: 1;
  id: string;
  name: string;
  created_at: string;
  origin: { kind: "enrolled" | "scratch" | "monet-starter" | "fork"; source_profile_id?: string; source_fingerprint?: string; starter_version?: string };
}
export interface ProfileRegistration { identity: ProfileIdentity; root: string; unavailable?: string }
export interface ProfileLibrary { profiles: ProfileRegistration[]; originalProfileId: string; defaultProfileId?: string }
export interface ProjectBinding { id: string; name: string; profileId: string; bindingRevision: number }
export interface EvaluationScope { profileId: string; knowledgeFingerprint: string; mode: "light" | "dark" }
/** Absent only on historical records. Version 2 binds scope without changing legacy hashes. */
export interface ProfileOwned { profile_id?: string; scope_version?: 2 }

export const projectEvidenceSchema = z.object({ project_id: z.string().uuid(), binding_revision: z.number().int().positive() }).strict();
export type ProjectEvidenceBinding = z.infer<typeof projectEvidenceSchema>;
