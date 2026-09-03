import { componentDecisionLabels, componentDecisionStatus, markdownExcerpt, modeLabels, primitiveEntries, resolveThemeTokenSet, taxonomyEntries, themeOverrideSummary, tokenSetModes, type MarkdownDocument, type Principle, type ThemeMode, type Workspace } from "./domain";

export type ExportFormat = "md" | "yaml" | "json";
export interface ExportCollection {
  id: string;
  label: string;
  description: string;
  count: number;
  data: unknown;
  markdown: string;
}

function yamlKey(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value) ? value : JSON.stringify(value);
}

function yamlScalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value) ?? "null";
}

function yamlLines(value: unknown, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return [`${indent}[]`];
    return value.flatMap((item) => {
      if (item !== null && typeof item === "object") {
        const nested = yamlLines(item, depth + 1);
        return [`${indent}-`, ...nested];
      }
      return [`${indent}- ${yamlScalar(item)}`];
    });
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (!entries.length) return [`${indent}{}`];
    return entries.flatMap(([key, item]) => {
      if (item !== null && typeof item === "object") return [`${indent}${yamlKey(key)}:`, ...yamlLines(item, depth + 1)];
      return [`${indent}${yamlKey(key)}: ${yamlScalar(item)}`];
    });
  }
  return [`${indent}${yamlScalar(value)}`];
}

export function toYaml(value: unknown): string {
  return `${yamlLines(value).join("\n")}\n`;
}

