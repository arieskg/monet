import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../components/Common";
import { shellQuote } from "../shellQuote";
import { CopyBlock } from "../components/CopyBlock";
import { componentDecisionCoverage, taxonomyEntries } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

/** Plain-language descriptions of the read-only surface `mcp/server.ts` already exposes. */
const tools = [
  {
    name: "get_design_context",
    question: "How should I build this?",
    body: "Give it the task in the words the task is actually written in — “a settings page”, “a dark mode dashboard”. Monet matches it against the records deterministically and returns the principles, foundations, patterns, components, and resolved tokens that apply, each with a resource link to its full text.",
  },
  {
    name: "review_design_usage",
    question: "Does what I built follow it?",
    body: "The agent reports what it wrote — the colours, spacings, token names, and components it used — and Monet checks those observations against the records. It never reads source, so a review is bounded by the evidence supplied, and it says which parts it could not verify.",
  },
  {
    name: "search_references",
    question: "Have I seen this before?",
    body: "Searches the saved visual references by the same scorer, for when a task is better answered by an example than by a rule.",
  },
] as const;

const honesty = [
  ["Monet answers, or says it has nothing to say.", "Every result tells the agent how well it actually matched the task. When nothing in your design system covers what is being built, Monet says so and suggests falling back to a familiar accessible solution, instead of assembling a confident-looking answer out of loose word matches."],
  ["Undecided is a real answer.", "A concept your system names but has not decided on is reported as undecided. It is not quietly dropped, and it is not filled in with a guess."],
  ["Reviews measure evidence, never source.", "Monet checks what the agent reported. Where the evidence does not settle a question, the review says the check could not be made — it never treats missing information as a violation."],
  ["Nothing writes.", "The server is read-only. It has no write tools, opens no network listener, and needs neither this window nor the file service running."],
] as const;

