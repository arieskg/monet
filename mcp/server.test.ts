import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { loadWorkspace } from "../server/fileStore.js";
import { createMonetService } from "../shared/service.js";
import { buildCatalog, createMonetMcpServer } from "./server.js";

const service = createMonetService({ loadWorkspace });
/** The same workspace with its dark mode taken away, so the light-only path can be exercised over the wire. */
const lightOnlyService = createMonetService({
  loadWorkspace: async (themeId) => {
    const workspace = await loadWorkspace(themeId, "light");
    return { ...workspace, modes: ["light"], foundations: workspace.foundations.map((foundation) => ({ ...foundation, tokens: foundation.tokens.map((token) => ({ ...token, modes: undefined })) })) };
  },
});

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

  it("answers a dark-mode task with dark tokens and their light counterparts", async () => {
    const result = await client.callTool({ name: "get_design_context", arguments: { query: "build a dark mode dashboard" } });
    const brief = result.structuredContent as {
      theme: { id: string; mode: string; modes: string[] }; tokens: Record<string, string>;
      mode_values: Record<string, { light?: string; dark?: string }>; notices: Array<{ kind: string }>;
    };
    expect(brief.theme).toMatchObject({ id: "default", mode: "dark", modes: ["light", "dark"] });
    expect(brief.notices.map((item) => item.kind)).not.toContain("unsupported_capability");
    // The brief's tokens are the dark resolution, and mode_values pairs each changed token with its light value.
    expect(brief.tokens["color.background"]).toBe("#111921");
    expect(brief.tokens["color.primary"]).toBe("#9b59b6");
    expect(brief.mode_values["color.background"]).toEqual({ light: "#ecf0f1", dark: "#111921" });
    expect(brief.mode_values).not.toHaveProperty("color.primary");

    const explicit = await client.callTool({ name: "get_design_context", arguments: { query: "build a dark mode dashboard", mode: "light" } });
    const light = explicit.structuredContent as { theme: { mode: string }; tokens: Record<string, string>; notices: Array<{ kind: string }> };
    expect(light.theme.mode).toBe("light");
    expect(light.tokens["color.background"]).toBe("#ecf0f1");
    // Asking for light explicitly while the task says dark is answered honestly: these are light values, and dark is one argument away.
    const lightNotice = light.notices.find((item) => item.kind === "unsupported_capability") as { message: string } | undefined;
    expect(lightNotice?.message).toContain("has a dark mode");
    expect(lightNotice?.message).toContain('mode: "dark"');
  });

  it("still reports an unsupported capability when the workspace has no dark palette", async () => {
    const lightServer = createMonetMcpServer(lightOnlyService);
    const lightClient = new Client({ name: "monet-light-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await lightServer.connect(serverTransport);
    await lightClient.connect(clientTransport);
    try {
      const result = await lightClient.callTool({ name: "get_design_context", arguments: { query: "build a dark mode dashboard" } });
      const brief = result.structuredContent as { theme: { mode: string; modes: string[] }; notices: Array<{ kind: string; ids: string[]; message: string }> };
      expect(brief.theme).toMatchObject({ mode: "light", modes: ["light"] });
      const notice = brief.notices.find((item) => item.kind === "unsupported_capability");
      expect(notice?.ids).toContain("dark-mode");
      expect(notice?.message).toContain("has no dark mode");
      const catalog = JSON.parse(firstText((await lightClient.readResource({ uri: "monet://catalog" })).contents)) as { themes: Array<{ id: string; modes: string[] }> };
      expect(catalog.themes[0]?.modes).toEqual(["light"]);
    } finally {
      await lightClient.close();
      await lightServer.close();
    }
  });

  it("resolves theme tokens per mode through resources", async () => {
    const catalog = JSON.parse(firstText((await client.readResource({ uri: "monet://catalog" })).contents)) as { themes: Array<{ id: string; modes: string[] }> };
    expect(catalog.themes.find((item) => item.id === "default")?.modes).toEqual(["light", "dark"]);

    const light = JSON.parse(firstText((await client.readResource({ uri: "monet://themes/default/tokens" })).contents)) as { mode: string; modes: string[]; tokens: Array<{ name: string; resolved_value: string; source: string }> };
    expect(light.mode).toBe("light");
    expect(light.modes).toEqual(["light", "dark"]);
    expect(light.tokens.every((token) => token.source === "base")).toBe(true);

    const dark = JSON.parse(firstText((await client.readResource({ uri: "monet://themes/default/tokens/dark" })).contents)) as { mode: string; tokens: Array<{ name: string; resolved_value: string; source: string; override_dependencies: string[] }> };
    expect(dark.mode).toBe("dark");
    const background = dark.tokens.find((token) => token.name === "color.background");
    expect(background).toMatchObject({ resolved_value: "#111921", source: "mode", override_dependencies: ["color.background"] });
    // A Borders token that only aliases a colour follows that colour into dark and says which mode value carried it.
    expect(dark.tokens.find((token) => token.name === "border.default")).toMatchObject({ resolved_value: "1px solid #3a4b5c", source: "mode", override_dependencies: ["color.border"] });
    expect(dark.tokens.find((token) => token.name === "color.primary")).toMatchObject({ resolved_value: "#9b59b6", source: "base" });

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.map((item) => item.uriTemplate)).toContain("monet://themes/{id}/tokens/{mode}");
    const listed = await client.listResources();
    expect(listed.resources.map((item) => item.uri)).toContain("monet://themes/default/tokens/dark");
    await expect(client.readResource({ uri: "monet://themes/default/tokens/sepia" })).rejects.toThrow(/theme mode/);
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

    const unknownMode = await client.callTool({ name: "get_design_context", arguments: { mode: "sepia" } });
    expect(unknownMode.isError).toBe(true);
    expect(firstText(unknownMode.content)).toContain("Input validation error");
  });

  it("reviews implementation evidence and returns structured findings", async () => {
    const result = await client.callTool({
      name: "review_design_usage",
      arguments: {
        usages: [
          { id: "a", kind: "style", property: "background-color", value: "#ffffff", location: "Panel.tsx:4" },
          { id: "b", kind: "style", property: "padding", value: "13px" },
          { id: "c", kind: "token", token: "color.surface.pressd" },
          { id: "d", kind: "component", component: "calendar" },
          { id: "e", kind: "contrast", foreground: "color.foreground", background: "color.surface", usage: "text" },
          { id: "f", kind: "style", property: "width", value: "317px" },
        ],
      },
    });
    expect(result.isError).not.toBe(true);
    const review = result.structuredContent as {
      theme: { id: string; mode: string; modes: string[] };
      coverage: { submitted: number; checked: number; not_applicable: number; checks: string[] };
      scope: string;
      findings: Array<{ level: string; check: string; usage_id?: string; location?: string; observed: string; expected: string; why: string; replacement?: string; related: string[] }>;
    };
    expect(review.theme).toMatchObject({ id: "default", mode: "light", modes: ["light", "dark"] });
    expect(review.coverage.submitted).toBe(6);
    // Errors lead so an agent fixing code sees the blocking problem first.
    expect(review.findings.map((item) => item.check)).toEqual(["unknown_token", "literal_colour_has_token", "off_scale_dimension", "component_undecided"]);
    expect(review.findings[0]).toMatchObject({ level: "error", usage_id: "c" });
    expect(review.findings[1]).toMatchObject({ level: "warning", usage_id: "a", location: "Panel.tsx:4", replacement: "color.surface" });
    expect(review.findings.every((item) => item.why.length > 0)).toBe(true);
    expect(review.findings[3].related).toContain("monet://components/calendar");
    // A verified pairing and a property Monet documents no scale for both produce nothing.
    expect(review.coverage.not_applicable).toBe(1);
    expect(review.scope).toMatch(/not that the implementation conforms/);
  });

  it("resolves review evidence in the mode the caller names", async () => {
    const result = await client.callTool({
      name: "review_design_usage",
      arguments: { mode: "dark", usages: [{ kind: "style", property: "background-color", value: "#ecf0f1" }] },
    });
    const review = result.structuredContent as { theme: { mode: string }; findings: Array<{ check: string; replacement?: string }> };
    expect(review.theme.mode).toBe("dark");
    expect(review.findings.map((item) => item.check)).toContain("light_value_in_other_mode");
  });

  it("accepts a decorative contrast pair over the protocol and refuses an invented usage", async () => {
    const result = await client.callTool({
      name: "review_design_usage",
      arguments: {
        usages: [
          { id: "deco", kind: "contrast", foreground: "#8a8a8a", background: "#ffffff", usage: "decorative" },
          { id: "camel", kind: "component", component: "IconButton" },
        ],
      },
    });
    const review = result.structuredContent as { coverage: { not_applicable: number }; findings: Array<{ level: string; check: string; usage_id?: string }> };
    expect(review.findings.map((item) => item.check)).toEqual(["contrast_not_required"]);
    expect(review.findings[0]).toMatchObject({ level: "info", usage_id: "deco" });
    // The CamelCase component resolved to a decided record, so it produced no finding at all.
    expect(review.coverage.not_applicable).toBe(1);

    const invented = await client.callTool({
      name: "review_design_usage",
      arguments: { usages: [{ kind: "contrast", foreground: "#000000", background: "#ffffff", usage: "vibes" }] },
    });
    expect(invented.isError).toBe(true);
  });

  it("reports unverifiable evidence as info rather than inventing a violation", async () => {
    const result = await client.callTool({
      name: "review_design_usage",
      arguments: { usages: [{ kind: "style", property: "color", value: "var(--app-text)" }, { kind: "component", component: "confetti-cannon" }] },
    });
    const review = result.structuredContent as { coverage: { checked: number }; findings: Array<{ level: string; check: string }> };
    expect(review.findings.every((item) => item.level === "info")).toBe(true);
    expect(review.findings.map((item) => item.check).sort()).toEqual(["component_unknown", "unverifiable"]);
    expect(review.coverage.checked).toBe(0);
  });

  it("validates review arguments and rejects unknown themes", async () => {
    const empty = await client.callTool({ name: "review_design_usage", arguments: { usages: [] } });
    expect(empty.isError).toBe(true);
    expect(firstText(empty.content)).toContain("Input validation error");

    const unknownKind = await client.callTool({ name: "review_design_usage", arguments: { usages: [{ kind: "screenshot" }] } });
    expect(unknownKind.isError).toBe(true);

    const unknownTheme = await client.callTool({ name: "review_design_usage", arguments: { themeId: "not-a-theme", usages: [{ kind: "token", token: "color.surface" }] } });
    expect(unknownTheme.isError).toBe(true);
    expect(firstText(unknownTheme.content)).toContain("Unknown Monet theme ID");
  });

  it("searches references through the shared search service", async () => {
    const result = await client.callTool({ name: "search_references", arguments: { query: "documentation" } });
    expect(result.structuredContent).toMatchObject({ query: "documentation", count: 1 });
    expect(JSON.stringify(result.structuredContent)).not.toContain("asset_path");
  });
});
