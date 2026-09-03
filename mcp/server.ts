import { McpServer, ProtocolError, ProtocolErrorCode, ResourceNotFoundError, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { THEME_MODES, type Component, type DesignContext, type Reference, type ResolvedThemeToken, type Theme, type ThemeMode } from "../shared/model.js";
import { resourceUri, toCompactContext } from "../shared/compactContext.js";
import type { MonetService } from "../shared/service.js";

const SERVER_INFO = { name: "monet", version: "0.2.0" } as const;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const idSchema = z.string().trim().regex(ID_PATTERN, "Use a lowercase Monet record ID.");
const idsSchema = z.array(idSchema).max(100).optional();

export const designContextInputSchema = z.object({
  query: z.string().trim().min(1).max(500).optional().describe("Natural-language design task or concept to match."),
  principleIds: idsSchema.describe("Exact Principle IDs to include."),
  foundationIds: idsSchema.describe("Exact Foundation IDs to include."),
  patternIds: idsSchema.describe("Exact Pattern IDs to include."),
  componentIds: idsSchema.describe("Exact canonical Component IDs to include."),
  referenceIds: idsSchema.describe("Exact Reference IDs to include."),
  themeId: idSchema.optional().describe("Theme ID used to resolve Foundation tokens."),
  mode: z.enum(THEME_MODES as [ThemeMode, ...ThemeMode[]]).optional().describe("Mode to resolve tokens in: light (default) or dark. When omitted, a query that asks for dark mode resolves dark if the theme supports it."),
  detail: z.enum(["compact", "full"]).optional().describe("compact (default) returns an agent-oriented design brief with a monet:// resource URI on every record; full returns the complete editor-shaped records."),
}).strict();

export const referenceSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500).describe("Text to match against reference titles, annotations, notes, domains, tags, and retrieval text."),
}).strict();

function publicReference(reference: Reference) {
  return {
    id: reference.id,
    title: reference.title,
    type: reference.type,
    source_url: reference.source_url,
    source_domain: reference.source_domain,
    annotation: reference.annotation,
    notes: reference.notes,
    asset_media_type: reference.asset_media_type,
    original_filename: reference.original_filename,
    has_asset: Boolean(reference.asset_path),
    ai_tags: reference.ai_tags,
    ai: reference.ai,
    created_at: reference.created_at,
    updated_at: reference.updated_at,
  };
}

function publicComponent(component: Component) {
  const decision = component.decision;
  return {
    id: component.id,
    name: component.name,
    category: component.category,
    description: component.description,
    aliases: component.aliases,
    relationships: component.relationships,
    deprecated: Boolean(component.deprecated),
    status: decision?.status ?? "undecided",
    decision: decision ? {
      id: decision.id,
      status: decision.status,
      selection: decision.selection,
      preferences: decision.preferences,
      behavior: decision.behavior,
      rationale: decision.rationale,
      notes: decision.notes,
      use_when: decision.use_when,
      avoid_when: decision.avoid_when,
      foundations: decision.foundations,
      primitives: decision.primitives,
      updated_at: decision.updated_at,
    } : null,
  };
}

/** The full editor-shaped context, minus the fields that only exist for the workspace app. */
function publicDesignContext(context: DesignContext) {
  return {
    ...context,
    // Resolved tokens already carry the token identity, description, Foundation,
    // value, and provenance needed by agents. Avoid returning the same token
    // records again inside each Foundation in aggregate tool responses.
    foundations: context.foundations.map(({ tokens, ...foundation }) => ({
      ...foundation,
      token_count: tokens.length,
    })),
    components: context.components.map(publicComponent),
    references: context.references.map(publicReference),
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function jsonResource(uri: URL, value: unknown) {
  return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(value) }] };
}

