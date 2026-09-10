import { mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMonetMcpServer } from "./server.js";
import { ProfileRegistry, readOnlyProfileScope } from "../server/profileRegistry.js";
import { createProfileService, createProfileStore } from "../server/profileService.js";
import { setWorkspaceRoot, BUNDLED_WORKSPACE } from "../server/workspace.js";
let directory: string;
afterEach(async () => { setWorkspaceRoot(BUNDLED_WORKSPACE); if (directory) await rm(directory, { recursive: true, force: true }); });
it("binds all MCP tools/resources and aliases to one Profile despite editor switching", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-profile-mcp-"));
  const root = path.join(directory, "original"); await mkdir(root);
  const registry = new ProfileRegistry(path.join(directory, "library")); await registry.open(root);
  const a = await registry.scope(registry.list().originalProfileId), other = await registry.create({ name: "Other", kind: "scratch" }), b = await registry.scope(other.identity.id);
  for (const [scope, title] of [[a, "Guidance A"], [b, "Secret guidance B"]] as const) await createProfileStore(scope).files.savePrinciple("same-id", { id: "same-id", title, body: "# " + title, order: 0, updated_at: "" });
  expect(() => createMonetMcpServer(createProfileService(a), b.identity!.id)).toThrow(/does not match/);
  const server = createMonetMcpServer(createProfileService(a), a.identity!.id), client = new Client({ name: "profile-test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    setWorkspaceRoot(b.root);
    const resources = await client.listResources(); expect(resources.resources.some((r) => r.uri === `monet://profiles/${a.identity!.id}/principles/same-id`)).toBe(true);
    for (const uri of ["monet://principles/same-id", `monet://profiles/${a.identity!.id}/principles/same-id`, `monet://profiles/${a.identity!.id}/tokens/dark`, "monet://catalog"]) {
      const output = JSON.stringify(await client.readResource({ uri })); expect(output).toContain(a.identity!.id); expect(output).not.toContain("Secret guidance B"); expect(output).not.toContain(a.root);
    }
    await expect(client.readResource({ uri: `monet://profiles/${b.identity!.id}/principles/same-id` })).rejects.toThrow();
    for (const [name, args] of [["get_design_context", { query: "Guidance", detail: "compact" }], ["get_design_context", { query: "Guidance", detail: "full" }], ["search_references", { query: "Secret" }], ["review_design_usage", { mode: "dark", usages: [{ kind: "style", property: "padding", value: "13px" }] }]] as const) {
      const result = await client.callTool({ name, arguments: { ...args, profileId: a.identity!.id } });
      expect(result.isError).not.toBe(true); expect(JSON.stringify(result)).toContain(a.identity!.id); expect(JSON.stringify(result)).not.toContain("Secret guidance B");
      const wrong = await client.callTool({ name, arguments: { ...args, profileId: b.identity!.id } }); expect(wrong.isError).toBe(true);
    }
    const context = await client.callTool({ name: "get_design_context", arguments: {} });
    expect(JSON.stringify(context)).toContain("knowledgeFingerprint"); expect(JSON.stringify(context)).toContain(`monet://profiles/${a.identity!.id}/principles/same-id`);
  } finally { await client.close(); await server.close(); }
});
it("read-only root binding refuses mismatched identity and does not enroll an empty workspace", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "monet-read-only-"));
  const scope = await readOnlyProfileScope(directory);
  await createProfileService(scope).getWorkspace(); expect(await readdir(directory)).toEqual([]);
  await expect(readOnlyProfileScope(directory, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/does not match/);
  expect(await readdir(directory)).toEqual([]);
});
