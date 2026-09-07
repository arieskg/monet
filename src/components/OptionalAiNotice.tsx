import { Link } from "react-router-dom";
import { useWorkspace } from "../WorkspaceContext";

/**
 * Two features call an optional local AI CLI. They used to look like the main path and only
 * admitted they needed a provider after a click failed, so this says so before the click. It
 * stays silent when a provider is configured, and when the file service did not report either
 * way — an unknown state is not a claim.
 */
export function OptionalAiNotice({ feature }: { feature: string }) {
  const { environment } = useWorkspace();
  if (!environment || environment.aiConfigured) return null;
  return <aside className="optional-ai-notice">
    <span className="eyebrow">Optional</span>
    <div>
      <b>{feature} needs an AI provider, and none is configured.</b>
      <p>Everything else on this page works without one: the records, retrieval, validation, and the MCP server are all deterministic. Set <code>{environment.aiVariable}</code> to opt in, or keep editing by hand.</p>
    </div>
    <Link className="button" to="/settings">Settings</Link>
  </aside>;
}
