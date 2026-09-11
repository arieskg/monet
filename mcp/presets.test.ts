import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMonetMcpServer } from "./server.js";
import { ProfileRegistry } from "../server/profileRegistry.js";
import { PresetCatalog } from "../server/presetCatalog.js";
import { createProfileService, createProfileStore } from "../server/profileService.js";

vi.setConfig({ testTimeout: 30000 });

it.each(["radix-product", "carbon-product", "uswds-public-service"])("serves %s through existing read-only MCP tools and Profile resources", async (id) => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-preset-mcp-"));
  const registry = new ProfileRegistry(path.join(directory, "library"));
  const client = new Client({ name: "preset-test", version: "1" });
  try {
    await registry.open(path.join(directory, "original"));
    const detail = await new PresetCatalog().detail(id);
    const entry = await registry.create({ name: detail.name, kind: "preset", preset: detail.selection });
    const scope = await registry.scope(entry.identity.id);
    const other = await registry.create({ name: "Private sibling", kind: "scratch" });
    await createProfileStore(await registry.scope(other.identity.id)).files.savePrinciple("private-sibling", { id: "private-sibling", title: "SIBLING SECRET", body: "SIBLING SECRET", order: 0, updated_at: "" });
    const server = createMonetMcpServer(createProfileService(scope), entry.identity.id);
    const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).not.toContain("create_profile");
      for (const mode of detail.supported_modes) {
        for (const verbosity of ["compact", "full"]) {
          const result = await client.callTool({ name: "get_design_context", arguments: { profileId: entry.identity.id, query: "A form with a button and text input", mode, detail: verbosity } });
          expect(result.isError).not.toBe(true);
          const output = JSON.stringify(result);
          expect(output).toContain(entry.identity.id); expect(output).toContain("button");
          expect(output).toContain("Monet adaptation"); expect(output).not.toContain("SIBLING SECRET"); expect(output).not.toContain(entry.root);
        }
        const resource = await client.readResource({ uri: `monet://profiles/${entry.identity.id}/tokens/${mode}` });
        expect(JSON.stringify(resource)).toContain("color.primary");
        const review = await client.callTool({ name: "review_design_usage", arguments: { mode, usages: [{ kind: "token", token: "color.primary" }] } });
        expect(review.isError).not.toBe(true); expect(JSON.stringify(review)).toContain(entry.identity.id);
      }
      const wrong = await client.callTool({ name: "get_design_context", arguments: { profileId: other.identity.id } });
      expect(wrong.isError).toBe(true);
    } finally { await client.close(); await server.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
