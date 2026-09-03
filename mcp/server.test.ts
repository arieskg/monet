import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { loadWorkspace } from "../server/fileStore.js";
import { createMonetService } from "../shared/service.js";
import { buildCatalog, createMonetMcpServer } from "./server.js";

const service = createMonetService({ loadWorkspace });

function firstText(contents: readonly unknown[]): string {
  const content = contents[0];
  if (!content || typeof content !== "object" || !("text" in content) || typeof content.text !== "string") throw new Error("Expected MCP text content.");
  return content.text;
}

describe("Monet MCP adapter", () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    server = createMonetMcpServer(service);
    client = new Client({ name: "monet-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("builds a compact catalog without persistence details", async () => {
    const catalog = await buildCatalog(service);
    expect(catalog.components).toContainEqual(expect.objectContaining({ id: "button", name: "Button" }));
    expect(catalog.themes).toContainEqual(expect.objectContaining({ id: "default", default: true }));
    expect(JSON.stringify(catalog)).not.toContain("filesRoot");
    expect(JSON.stringify(catalog)).not.toContain("asset_path");
  });

  it("smoke-tests discovery and reads resources through an in-memory MCP client", async () => {
    const resources = await client.listResources();
    const templates = await client.listResourceTemplates();
    expect(resources.resources.map((item) => item.uri)).toContain("monet://catalog");
    expect(resources.resources.map((item) => item.uri)).toContain("monet://components/button");
    expect(templates.resourceTemplates.map((item) => item.uriTemplate)).toContain("monet://themes/{id}/tokens");

    const catalog = JSON.parse(firstText((await client.readResource({ uri: "monet://catalog" })).contents)) as { foundations: unknown[] };
    expect(catalog.foundations.length).toBeGreaterThan(0);

    const component = JSON.parse(firstText((await client.readResource({ uri: "monet://components/button" })).contents)) as Record<string, unknown>;
    expect(component).toMatchObject({ id: "button", name: "Button", status: "selected" });
    expect(JSON.stringify(component)).not.toContain("candidates");
    expect(JSON.stringify(component)).not.toContain("history");

    const undecided = JSON.parse(firstText((await client.readResource({ uri: "monet://components/chart" })).contents)) as Record<string, unknown>;
    expect(undecided).toMatchObject({ id: "chart", status: "undecided", decision: null });
  });

  it("returns resolved theme tokens with provenance", async () => {
    const result = await client.readResource({ uri: "monet://themes/default/tokens" });
    const payload = JSON.parse(firstText(result.contents)) as { theme: { id: string }; tokens: Array<{ source: string; base_resolved_value: unknown }> };
    expect(payload.theme.id).toBe("default");
    expect(payload.tokens.length).toBeGreaterThan(0);
    expect(payload.tokens[0]).toHaveProperty("source");
    expect(payload.tokens[0]).toHaveProperty("base_resolved_value");
  });

  it("returns clear resource errors for unknown IDs", async () => {
    await expect(client.readResource({ uri: "monet://principles/not-a-real-principle" })).rejects.toThrow("Unknown Monet principle ID");
  });

  it("exposes shared design context and preserves unknown-ID warnings", async () => {
    const result = await client.callTool({ name: "get_design_context", arguments: { query: "settings page", componentIds: ["missing-component"] } });
    expect(result.isError).not.toBe(true);
    const context = result.structuredContent as { query?: unknown; warnings?: unknown };
    expect(context.query).toBe("settings page");
    expect(context.warnings).toEqual(expect.arrayContaining(["Unknown component id: missing-component", "Dangling component reference: missing-component"]));
  });

  it("does not duplicate Foundation token records in the full design context", async () => {
    const result = await client.callTool({ name: "get_design_context", arguments: { foundationIds: ["spacing"], detail: "full" } });
    const context = result.structuredContent as { foundations: Array<{ token_count: number; tokens?: unknown }>; resolvedTokens: unknown[] };
    expect(context.foundations[0].token_count).toBeGreaterThan(0);
    expect(context.foundations[0]).not.toHaveProperty("tokens");
    expect(context.resolvedTokens.length).toBe(context.foundations[0].token_count);
  });

  it("returns a compact design brief by default and the full records on request", async () => {
    const compact = await client.callTool({ name: "get_design_context", arguments: { query: "build a login form" } });
    const brief = compact.structuredContent as {
      coverage: string; tokens: Record<string, string>;
      components: Array<{ id: string; uri: string; preferences?: Record<string, string>; candidates?: unknown; history?: unknown }>;
      patterns: Array<{ id: string; avoid: string[]; covers: string[]; body?: unknown }>;
      foundations: Array<{ id: string; uri: string; tokens?: unknown }>;
    };
    expect(brief.coverage).toBe("task_specific");
    expect(brief.components.map((item) => item.id)).toContain("password-input");
    expect(brief.components[0].uri).toMatch(/^monet:\/\/components\//);
    // Editor-only material never reaches a client, and tokens arrive as name/value pairs.
    expect(brief.components.every((item) => !("candidates" in item) && !("history" in item))).toBe(true);
    expect(brief.foundations.every((item) => !("tokens" in item))).toBe(true);
    expect(typeof brief.tokens["space.4"]).toBe("string");
    expect(brief.patterns[0].avoid.length).toBeGreaterThan(0);
    expect(brief.patterns[0]).not.toHaveProperty("body");

    const full = await client.callTool({ name: "get_design_context", arguments: { query: "build a login form", detail: "full" } });
    const complete = full.structuredContent as { patterns: Array<{ body: string }>; resolvedTokens: unknown[] };
    expect(complete.patterns[0].body.length).toBeGreaterThan(0);
    expect(complete.resolvedTokens.length).toBeGreaterThan(0);
    expect(JSON.stringify(compact.structuredContent).length).toBeLessThan(JSON.stringify(full.structuredContent).length / 2);
  });

  it("reports an unsupported capability instead of passing light tokens off as dark mode", async () => {
    const result = await client.callTool({ name: "get_design_context", arguments: { query: "build a dark mode dashboard" } });
    const brief = result.structuredContent as { notices: Array<{ kind: string; ids: string[]; message: string }> };
    const notice = brief.notices.find((item) => item.kind === "unsupported_capability");
    expect(notice?.ids).toContain("dark-mode");
    expect(notice?.message).toContain("no dark theme");
  });

  it("distinguishes a weak shortlist from a confident answer over the wire", async () => {
    const result = await client.callTool({ name: "get_design_context", arguments: { query: "rich text editor toolbar" } });
    const brief = result.structuredContent as {
      coverage: string; foundations: unknown[]; tokens: Record<string, string>;
      components: Array<{ id: string }>; notices: Array<{ kind: string; message: string }>;
      retrieval: Array<{ strength: string; reason: string }>;
    };
    expect(brief.coverage).toBe("partial");
    expect(brief.components.length).toBeGreaterThan(0);
    expect(brief.retrieval.every((match) => match.strength === "weak")).toBe(true);
    // A weak candidate does not get to bring Foundations and tokens along behind it.
    expect(brief.foundations).toEqual([]);
    expect(Object.keys(brief.tokens)).toEqual([]);
    expect(brief.notices.find((notice) => notice.kind === "no_opinion")?.message).toContain("only weakly");
  });

  it("says plainly when Monet has no opinion about a task", async () => {
    const result = await client.callTool({ name: "get_design_context", arguments: { query: "kanban board" } });
    const brief = result.structuredContent as { coverage: string; components: unknown[]; patterns: unknown[]; notices: Array<{ kind: string }>; principles: unknown[] };
    expect(brief.coverage).toBe("none");
    expect(brief.components).toEqual([]);
    expect(brief.patterns).toEqual([]);
    expect(brief.notices.map((item) => item.kind)).toContain("no_opinion");
    // Global principles still ship; they are simply not presented as an answer.
    expect(brief.principles.length).toBeGreaterThan(0);
  });

  it("validates tool arguments and rejects unknown themes", async () => {
    const invalidId = await client.callTool({ name: "get_design_context", arguments: { componentIds: ["Button/../../bad"] } });
    expect(invalidId.isError).toBe(true);
    expect(firstText(invalidId.content)).toContain("Input validation error");

    const unknownTheme = await client.callTool({ name: "get_design_context", arguments: { themeId: "not-a-theme" } });
    expect(unknownTheme.isError).toBe(true);
    expect(firstText(unknownTheme.content)).toContain("Unknown Monet theme ID");
  });

  it("searches references through the shared search service", async () => {
    const result = await client.callTool({ name: "search_references", arguments: { query: "documentation" } });
    expect(result.structuredContent).toMatchObject({ query: "documentation", count: 1 });
    expect(JSON.stringify(result.structuredContent)).not.toContain("asset_path");
  });
});
