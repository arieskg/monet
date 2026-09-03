import { useState } from "react";
import { PageHeader } from "../components/Common";
import { modeLabels, type ThemeMode } from "../domain";
import { buildExportCollections, serializeExport, serializeWorkspace, workspaceWithTheme, type ExportFormat } from "../exportFormats";
import { useWorkspace } from "../WorkspaceContext";

const formatLabels: Record<ExportFormat, string> = { md: "Markdown", yaml: "YAML", json: "JSON" };
const mimeTypes: Record<ExportFormat, string> = { md: "text/markdown", yaml: "application/yaml", json: "application/json" };

function download(name: string, value: string, type: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([value], { type }));
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportPage() {
  const { workspace } = useWorkspace();
  const [themeId, setThemeId] = useState("");
  const [mode, setMode] = useState<ThemeMode>("light");
  if (!workspace) return null;
  const selectedThemeId = themeId || workspace.defaultThemeId;
  const resolvedWorkspace = workspaceWithTheme(workspace, selectedThemeId, mode);
  const collections = buildExportCollections(resolvedWorkspace);
  const selected = workspace.components.filter((item) => item.status === "selected" || item.status === "do_not_use");
  const exportName = `monet-design-system-${resolvedWorkspace.activeThemeId}${resolvedWorkspace.activeMode === "light" ? "" : `-${resolvedWorkspace.activeMode}`}`;
  const exportWholeWorkspace = (format: ExportFormat) => download(`${exportName}.${format}`, serializeWorkspace(resolvedWorkspace, format), mimeTypes[format]);
  return <div className="page export-page"><PageHeader eyebrow="Portable output" title="Export" description="Download the full workspace or one independent collection as Markdown, YAML, or JSON." />
    <section className="export-hero"><div><span className="eyebrow">Agent entrypoint</span><h2>Resolved intent, without a framework dependency.</h2><p>Choose a theme and mode, then export Base Monet plus its overrides resolved for that mode. The base files remain unchanged, while resolved token values retain their origin metadata.</p><div className="export-resolution-controls"><label className="export-theme-select">Resolve theme<select value={selectedThemeId} onChange={(event) => setThemeId(event.target.value)}>{workspace.themes.map((theme) => <option value={theme.id} key={theme.id}>{theme.name}{theme.id === workspace.defaultThemeId ? " · default" : ""}</option>)}</select></label><label className="export-theme-select">Mode<select value={resolvedWorkspace.activeMode} onChange={(event) => setMode(event.target.value as ThemeMode)}>{resolvedWorkspace.modes.map((item) => <option value={item} key={item}>{modeLabels[item]}</option>)}</select></label></div><div className="button-row">{(["md", "yaml", "json"] as const).map((format) => <button className={format === "md" ? "button primary" : "button ghost"} key={format} onClick={() => exportWholeWorkspace(format)}>Full {formatLabels[format]}</button>)}</div></div><div className="export-stats"><div><strong>{workspace.principles.length}</strong><span>principles</span></div><div><strong>{resolvedWorkspace.resolvedTokens.length}</strong><span>resolved tokens</span></div><div><strong>{workspace.themes.length}</strong><span>themes</span></div><div><strong>{selected.length}</strong><span>component decisions</span></div></div></section>
    <section className="collection-exports"><div className="section-heading"><span className="eyebrow">Independent downloads</span><h2>Export only what you need</h2><p>Each download contains the complete collection. There are no item-count limits.</p></div><div className="collection-export-grid">{collections.map((collection) => <article className="collection-export-card" key={collection.id}><header><div><span className="eyebrow">{collection.count} records</span><h3>{collection.label}</h3></div></header><p>{collection.description}</p><div className="export-format-actions">{(["md", "yaml", "json"] as const).map((format) => <button className="button ghost micro" key={format} onClick={() => download(`monet-${collection.id}.${format}`, serializeExport(collection, format), mimeTypes[format])}>{formatLabels[format]}</button>)}</div></article>)}</div></section>
    <section className="file-tree-section"><div className="section-heading"><span className="eyebrow">Canonical workspace</span><h2>{workspace.filesRoot}</h2></div><pre className="file-tree">{`${workspace.filesRoot.split("/").filter(Boolean).pop() ?? "workspace"}/
├── README.md
├── DESIGN_SYSTEM.md          generated readable summary
├── design-system.json        generated snapshot (not committed)
├── AGENTS.md                 coding-agent instructions
├── principles/               title + Markdown body
	├── foundations/              canonical intent + token records
	├── themes/                   override-only product themes, with optional dark overrides
	├── tokens/                   generated resolved token exports
	│   ├── tokens.json            default-theme resolved set (light)
	│   └── themes/                one resolved set per theme and mode, with origins
├── primitives/decisions.json low-level composition conventions
├── taxonomy/primitives.json  canonical primitive concepts
├── taxonomy/components.json  canonical concepts and aliases
├── components/decisions.json selections, preferences, and history
├── patterns/                 Markdown + linked concept IDs
├── sources/registry.json     external metadata and mappings
└── decisions/                human-readable selection changes`}</pre></section>
    <section className="agent-rules"><div className="section-heading"><span className="eyebrow">Consumption contract</span><h2>What an implementation agent learns</h2></div><ol><li>Read principles for the overall design philosophy.</li><li>Resolve Base Monet with the selected theme's Foundation overrides, in the mode being built: light is the baseline, and dark layers each token's dark value and the theme's dark overrides on top.</li><li>Use resolved tokens and their base/mode/theme origin metadata.</li><li>Let components inherit Principles, Foundations, and Patterns; apply only their explicit preferences or deviations.</li><li>Consult primitives for low-level composition and interaction conventions.</li><li>Apply patterns to workflows using multiple components.</li><li>Treat external systems as inspiration unless the target project explicitly adopts them.</li><li>Adapt to the project stack while preserving Monet's intent.</li></ol></section>
  </div>;
}
