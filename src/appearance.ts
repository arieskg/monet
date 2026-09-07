/**
 * How Monet's own chrome renders. This is the application's appearance, not a design-system
 * record: it selects between the light and dark values the Color foundation already carries,
 * exactly as a product built on Monet would. It never writes to the workspace.
 *
 * `system` is the default and follows the operating system. A explicit choice is stamped on
 * the document element so CSS can win over `prefers-color-scheme` in both directions.
 */
export const APPEARANCES = ["system", "light", "dark"] as const;
export type Appearance = (typeof APPEARANCES)[number];
export type ResolvedAppearance = "light" | "dark";

export const appearanceLabels: Record<Appearance, string> = { system: "System", light: "Light", dark: "Dark" };

const STORAGE_KEY = "monet.appearance";

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === "string" && (APPEARANCES as readonly string[]).includes(value);
}

/** The mode an appearance actually renders in, given what the operating system reports. */
export function resolveAppearance(appearance: Appearance, systemPrefersDark: boolean): ResolvedAppearance {
  if (appearance === "system") return systemPrefersDark ? "dark" : "light";
  return appearance;
}

/** A stored preference, or `system` when there is none, storage is unavailable, or the value is stale. */
export function readAppearance(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): Appearance {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return isAppearance(stored) ? stored : "system";
  } catch { return "system"; }
}

export function writeAppearance(appearance: Appearance, storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage()): void {
  try {
    if (appearance === "system") storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, appearance);
  } catch { /* A browser that refuses storage still gets the appearance for this session. */ }
}

/**
 * `data-appearance` carries an explicit choice only. Leaving it off for `system` keeps the
 * `prefers-color-scheme` rules authoritative rather than freezing whatever the OS said at load.
 */
export function applyAppearance(appearance: Appearance, root: HTMLElement): void {
  if (appearance === "system") root.removeAttribute("data-appearance");
  else root.setAttribute("data-appearance", appearance);
}

function safeStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}
