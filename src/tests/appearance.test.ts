import { describe, expect, it } from "vitest";
import { applyAppearance, isAppearance, readAppearance, resolveAppearance, writeAppearance } from "../appearance";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    entries: () => Object.fromEntries(values),
  };
}

function rootElement() {
  const attributes = new Map<string, string>();
  return {
    setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    removeAttribute: (name: string) => { attributes.delete(name); },
    get: (name: string) => attributes.get(name),
  } as unknown as HTMLElement & { get: (name: string) => string | undefined };
}

describe("appearance resolution", () => {
  it("follows the system only when the choice is system", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });

  it("recognizes only the appearances it defines", () => {
    expect(isAppearance("dark")).toBe(true);
    expect(isAppearance("sepia")).toBe(false);
    expect(isAppearance(undefined)).toBe(false);
  });
});

describe("appearance storage", () => {
  it("falls back to system for missing, stale, and unavailable values", () => {
    expect(readAppearance(memoryStorage())).toBe("system");
    expect(readAppearance(memoryStorage({ "monet.appearance": "sepia" }))).toBe("system");
    expect(readAppearance(undefined)).toBe("system");
  });

  it("round-trips an explicit choice and clears the key for system", () => {
    const storage = memoryStorage();
    writeAppearance("dark", storage);
    expect(readAppearance(storage)).toBe("dark");
    writeAppearance("system", storage);
    expect(storage.entries()).toEqual({});
    expect(readAppearance(storage)).toBe("system");
  });
});

describe("appearance attribute", () => {
  it("stamps an explicit choice and leaves system to the media query", () => {
    const root = rootElement();
    applyAppearance("dark", root);
    expect(root.get("data-appearance")).toBe("dark");
    applyAppearance("light", root);
    expect(root.get("data-appearance")).toBe("light");
    applyAppearance("system", root);
    expect(root.get("data-appearance")).toBeUndefined();
  });
});
