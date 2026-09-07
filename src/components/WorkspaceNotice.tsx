import { useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../WorkspaceContext";

const DISMISSED_KEY = "monet.starterNoticeDismissed";

function dismissedRoot(): string {
  try { return window.localStorage.getItem(DISMISSED_KEY) ?? ""; } catch { return ""; }
}

/**
 * Nothing else in the product distinguishes the bundled example from a workspace the user owns,
 * so the home page has to. This says the one thing a first-time reader needs — copy it before
 * editing — and leaves why it matters to a contributor (it is also the test fixture) to Settings.
 */
export function WorkspaceNotice() {
  const { environment } = useWorkspace();
  const [dismissed, setDismissed] = useState(dismissedRoot);
  if (!environment?.bundled || dismissed === environment.root) return null;
  function dismiss() {
    if (!environment) return;
    try { window.localStorage.setItem(DISMISSED_KEY, environment.root); } catch { /* Dismissal is a convenience; a browser that refuses storage simply keeps showing it. */ }
    setDismissed(environment.root);
  }
  return <aside className="workspace-notice" aria-label="Workspace">
    <div>
      <span className="eyebrow">Example workspace</span>
      <b>This is the example. Copy it before editing.</b>
      <p>Monet ships one complete design system so there is something real to read on the first run. Copy it somewhere you own and point Monet at the copy — then everything you change is yours, and you can still pull updates to Monet itself.</p>
      <pre><code>{"cp -r monet ~/my-design-system\nMONET_ROOT=~/my-design-system pnpm dev"}</code></pre>
    </div>
    <div className="workspace-notice-actions">
      <Link className="button" to="/settings">Workspace settings</Link>
      <button className="button ghost" type="button" onClick={dismiss}>Got it</button>
    </div>
  </aside>;
}
