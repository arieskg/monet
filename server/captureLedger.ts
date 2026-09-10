import { randomUUID } from "node:crypto";
import { PROJECT_LIMITS, type SurfaceCapture } from "../shared/projects.js";
import type { NormalizedSurfaceInput } from "../shared/surfaces.js";
import { workspaceScope } from "./workspace.js";
import { SurfaceError } from "./surfaceSanitizer.js";

/**
 * Captured screens wait here, in memory, until the user previews or saves them as a Surface.
 * The client only ever holds the capture id: the raw capture and its provenance stay server-side,
 * so a saved Surface's project/screen provenance is attested by the service, never by the browser.
 * Entries belong to the Profile that captured them, are few, and expire.
 */
export interface LedgerEntry { id: string; profile_id?: string; expires_at: string; input: NormalizedSurfaceInput; capture: SurfaceCapture }
const ledger = new Map<string, LedgerEntry>();
function sweep(): void { const now = Date.now(); for (const [id, entry] of ledger) if (Date.parse(entry.expires_at) <= now) ledger.delete(id); }
export function storeCapture(input: NormalizedSurfaceInput, capture: SurfaceCapture): LedgerEntry {
  sweep();
  while (ledger.size >= PROJECT_LIMITS.ledger) { const oldest = ledger.keys().next().value; if (oldest === undefined) break; ledger.delete(oldest); }
  const entry: LedgerEntry = { id: randomUUID(), profile_id: workspaceScope().identity?.id, expires_at: new Date(Date.now() + PROJECT_LIMITS.ledgerMs).toISOString(), input, capture };
  ledger.set(entry.id, entry);
  return entry;
}
/** Read a capture for the current Profile only. A foreign or expired id reads as not found. */
export function readCapture(id: string): LedgerEntry {
  sweep();
  const entry = ledger.get(id);
  if (!entry || entry.profile_id !== workspaceScope().identity?.id) throw new SurfaceError("Capture not found or expired. Capture the screen again.", 404);
  return entry;
}
export function releaseCapture(id: string): void { ledger.delete(id); }
export function clearCaptureLedger(): void { ledger.clear(); }
