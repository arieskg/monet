import { APPEARANCES, appearanceLabels, type Appearance } from "../appearance";
import { useWorkspace } from "../WorkspaceContext";

function AppearanceIcon({ name }: { name: Appearance }) {
  if (name === "light") return <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.1" /><path d="M8 1.4v1.5M8 13.1v1.5M1.4 8h1.5M13.1 8h1.5M3.4 3.4l1.05 1.05M11.55 11.55l1.05 1.05M12.6 3.4l-1.05 1.05M4.45 11.55 3.4 12.6" /></svg>;
  if (name === "dark") return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 16 16"><rect x="1.9" y="3" width="12.2" height="8.2" rx="1.3" /><path d="M5.8 13.8h4.4" /></svg>;
}

/**
 * Selects between the light and dark values the Color foundation already carries. It changes how
 * Monet renders, not what the workspace says, so it is a browser preference and never a save.
 */
export function AppearanceSwitch() {
  const { appearance, setAppearance } = useWorkspace();
  return <div className="appearance-switch" role="group" aria-label="Appearance">
    {APPEARANCES.map((item) => <button key={item} type="button" className={appearance === item ? "active" : ""} aria-pressed={appearance === item} title={`${appearanceLabels[item]} appearance`} onClick={() => setAppearance(item)}><AppearanceIcon name={item} /><span className="visually-hidden">{appearanceLabels[item]} appearance</span></button>)}
  </div>;
}
