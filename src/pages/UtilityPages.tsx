import { PageHeader } from "../components/Common";

export function SettingsPage() {
  return <div className="page narrow-page"><PageHeader eyebrow="Workspace" title="Settings" description="Configure Monet’s workspace and application preferences." /><div className="state-panel"><h2>No settings are available yet.</h2><p>This destination is reserved for future workspace preferences.</p></div></div>;
}
