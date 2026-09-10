import { z } from "zod";
import { projectConnectSchema, type ProjectRecord } from "./projects.js";

/** One inline Profile creation + Project connection, never a general workflow. */
export const projectOnboardingSchema = z.object({
  operation_id: z.string().uuid(),
  project: projectConnectSchema,
  profile: z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(["scratch", "monet-starter"]) }).strict(),
}).strict();
export type ProjectOnboardingInput = z.infer<typeof projectOnboardingSchema>;
export interface ProjectOnboardingResult { operation_id: string; profile_id: string; project: ProjectRecord }
