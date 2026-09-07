import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { shellQuote } from "../shellQuote";

it("preserves workspace paths as a single literal shell argument", () => {
  for (const path of ["/tmp/my design system", "/tmp/owner's workspace", "/tmp/$(printf wrong)`printf wrong`$HOME", ""]) {
    expect(execFileSync("/bin/sh", ["-c", `printf '%s' ${shellQuote(path)}`], { encoding: "utf8" })).toBe(path);
  }
});
