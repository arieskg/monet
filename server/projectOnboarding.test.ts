import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as durable from "./durableFiles.js";
import { ProfileRegistry } from "./profileRegistry.js";
import { ProjectOnboarding } from "./projectOnboarding.js";
import { withProfile } from "./workspace.js";
import { disconnectProject, listProjects } from "./projectStore.js";

let directory: string, original: string, library: string, registry: ProfileRegistry, source: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-onboarding-"));
  original = path.join(directory, "original"); library = path.join(directory, "library");
  registry = new ProfileRegistry(library); await registry.open(original); source = registry.list().originalProfileId;
  await mkdir(path.join(directory, "app")); await writeFile(path.join(directory, "app", "index.html"), "<h1>App</h1>");
});
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });
const input = () => ({ operation_id: randomUUID(), profile: { name: "Same name", kind: "scratch" as const }, project: { root: path.join(directory, "app") } });
const reservation = async (id: string) => JSON.parse(await readFile(path.join(library, "project-onboardings", `${id}.json`), "utf8"));

for (const boundary of ["after reservation", "before publication", "pending publication", "after publication", "after binding", "after project write", "after completion"] as const) {
  it(`resumes the same IDs after ${boundary} and a fresh registry/service`, async () => {
    const request = input(), write = durable.atomicWrite;
    let tripped = false;
    vi.spyOn(durable, "atomicWrite").mockImplementation(async (file, contents) => {
      const data = typeof contents === "string" && contents.startsWith("{") ? JSON.parse(contents) : null;
      const match = !tripped && (
        boundary === "after reservation" && file.includes("project-onboardings") ||
        boundary === "before publication" && file.endsWith("pending-profile.json") ||
        boundary === "pending publication" && file.endsWith("pending-profile.json") ||
        boundary === "after publication" && file.endsWith("library.json") && data?.profiles.length === 2 ||
        boundary === "after binding" && file.endsWith("library.json") && data?.projects.length === 1 ||
        boundary === "after project write" && path.basename(path.dirname(file)) === "projects" ||
        boundary === "after completion" && file.includes("project-onboardings") && data?.completed === true
      );
      if (match) { tripped = true; if (boundary !== "before publication") await write(file, contents); throw new Error("Simulated interruption"); }
      await write(file, contents);
    });
    await expect(new ProjectOnboarding(registry).run(source, request)).rejects.toThrow("Simulated interruption");
    expect(tripped).toBe(true);
    const reserved = await reservation(request.operation_id);
    vi.restoreAllMocks();
    registry = new ProfileRegistry(library); await registry.open(original);
    const resumed = new ProjectOnboarding(registry);
    const [one, two] = await Promise.all([resumed.run(source, request), resumed.run(source, request)]);
    expect(one).toEqual(two);
    expect(one.profile_id).toBe(reserved.profile_id); expect(one.project.id).toBe(reserved.project_id);
    expect(registry.list().profiles).toHaveLength(2);
    expect(await withProfile(await registry.scope(one.profile_id), listProjects)).toHaveLength(1);
    expect((await readdir(path.join(library, "profiles"))).some((n) => n.startsWith(".creating-"))).toBe(false);
    expect((await reservation(request.operation_id)).completed).toBe(true);
  });
}

it("binds operation identity to its source Profile and exact input, never a name", async () => {
  const service = new ProjectOnboarding(registry), request = input();
  const [one, duplicate] = await Promise.all([service.run(source, request), service.run(source, request)]);
  expect(duplicate).toEqual(one);
  await registry.renameProfile(one.profile_id, "Renamed during retry");
  expect((await service.run(source, request)).profile_id).toBe(one.profile_id);
  await expect(service.run(source, { ...request, profile: { ...request.profile, name: "Different" } })).rejects.toMatchObject({ status: 409 });
  await expect(service.run(one.profile_id, request)).rejects.toMatchObject({ status: 409 });
  const two = await service.run(source, { ...request, operation_id: randomUUID() });
  expect(two.profile_id).not.toBe(one.profile_id);
  await withProfile(await registry.scope(one.profile_id), () => disconnectProject(one.project.id));
  await expect(service.run(source, request)).rejects.toThrow(); // A completed replay never resurrects a disconnected Project.
  expect(registry.list().profiles).toHaveLength(3);
});

it("refuses corrupt resume evidence and invalid roots before Profile creation", async () => {
  const service = new ProjectOnboarding(registry), request = input();
  await expect(service.run(source, { ...request, project: { root: path.join(directory, "missing") } })).rejects.toThrow();
  expect(registry.list().profiles).toHaveLength(1);
  await mkdir(path.join(library, "project-onboardings"), { recursive: true });
  await writeFile(path.join(library, "project-onboardings", `${request.operation_id}.json`), "broken");
  await expect(service.run(source, request)).rejects.toThrow();
  expect(registry.list().profiles).toHaveLength(1);
});
