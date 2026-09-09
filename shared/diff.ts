/**
 * A readable line diff for proposal review. Nothing here knows about records; it turns two texts
 * into the lines a person reads as "removed", "added", and "unchanged" so a before/after change can
 * be inspected without comparing two blocks by eye.
 */

export interface DiffLine { kind: "same" | "added" | "removed"; text: string }

/** Inputs past this size are shown as a whole replacement rather than an O(n·m) alignment. */
const MAX_ALIGNED_LINES = 600;

function splitLines(value: string): string[] {
  return value === "" ? [] : value.replace(/\r\n?/g, "\n").split("\n");
}

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  if (a.length > MAX_ALIGNED_LINES || b.length > MAX_ALIGNED_LINES) {
    return [...a.map((text) => ({ kind: "removed" as const, text })), ...b.map((text) => ({ kind: "added" as const, text }))];
  }
  // Longest common subsequence over lines; small inputs, so the table is cheap and the result exact.
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { lines.push({ kind: "same", text: a[i]! }); i++; j++; }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) { lines.push({ kind: "removed", text: a[i]! }); i++; }
    else { lines.push({ kind: "added", text: b[j]! }); j++; }
  }
  while (i < a.length) lines.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) lines.push({ kind: "added", text: b[j++]! });
  return lines;
}

export function diffCounts(lines: DiffLine[]): { added: number; removed: number } {
  return { added: lines.filter((line) => line.kind === "added").length, removed: lines.filter((line) => line.kind === "removed").length };
}
