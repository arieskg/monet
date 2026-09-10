import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "./durableFiles.js";

/** A versioned, Monet-owned seed. It cannot inherit edits to the original enrolled workspace. */
export async function instantiateMonetStarter(destination: string): Promise<{ starter_version: string; source_fingerprint: string }> {
  const bytes = await readFile(new URL("../presets/monet-starter.json", import.meta.url), "utf8");
  const bundle = z.object({ version: z.string(), license: z.string(), files: z.record(z.string().regex(/^(principles|foundations|taxonomy|components|primitives|patterns|themes|sources)\/[a-z0-9-]+\.(json|md)$/), z.string()) }).strict().parse(JSON.parse(bytes));
  for (const [relative, contents] of Object.entries(bundle.files)) await atomicWrite(path.join(destination, relative), contents);
  await atomicWrite(path.join(destination, "STARTER-LICENSE.txt"), bundle.license);
  return { starter_version: bundle.version, source_fingerprint: createHash("sha256").update(bytes).digest("hex") };
}
