import { describe, expect, it } from "vitest";
import { isSaveShortcut } from "../keyboard";

describe("keyboard shortcuts", () => {
  it("recognizes control-command-s", () => {
    expect(isSaveShortcut({ key: "s", metaKey: true, ctrlKey: true })).toBe(true);
    expect(isSaveShortcut({ key: "S", metaKey: true, ctrlKey: true })).toBe(true);
  });

  it("ignores command-s, control-s, and unrelated modified keys", () => {
    expect(isSaveShortcut({ key: "s", metaKey: false, ctrlKey: false })).toBe(false);
    expect(isSaveShortcut({ key: "s", metaKey: true, ctrlKey: false })).toBe(false);
    expect(isSaveShortcut({ key: "s", metaKey: false, ctrlKey: true })).toBe(false);
    expect(isSaveShortcut({ key: "p", metaKey: true, ctrlKey: true })).toBe(false);
  });
});