export function AgentContextPage() {
  const { workspace, environment } = useWorkspace();
  const { hash } = useLocation();
  // The router does not act on a fragment, and this page is linked to by section from the home
  // page, so a link that promises to jump has to do it once the section exists.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash, workspace]);
  if (!workspace) return null;
  const coverage = componentDecisionCoverage(workspace);
  const appRoot = environment?.appRoot ?? "/absolute/path/to/monet";
  const workspaceRoot = environment?.root ?? "/absolute/path/to/your-design-system";
  const clientConfig = JSON.stringify({ mcpServers: { monet: { command: "pnpm", args: ["--dir", appRoot, "mcp"], env: { MONET_ROOT: workspaceRoot, ...(environment?.profile ? { MONET_PROFILE_ID: environment.profile.id } : {}) } } } }, null, 2);

  return <div className="page agent-page">
    <PageHeader eyebrow="Model Context Protocol" title="Agent context" description="The other half of Monet. The pages in Design system decide what this product looks like; this is how a coding agent reads those decisions while it builds, and how it checks its work afterwards." />

    {environment?.profile && <p><b>{environment.profile.name}</b> · Profile <code>{environment.profile.id}</code>. This connection stays bound to this Profile when you switch the editor.</p>}
    <section className="agent-loop" aria-label="The build loop">
      <ol>
        <li><b>get_design_context</b><small>Ask Monet</small></li>
        <li><b>Build the UI</b><small>In your project</small></li>
        <li><b>review_design_usage</b><small>Check the result</small></li>
        <li><b>Fix, review again</b><small>Check the evidence</small></li>
      </ol>
      <p>Monet is deliberately one side of this. The agent knows what it wrote; Monet knows what the design system permits. Neither has to do the other's job.</p>
    </section>

    <section className="agent-connect">
      <div className="section-heading"><span className="eyebrow">Setup</span><h2>Connect a client</h2><p>Monet speaks MCP on stdin and stdout and is client-neutral: any client that can launch a local stdio server works. Start it from a terminal, or let your client launch it.</p></div>
      <div className="agent-connect-grid">
        <div>
          <CopyBlock label="Run it yourself" language="bash" value={`MONET_ROOT=${shellQuote(workspaceRoot)}${environment?.profile ? ` MONET_PROFILE_ID=${shellQuote(environment.profile.id)}` : ""} pnpm --dir ${shellQuote(appRoot)} mcp`} />
          <p className="agent-note">Both are filled in from the workspace this window has open{environment?.bundled ? " — the bundled example. Point Monet at your own workspace first if you have one." : "."} The same snippet lives in <code>mcp.example.json</code>, and <code>docs/MCP.md</code> documents every resource and argument.</p>
        </div>
        <CopyBlock label="Client configuration" language="json" value={clientConfig} />
      </div>
    </section>

    <section className="agent-tools">
      <div className="section-heading"><span className="eyebrow">What an agent can ask</span><h2>Three reads, no writes</h2></div>
      <div className="agent-tool-grid">{tools.map((tool) => <article key={tool.name}><header><code>{tool.name}</code><b>{tool.question}</b></header><p>{tool.body}</p></article>)}</div>
      <p className="agent-note">Records are also addressable directly as <code>monet://</code> resources — <code>monet://catalog</code> for the index, then principles, foundations, patterns, components, themes, theme tokens per mode, and references. A brief lists what applies; an agent fetches whole records only where it needs them.</p>
    </section>

    <section className="agent-review" id="review">
      <div className="section-heading"><span className="eyebrow">Closing the loop</span><h2>Conformance review</h2><p>Check reported evidence against the decisions in your workspace.</p></div>
      <div className="agent-review-grid">
        <div>
          <h3>What the agent sends</h3>
          <p>A short list of what it just wrote — the colours and sizes it typed as literals, the token names and components it referenced, and any colour pairing it put on screen — plus which theme and mode it built in. All of that is cheap for the agent to collect from its own output.</p>
        </div>
        <div>
          <h3>What Monet checks it against</h3>
          <ul className="agent-check-list">
            <li><b>Literal values</b> against the resolved token scales, in the mode they were used in.</li>
            <li><b>Token names</b> against the names your workspace actually defines.</li>
            <li><b>Components</b> against their decision — one you marked do-not-use, or one you have not decided yet.</li>
            <li><b>Contrast pairings</b> against the ratios your Color foundation documents.</li>
          </ul>
          <p>Anything your system has no rule for comes back as not applicable rather than as a failure. And an empty result means nothing the agent reported contradicted the design system — not that the whole implementation is correct.</p>
        </div>
      </div>
      <details className="agent-evidence-disclosure">
        <summary>See the shape of a review request</summary>
        <CopyBlock label="Example evidence" language="json" value={JSON.stringify({ mode: "dark", usages: [{ id: "1", location: "Panel.tsx:12", kind: "style", property: "background-color", value: "#ffffff" }, { id: "2", kind: "token", token: "color.surface.pressd" }, { id: "3", kind: "contrast", foreground: "color.foreground.muted", background: "color.surface", usage: "text" }] }, null, 2)} />
      </details>
    </section>

    <section className="agent-honesty">
      <div className="section-heading"><span className="eyebrow">Contract</span><h2>What Monet will and will not do</h2></div>
      <dl>{honesty.map(([title, body]) => <div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}</dl>
    </section>

    <section className="agent-state">
      <div className="section-heading"><span className="eyebrow">This workspace</span><h2>What an agent would receive today</h2></div>
      <div className="agent-state-grid">
        <Link to="/principles"><strong>{workspace.principles.length}</strong><span>principles ship with every answer</span></Link>
        <Link to="/foundations"><strong>{workspace.resolvedTokens.length}</strong><span>resolved tokens in the default theme</span></Link>
        <Link to="/components"><strong>{coverage.decided}</strong><span>of {taxonomyEntries(workspace).length} component concepts decided</span></Link>
        <Link to="/patterns"><strong>{workspace.patterns.length}</strong><span>multi-component patterns</span></Link>
      </div>
    </section>
  </div>;
}
