// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { acknowledgeOnboarding, forgetOnboarding, pendingOnboarding, rememberOnboarding } from "../projectOnboarding";

const input = { operation_id: "11111111-1111-4111-8111-111111111111", profile: { name: "Blank", kind: "scratch" as const }, project: { root: "/tmp/app" } };
afterEach(() => localStorage.clear());

it("retains the pointer until the matching destination loads, scoped to its original Profile", () => {
  rememberOnboarding("source", input);
  expect(pendingOnboarding("source")).toEqual(input);
  expect(pendingOnboarding("other")).toBeNull();
  rememberOnboarding("source", input, { profileId: "target", projectId: "project" });
  acknowledgeOnboarding("other", "project");
  expect(pendingOnboarding("source")).toEqual(input);
  acknowledgeOnboarding("target", "project");
  expect(pendingOnboarding("source")).toBeNull();
});

it("does not overwrite another tab's operation with a late response or corrupt resume evidence", () => {
  rememberOnboarding("source", input);
  forgetOnboarding("source"); // Explicit new connection.
  const another = { ...input, operation_id: "22222222-2222-4222-8222-222222222222" };
  rememberOnboarding("source", another);
  expect(() => rememberOnboarding("source", input, { profileId: "target", projectId: "project" })).toThrow(/Another saved connection/);
  expect(pendingOnboarding("source")).toEqual(another);
  localStorage.setItem("monet:project-onboarding:source", "corrupt");
  expect(() => rememberOnboarding("source", input)).toThrow();
  expect(localStorage.getItem("monet:project-onboarding:source")).toBe("corrupt");
});
