import { z } from "zod";
import { profileSeedSchema } from "./presets.js";
import { projectConnectSchema, type ProjectRecord } from "./projects.js";

/** One inline Profile creation + Project connection, never a general workflow. */
export const projectOnboardingSchema = z.object({
  operation_id: z.string().uuid(),
  project: projectConnectSchema,
  profile: profileSeedSchema,
}).strict();
export type ProjectOnboardingInput = z.infer<typeof projectOnboardingSchema>;
export interface ProjectOnboardingResult { operation_id: string; profile_id: string; project: ProjectRecord }