function jsonToolResult(value: unknown) {
  const structuredContent = jsonObject(value);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function templateId(uri: URL, value: string | string[] | undefined): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid Monet resource ID in ${uri.href}.`);
  }
  return value;
}

async function requireRecord<T>(uri: URL, type: string, id: string, read: (id: string) => Promise<T | null>): Promise<T> {
  const value = await read(id);
  if (!value) throw new ResourceNotFoundError(uri.href, `Unknown Monet ${type} ID: ${id}`);
  return value;
}

function listedResource(uri: string, name: string, description: string) {
  return { uri, name, description, mimeType: "application/json" };
}

export async function buildCatalog(service: MonetService) {
  const [principles, foundations, patterns, components, themes, references, workspace] = await Promise.all([
    service.listPrinciples(), service.listFoundations(), service.listPatterns(), service.listComponents(),
    service.listThemes(), service.listReferences(), service.getWorkspace(),
  ]);
  const themeModes = await Promise.all(themes.map(async (theme) => [theme.id, (await service.getWorkspace(theme.id)).modes] as const));
  const modesById = new Map(themeModes);
  return {
    principles: principles.map((item) => ({ id: item.id, title: item.title })),
    foundations: foundations.map((item) => ({ id: item.id, name: item.name, status: item.status })),
    patterns: patterns.map((item) => ({ id: item.id, title: item.title, summary: item.summary, status: item.status })),
    components: components.map((item) => ({ id: item.id, name: item.name, category: item.category, status: item.decision?.status ?? "undecided" })),
    themes: themes.map((item) => ({ id: item.id, name: item.name, default: item.id === workspace.defaultThemeId, modes: modesById.get(item.id) ?? ["light"] })),
    references: references.map((item) => ({ id: item.id, title: item.title, type: item.type, source_domain: item.source_domain })),
  };
}

export async function getThemeTokens(service: MonetService, theme: Theme, mode: ThemeMode = "light"): Promise<{ theme: Theme; mode: ThemeMode; modes: ThemeMode[]; tokens: ResolvedThemeToken[]; tokenIssues: unknown[] }> {
  const workspace = await service.getWorkspace(theme.id, mode);
  return { theme, mode: workspace.activeMode, modes: workspace.modes, tokens: workspace.resolvedTokens, tokenIssues: workspace.tokenIssues };
}

function templateMode(uri: URL, value: string | string[] | undefined): ThemeMode {
  if (typeof value !== "string" || !THEME_MODES.includes(value as ThemeMode)) {
    throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid Monet theme mode in ${uri.href}. Use one of: ${THEME_MODES.join(", ")}.`);
  }
  return value as ThemeMode;
}

