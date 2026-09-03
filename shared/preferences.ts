/**
 * Component and primitive preferences are compact settings an agent can act on, not prose.
 *
 * A preference answers "what value does Monet use here" in a phrase. Anything that needs a
 * sentence to justify it belongs in the record's rationale, notes, behavior, use_when, or
 * avoid_when, where retrieval already looks for it. Where a Monet token supplies the value,
 * the preference names that token as `token:<name>` rather than restating a number or a hex.
 */

export const PREFERENCE_VALUE_MAX_LENGTH = 80;

/** Keys whose value must come from a shared vocabulary, so the same concept reads the same way everywhere. */
export const PREFERENCE_VOCABULARY: Record<string, readonly string[]> = {
  density: ["compact", "comfortable", "spacious"],
  elevation: ["none"],
};

/** Keys whose value must be a token reference, optionally with one of the vocabulary values above. */
export const TOKEN_VALUED_PREFERENCES = ["radius", "elevation", "size", "icon_size", "max_width"] as const;

/** Keys removed from the vocabulary, with the field that already carries the same information. */
export const RETIRED_PREFERENCES: Record<string, string> = {
  role: "use_when and avoid_when already state when a component applies.",
};

const TOKEN_REFERENCE = /token:([A-Za-z0-9][A-Za-z0-9.-]*)/g;

/** Every token named inside a preference value, in order. */
export function tokenReferences(value: string): string[] {
  return [...value.matchAll(TOKEN_REFERENCE)].map((match) => match[1]!.replace(/[.-]+$/, ""));
}

/** Contract violations in one preference map, as human-readable strings prefixed with the record id. */
export function preferenceViolations(recordId: string, preferences: Record<string, string>, tokenNames: ReadonlySet<string>): string[] {
  return Object.entries(preferences).flatMap(([key, value]) => {
    const at = `${recordId}.${key}`;
    const vocabulary = PREFERENCE_VOCABULARY[key];
    const tokens = tokenReferences(value);
    return [
      !/^[a-z][a-z0-9_]*$/.test(key) ? `${at}: key is not snake_case` : "",
      key in RETIRED_PREFERENCES ? `${at}: retired key — ${RETIRED_PREFERENCES[key]}` : "",
      value.trim() !== value || !value ? `${at}: value is empty or padded` : "",
      value.length > PREFERENCE_VALUE_MAX_LENGTH ? `${at}: ${value.length} characters, over the ${PREFERENCE_VALUE_MAX_LENGTH} limit` : "",
      value.endsWith(".") ? `${at}: reads as prose rather than a setting` : "",
      vocabulary && !tokens.length && !vocabulary.includes(value) ? `${at}: "${value}" is outside the ${key} vocabulary` : "",
      (TOKEN_VALUED_PREFERENCES as readonly string[]).includes(key) && !tokens.length && !vocabulary?.includes(value) ? `${at}: "${value}" should name a token` : "",
      ...tokens.filter((name) => !tokenNames.has(name)).map((name) => `${at}: unknown token ${name}`),
    ].filter(Boolean);
  });
}
