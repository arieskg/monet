interface FeatureVisibility {
  tokenRegistry: boolean;
  primitives: boolean;
}

// These surfaces are complete enough to preserve, but are intentionally withheld
// until the surrounding design system is more fully established.
export const featureVisibility: FeatureVisibility = {
  tokenRegistry: false,
  primitives: false,
};

export function isSearchResultVisible(type: string): boolean {
  if (type === "Token") return featureVisibility.tokenRegistry;
  if (type === "Primitive") return featureVisibility.primitives;
  return true;
}
