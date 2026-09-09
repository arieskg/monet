import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { providerSupportsImages, runProvider, type ProviderTask } from "./aiProvider.js";

describe("provider image contract and failure handling", () => {
  const task: ProviderTask = { label: "Gap diagnosis", prompt: "Untrusted screenshot evidence", schema: {}, modelVariable: "M", effortVariable: "E", timeoutVariable: "T" };

  it("defaults to text-only and rejects image input without explicit capability", async () => {
    expect(providerSupportsImages({})).toBe(false);
    expect(providerSupportsImages({ MONET_AI_IMAGES: "1" })).toBe(true);
    await expect(runProvider({ ...task, image: { bytes: new Uint8Array([1]), extension: "png" } }, { MONET_AI_COMMAND: process.execPath })).rejects.toThrow(/not enabled/);
  });

  it("passes a bounded image via the compatible CLI contract and removes its temporary copy", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "monet-provider-test-"));
    try {
      const command = path.join(directory, "provider");
      const capture = path.join(directory, "capture.json");
      await writeFile(command, `#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2); const image = args[args.indexOf('--image')+1]; const output = args[args.indexOf('-o')+1]; let prompt=''; process.stdin.on('data', c => prompt += c); process.stdin.on('end', () => { fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args, image, bytes: fs.readFileSync(image).toString('base64'), mode: fs.statSync(image).mode & 511, prompt})); fs.writeFileSync(output, '{"ok":true}'); });\n`, { mode: 0o700 });
      expect(await runProvider({ ...task, image: { bytes: new Uint8Array([1, 2, 3]), extension: "png" } }, { MONET_AI_COMMAND: command, MONET_AI_IMAGES: "1" })).toEqual({ ok: true });
      const recorded = JSON.parse(await readFile(capture, "utf8")) as { args: string[]; image: string; bytes: string; mode: number; prompt: string };
      expect(recorded.args).toContain("read-only");
      expect(recorded.prompt).toBe(task.prompt);
      expect(recorded.bytes).toBe("AQID"); expect(recorded.mode).toBe(0o600);
      await expect(stat(recorded.image)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("survives a provider exiting before reading a large prompt", async () => {
    await expect(runProvider({ ...task, prompt: "x".repeat(500_000) }, { MONET_AI_COMMAND: "/usr/bin/false" })).rejects.toThrow(/failed/);
  });
});