export function createMonetMcpServer(service: MonetService): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions: "Monet is a read-only design-context provider. Call get_design_context with a natural design task to get a compact design brief, then read the monet:// resource it cites for any record you need in full. Check `coverage` and `notices` before relying on the result: Monet reports when it has no task-specific opinion, when a concept is catalogued but undecided, and when a request needs a capability it does not have.",
  });

  server.registerResource(
    "monet-catalog",
    "monet://catalog",
    { title: "Monet catalog", description: "Compact index of canonical Monet design records.", mimeType: "application/json" },
    async (uri) => jsonResource(uri, await buildCatalog(service)),
  );

  server.registerResource(
    "monet-principle",
    new ResourceTemplate("monet://principles/{id}", {
      list: async () => ({ resources: (await service.listPrinciples()).map((item) => listedResource(resourceUri("principles", item.id), item.title, "Monet design principle")) }),
    }),
    { title: "Monet principle", description: "One canonical Monet design principle.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      return jsonResource(uri, await requireRecord(uri, "principle", id, (recordId) => service.getPrinciple(recordId)));
    },
  );

  server.registerResource(
    "monet-foundation",
    new ResourceTemplate("monet://foundations/{id}", {
      list: async () => ({ resources: (await service.listFoundations()).map((item) => listedResource(resourceUri("foundations", item.id), item.name, item.description)) }),
    }),
    { title: "Monet foundation", description: "One canonical Foundation with its base token records.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      return jsonResource(uri, await requireRecord(uri, "foundation", id, (recordId) => service.getFoundation(recordId)));
    },
  );

  server.registerResource(
    "monet-pattern",
    new ResourceTemplate("monet://patterns/{id}", {
      list: async () => ({ resources: (await service.listPatterns()).map((item) => listedResource(resourceUri("patterns", item.id), item.title, item.summary)) }),
    }),
    { title: "Monet pattern", description: "One canonical multi-component Monet pattern.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      return jsonResource(uri, await requireRecord(uri, "pattern", id, (recordId) => service.getPattern(recordId)));
    },
  );

  server.registerResource(
    "monet-component",
    new ResourceTemplate("monet://components/{id}", {
      list: async () => ({ resources: (await service.listComponents()).map((item) => listedResource(resourceUri("components", item.id), item.name, item.description)) }),
    }),
    { title: "Monet component", description: "Canonical component taxonomy joined to its optional design decision.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      const component = await requireRecord(uri, "component", id, (recordId) => service.getComponent(recordId));
      return jsonResource(uri, publicComponent(component));
    },
  );

  server.registerResource(
    "monet-theme",
    new ResourceTemplate("monet://themes/{id}", {
      list: async () => ({ resources: (await service.listThemes()).map((item) => listedResource(resourceUri("themes", item.id), item.name, "Monet Foundation token overrides")) }),
    }),
    { title: "Monet theme", description: "One override-only Monet theme, with any mode-specific overrides it carries.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      return jsonResource(uri, await requireRecord(uri, "theme", id, (recordId) => service.getTheme(recordId)));
    },
  );

  server.registerResource(
    "monet-theme-tokens",
    new ResourceTemplate("monet://themes/{id}/tokens", {
      list: async () => ({ resources: (await service.listThemes()).map((item) => listedResource(`monet://themes/${item.id}/tokens`, `${item.name} resolved tokens (light)`, "Resolved token values with base/mode/theme provenance, in light mode")) }),
    }),
    { title: "Resolved Monet theme tokens", description: "Resolved Foundation tokens and provenance for one theme in light mode. The response lists the modes the theme supports; monet://themes/{id}/tokens/{mode} resolves another mode.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      const theme = await requireRecord(uri, "theme", id, (recordId) => service.getTheme(recordId));
      return jsonResource(uri, await getThemeTokens(service, theme));
    },
  );

  server.registerResource(
    "monet-theme-mode-tokens",
    new ResourceTemplate("monet://themes/{id}/tokens/{mode}", {
      list: async () => ({ resources: (await Promise.all((await service.listThemes()).map(async (item) => {
        const modes = (await service.getWorkspace(item.id)).modes.filter((mode) => mode !== "light");
        return modes.map((mode) => listedResource(`monet://themes/${item.id}/tokens/${mode}`, `${item.name} resolved tokens (${mode})`, `Resolved token values with base/mode/theme provenance, in ${mode} mode`));
      }))).flat() }),
    }),
    { title: "Resolved Monet theme tokens for one mode", description: "Resolved Foundation tokens and provenance for one theme in one mode (light or dark). A mode the theme does not support resolves as light and says so in `mode`.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      const mode = templateMode(uri, variables.mode);
      const theme = await requireRecord(uri, "theme", id, (recordId) => service.getTheme(recordId));
      return jsonResource(uri, await getThemeTokens(service, theme, mode));
    },
  );

  server.registerResource(
    "monet-reference",
    new ResourceTemplate("monet://references/{id}", {
      list: async () => ({ resources: (await service.listReferences()).map((item) => listedResource(resourceUri("references", item.id), item.title, item.annotation)) }),
    }),
    { title: "Monet reference", description: "One visual-reference memory record without internal file paths.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = templateId(uri, variables.id);
      const reference = await requireRecord(uri, "reference", id, (recordId) => service.getReference(recordId));
      return jsonResource(uri, publicReference(reference));
    },
  );

  server.registerTool(
    "get_design_context",
    {
      title: "Get Monet design context",
      description: "Retrieve task-relevant Monet principles, foundations, patterns, components, references, and resolved tokens for a natural design task. Returns a compact design brief by default, with `coverage` reporting whether Monet had task-specific guidance and `notices` reporting undecided concepts and capabilities Monet does not have. Tokens resolve in the requested `mode` (light or dark); a dark-mode task resolves dark automatically when the theme supports it, and `mode_values` lists every token whose value differs between modes. Every record carries a monet:// URI for the full record.",
      inputSchema: designContextInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ detail, ...input }) => {
      if (input.themeId && !(await service.getTheme(input.themeId))) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown Monet theme ID: ${input.themeId}`);
      }
      const context = await service.getDesignContext(input);
      return jsonToolResult(detail === "full" ? publicDesignContext(context) : toCompactContext(context));
    },
  );

  server.registerTool(
    "search_references",
    {
      title: "Search Monet references",
      description: "Search Monet's saved visual-reference memory using its existing shared reference-search behavior.",
      inputSchema: referenceSearchInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const references = (await service.searchReferences(query)).map(({ reference, match }) => ({
        ...publicReference(reference),
        retrieval: match,
      }));
      return jsonToolResult({ query, count: references.length, references });
    },
  );

  return server;
}
