import { projectOnboardingSchema, type ProjectOnboardingInput } from "../shared/projectOnboarding";
import { z } from "zod";

const prefix = "monet:project-onboarding:";
const savedSchema = z.object({ input: projectOnboardingSchema,
  completed: z.object({ profileId: z.string().min(1), projectId: z.string().min(1) }).strict().optional(),
}).strict();
export function pendingOnboarding(profileId: string): ProjectOnboardingInput | null {
  const saved = localStorage.getItem(prefix + profileId);
  return saved ? savedSchema.parse(JSON.parse(saved)).input : null;
}
export function rememberOnboarding(profileId: string, input: ProjectOnboardingInput, completed?: { profileId: string; projectId: string }): void {
  // Fail before submitting if browser persistence is unavailable. Retrying must keep the same ID.
  const existing = pendingOnboarding(profileId);
  if (existing && existing.operation_id !== input.operation_id) throw new Error("Another saved connection exists in this Profile. Reload to resume it.");
  localStorage.setItem(prefix + profileId, JSON.stringify({ input, completed }));
}
export function forgetOnboarding(profileId: string): void { localStorage.removeItem(prefix + profileId); }
export function acknowledgeOnboarding(profileId: string, projectId: string): void {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith(prefix))) {
    try {
      const saved = savedSchema.parse(JSON.parse(localStorage.getItem(key)!));
      if (saved.completed?.profileId === profileId && saved.completed?.projectId === projectId) localStorage.removeItem(key);
    } catch { /* Corrupt resume evidence is retained, never silently retried. */ }
  }
}
