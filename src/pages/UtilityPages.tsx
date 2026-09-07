import { PageHeader } from "../components/Common";
import { CopyBlock } from "../components/CopyBlock";
import { APPEARANCES, appearanceLabels } from "../appearance";
import { useWorkspace } from "../WorkspaceContext";

function WorkspaceSection() {
  const { workspace, environment } = useWorkspace();
  return <section className="settings-section">
    <div className="section-heading"><span className="eyebrow">Files</span><h2>Workspace</h2><p>Monet is the application; a workspace is a directory of design-system records that you own. Every entrypoint resolves it the same way: <code>--root</code>, then <code>MONET_ROOT</code>, then the workspace bundled with the repository.</p></div>
    <dl className="settings-facts">
      <div><dt>Open workspace</dt><dd><code>{environment?.root ?? workspace?.filesRoot ?? "Unknown"}</code></dd></div>
      <div><dt>Origin</dt><dd>{environment ? environment.bundled ? "Bundled starter workspace — a worked example, and the fixture Monet's own tests assert against." : "A workspace you own." : "The file service did not report an origin."}</dd></div>
    </dl>
    {environment?.bundled && <>
      <p className="settings-note">Copy it before you edit it. Editing in place can break the test suite and will conflict on every <code>git pull</code>.</p>
      <CopyBlock label="Take a copy" language="bash" value={"cp -r monet ~/my-design-system\nMONET_ROOT=~/my-design-system pnpm dev"} />
    </>}
    <p className="settings-note">An empty directory works too: Monet reads a workspace with no records as a new design system rather than an error, through this UI, the MCP server, and <code>pnpm validate</code> alike. <code>docs/WORKSPACE.md</code> documents the file contract.</p>
  </section>;
}

function AppearanceSection() {
  const { appearance, resolvedAppearance, setAppearance } = useWorkspace();
  return <section className="settings-section">
    <div className="section-heading"><span className="eyebrow">This browser</span><h2>Appearance</h2><p>Which of the Color foundation's two modes Monet's own interface renders in. It is a preference stored in this browser, not a record — it changes nothing in the workspace and is never exported.</p></div>
    <div className="settings-choice" role="radiogroup" aria-label="Appearance">
      {APPEARANCES.map((item) => <button key={item} type="button" role="radio" aria-checked={appearance === item} className={appearance === item ? "active" : ""} onClick={() => setAppearance(item)}>
        <b>{appearanceLabels[item]}</b><small>{item === "system" ? "Follow the operating system" : item === "light" ? "Always light" : "Always dark"}</small>
      </button>)}
    </div>
    <p className="settings-note">Currently rendering in {resolvedAppearance} mode. To see how a <em>product built on Monet</em> resolves in each mode, use <b>Preview</b>; to change the values themselves, edit a Foundation token's dark value.</p>
  </section>;
}

function OptionalFeaturesSection() {
  const { environment } = useWorkspace();
  const variable = environment?.aiVariable ?? "MONET_AI_COMMAND";
  return <section className="settings-section">
    <div className="section-heading"><span className="eyebrow">Optional</span><h2>AI-assisted features</h2><p>Two features can call a local AI CLI: source inventory mapping on <b>Sources</b>, and reference analysis on <b>References</b>. Nothing else in Monet uses it. The workspace, retrieval, validation, conformance review, and the MCP server are all deterministic and work with nothing configured.</p></div>
    <div className={`settings-status ${environment?.aiConfigured ? "on" : "off"}`}>
      <i aria-hidden="true" />
      <div><b>{environment?.aiConfigured ? "A provider is configured." : "No provider configured."}</b><span>{environment?.aiConfigured ? `${variable} is set, so the two AI-assisted features are available.` : `Set ${variable} to opt in. Without it, those two features explain what to set instead of failing.`}</span></div>
    </div>
    {!environment?.aiConfigured && <CopyBlock label="Opt in" language="bash" value={`export ${variable}=your-cli`} />}
    <p className="settings-note">Monet does not bundle, depend on, or prefer a provider. It invokes the command with a prompt on stdin and reads the JSON it writes; the built-in argument shape matches the Codex CLI, and another provider works behind a small wrapper script. The README documents the exact call.</p>
  </section>;
}

export function SettingsPage() {
  return <div className="page narrow-page settings-page">
    <PageHeader eyebrow="Monet" title="Settings" description="Where this workspace lives, how Monet renders it, and what is optional." />
    <WorkspaceSection />
    <AppearanceSection />
    <OptionalFeaturesSection />
  </div>;
}
