import { useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../WorkspaceContext";

const DISMISSED_KEY = "monet.starterNoticeDismissed";

function dismissedRoot(): string {
  try { return window.localStorage.getItem(DISMISSED_KEY) ?? ""; } catch { return ""; }
}

/**
 * The bundled workspace is a worked example and the fixture Monet's own tests assert against, so
 * editing it in place breaks the suite and conflicts on every pull. Nothing else in the product
 * distinguishes it from a workspace the user owns, so the home page has to say so.
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
      <span className="eyebrow">Bundled starter workspace</span>
      <b>You are reading the example, not your design system.</b>
      <p>This repository ships one complete design system as a worked example. It is also the fixture Monet's tests assert against, so edits here can break the suite and will conflict on every <code>git pull</code>. Copy it to a directory you own, then point Monet at the copy.</p>
      <pre><code>{"cp -r monet ~/my-design-system\nMONET_ROOT=~/my-design-system pnpm dev"}</code></pre>
    </div>
    <div className="workspace-notice-actions">
      <Link className="button" to="/settings">Workspace settings</Link>
      <button className="button ghost" type="button" onClick={dismiss}>Got it</button>
    </div>
  </aside>;
}