function withoutLeadingTitle(body: string): string {
  return body.replace(/^#\s+[^\n]+\n*/, "").trim();
}

function principleMarkdown(items: Principle[]): string {
  return ["# Monet Principles", "", ...items.flatMap((item) => [
    `## ${item.title}`, "", withoutLeadingTitle(item.body) || "_No guidance written yet._", "",
  ])].join("\n").trimEnd() + "\n";
}

function documentMarkdown(title: string, items: MarkdownDocument[]): string {
  return [`# Monet ${title}`, "", ...items.flatMap((item) => [
    `## ${item.title}`, "", item.summary, "", withoutLeadingTitle(item.body), "",
  ])].join("\n").trimEnd() + "\n";
}

function workspaceMarkdown(workspace: Workspace): string {
  const names = new Map(taxonomyEntries(workspace).map((item) => [item.id, item.name]));
  const primitiveNames = new Map(primitiveEntries(workspace).map((item) => [item.id, item.name]));
  return [
    "# Monet Design System", "", `Resolved theme: ${workspace.themes.find((theme) => theme.id === workspace.activeThemeId)?.name ?? workspace.activeThemeId}, ${modeLabels[workspace.activeMode].toLowerCase()} mode. Theme values are Base Monet plus override-only theme data, resolved in one mode.`, "", "## Principles", "",
    ...workspace.principles.flatMap((item) => [`### ${item.title}`, "", withoutLeadingTitle(item.body), ""]),
    "## Foundations", "", ...workspace.foundations.flatMap((item) => [`### ${item.name}`, "", item.description, "", item.guidance, ""]),
    "## Tokens", "", ...workspace.resolvedTokens.map((item) => `- \`${item.name}\` = \`${String(item.resolved_value ?? item.value)}\``), "",
    "## Primitives", "", ...workspace.primitives.map((item) => `- **${primitiveNames.get(item.id) ?? item.id}** — ${item.purpose || item.status}`), "",
    "## Components", "", "Components inherit Monet Principles, Foundations, and Patterns; records contain only component-specific choices.", "", ...workspace.components.map((item) => `- **${names.get(item.id) ?? item.id}** — ${item.selection ? `${item.selection.source}/${item.selection.source_component}` : item.status}${Object.keys(item.preferences).length ? `; ${Object.entries(item.preferences).map(([key, value]) => `${key}=${value}`).join(", ")}` : ""}${item.notes ? ` — ${item.notes}` : ""}`), "",
    "## Patterns", "", ...workspace.patterns.map((item) => `- **${item.title}** — ${item.summary}`), "",
    "## Themes", "", ...workspace.themes.map((item) => `- **${item.name}**${item.id === workspace.defaultThemeId ? " (default)" : ""} — ${themeOverrideSummary(item)}`), "",
    "## Sources", "", ...workspace.sources.map((item) => `- **${item.name}** — ${item.homepage || item.repository || item.type}`), "",
    "## References", "", ...workspace.references.map((item) => `- **${item.title}** — ${item.annotation}${item.ai_tags.length ? ` · ${item.ai_tags.join(", ")}` : ""}`), "",
  ].join("\n").trimEnd() + "\n";
}

export function buildExportCollections(workspace: Workspace): ExportCollection[] {
  const primitiveData = { taxonomy: workspace.primitiveTaxonomy, decisions: workspace.primitives };
  const componentData = { taxonomy: workspace.taxonomy, decisions: workspace.components };
  const themeData = workspace.themes.map((theme) => ({ id: theme.id, name: theme.name, overrides: theme.overrides, ...(theme.modes ? { modes: theme.modes } : {}) }));
  return [
    { id: "principles", label: "Principles", description: "The beliefs that guide every design choice.", count: workspace.principles.length, data: workspace.principles, markdown: principleMarkdown(workspace.principles) },
    { id: "foundations", label: "Foundations", description: "System-wide rationale, guidance, and token definitions.", count: workspace.foundations.length, data: workspace.foundations, markdown: ["# Monet Foundations", "", ...workspace.foundations.flatMap((item) => [`## ${item.name}`, "", item.description, "", item.rationale, "", item.guidance, ""])].join("\n").trimEnd() + "\n" },
    { id: "tokens", label: "Tokens", description: "Resolved canonical values for the selected theme and mode, and any reference issues.", count: workspace.resolvedTokens.length, data: { theme: workspace.activeThemeId, mode: workspace.activeMode, tokens: workspace.resolvedTokens, issues: workspace.tokenIssues }, markdown: ["# Monet Tokens", "", `Resolved for the ${workspace.activeThemeId} theme in ${workspace.activeMode} mode.`, "", ...workspace.resolvedTokens.map((item) => `- \`${item.name}\` = \`${String(item.resolved_value ?? item.value)}\`${item.description ? ` — ${item.description}` : ""}`), ""].join("\n") },
    { id: "primitives", label: "Primitives", description: "Low-level composition concepts and their decisions.", count: workspace.primitiveTaxonomy.reduce((total, category) => total + category.entries.length, 0), data: primitiveData, markdown: ["# Monet Primitives", "", ...primitiveEntries(workspace).flatMap((entry) => { const decision = workspace.primitives.find((item) => item.id === entry.id); return [`## ${entry.name}`, "", decision?.purpose || entry.description, "", `- Status: ${decision?.status ?? "undecided"}`, `- Tokens: ${decision?.tokens.join(", ") || "None"}`, ""]; })].join("\n") },
    { id: "components", label: "Components", description: "Lightweight component-specific inspirations, preferences, notes, and optional Advanced guidance.", count: workspace.taxonomy.reduce((total, category) => total + category.entries.length, 0), data: componentData, markdown: ["# Monet Components", "", "All components inherit Monet Principles, Foundations, and Patterns.", "", ...taxonomyEntries(workspace).flatMap((entry) => { const decision = workspace.components.find((item) => item.id === entry.id); const decisionStatus = decision ? componentDecisionStatus(decision.status) : ""; if (!decision) return [`## ${entry.name}`, "", entry.description, "", "- Decision: Not chosen", ""]; const advanced = [Object.keys(decision.behavior).length ? `- Behavior: ${Object.entries(decision.behavior).map(([key, value]) => `${key}=${value}`).join(", ")}` : "", decision.rationale ? `- Rationale: ${decision.rationale}` : "", decision.use_when.length ? `- Use when: ${decision.use_when.join("; ")}` : "", decision.avoid_when.length ? `- Avoid when: ${decision.avoid_when.join("; ")}` : "", decision.foundations.length ? `- Foundation deviations: ${decision.foundations.join(", ")}` : "", decision.primitives.length ? `- Primitives: ${decision.primitives.join(", ")}` : ""].filter(Boolean); return [`## ${entry.name}`, "", entry.description, "", `- Decision: ${decisionStatus ? componentDecisionLabels[decisionStatus] : "Not chosen"}`, `- Inspiration: ${decision.selection ? `${decision.selection.source} / ${decision.selection.source_component}` : "None"}`, `- Preferences: ${Object.entries(decision.preferences).map(([key, value]) => `${key}=${value}`).join(", ") || "None"}`, decision.notes ? `- Notes: ${decision.notes}` : "", "- Inherits: Monet Principles, Foundations, and Patterns", ...advanced, ""].filter((line) => line !== ""); })].join("\n") },
    { id: "patterns", label: "Patterns", description: "Guidance spanning multiple components and foundations.", count: workspace.patterns.length, data: workspace.patterns, markdown: documentMarkdown("Patterns", workspace.patterns) },
    { id: "themes", label: "Themes", description: "Product-specific Foundation overrides only; base values are never copied.", count: workspace.themes.length, data: themeData, markdown: ["# Monet Themes", "", "Theme files contain overrides only. Resolve them as Base Monet + theme overrides, then the mode's overrides on top.", "", ...workspace.themes.flatMap((theme) => [`## ${theme.name}${theme.id === workspace.defaultThemeId ? " (default)" : ""}`, "", ...Object.entries(theme.overrides).map(([name, value]) => `- \`${name}\` = \`${String(value)}\``), ...(Object.keys(theme.overrides).length ? [] : ["_No overrides._"]), ...Object.entries(theme.modes ?? {}).flatMap(([mode, overrides]) => ["", `### ${mode} mode`, "", ...Object.entries(overrides).map(([name, value]) => `- \`${name}\` = \`${String(value)}\``)]), ""])].join("\n") },
    { id: "sources", label: "Sources", description: "External design systems and their canonical mappings.", count: workspace.sources.length, data: workspace.sources, markdown: ["# Monet Sources", "", ...workspace.sources.flatMap((item) => [`## ${item.name}`, "", item.notes || markdownExcerpt(item.name), "", `- Type: ${item.type}`, `- Framework: ${item.framework || "Not specified"}`, `- Homepage: ${item.homepage || "Not specified"}`, `- Mappings: ${item.mappings.length}`, ""])].join("\n") },
    { id: "references", label: "References", description: "Saved visual preference examples, user annotations, and AI retrieval metadata.", count: workspace.references.length, data: { references: workspace.references, analysis: workspace.referenceAnalysis }, markdown: ["# Monet References", "", ...workspace.references.flatMap((item) => [`## ${item.title}`, "", item.annotation, "", `- Type: ${item.type}`, `- Source: ${item.source_url || item.original_filename || "Local"}`, `- AI tags: ${item.ai_tags.join(", ") || "Not analyzed"}`, item.ai?.retrieval_text ? `- Retrieval context: ${item.ai.retrieval_text}` : "", ""]).filter(Boolean), workspace.referenceAnalysis.summary ? "## Collection analysis" : "", workspace.referenceAnalysis.summary, ""].filter(Boolean).join("\n") },
    { id: "decisions", label: "Decision log", description: "Human-readable history of changed selections.", count: workspace.decisionLog.length, data: workspace.decisionLog, markdown: documentMarkdown("Decision Log", workspace.decisionLog) },
  ];
}

/** The same workspace resolved for another theme or mode, computed in the browser from the base tokens it already holds. */
export function workspaceWithTheme(workspace: Workspace, themeId: string, mode: ThemeMode = "light"): Workspace {
  const theme = workspace.themes.find((item) => item.id === themeId) ?? workspace.themes.find((item) => item.id === workspace.defaultThemeId) ?? null;
  const modes = tokenSetModes(workspace.baseResolvedTokens, theme);
  const activeMode: ThemeMode = modes.includes(mode) ? mode : "light";
  const resolution = resolveThemeTokenSet(workspace.baseResolvedTokens, theme, activeMode);
  return { ...workspace, activeThemeId: theme?.id ?? workspace.defaultThemeId, activeMode, modes, resolvedTokens: resolution.tokens, tokenIssues: resolution.issues };
}

export function serializeExport(collection: ExportCollection, format: ExportFormat): string {
  if (format === "md") return collection.markdown;
  if (format === "yaml") return toYaml(collection.data);
  return `${JSON.stringify(collection.data, null, 2)}\n`;
}

export function serializeWorkspace(workspace: Workspace, format: ExportFormat): string {
  if (format === "md") return workspaceMarkdown(workspace);
  if (format === "yaml") return toYaml(workspace);
  return `${JSON.stringify(workspace, null, 2)}\n`;
}
