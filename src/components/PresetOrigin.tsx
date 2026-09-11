import { useEffect, useState } from "react";
import type { PresetReceipt } from "../../shared/presets";
import { api, ApiError } from "../api";

/** Read the Profile's retained snapshot, never the currently installed catalog. Includes forks. */
export function PresetOrigin() {
  const [receipt, setReceipt] = useState<PresetReceipt | null>(null), [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  useEffect(() => { let live = true; void api.presetOrigin().then((r) => { if (live) setReceipt(r); }).catch((e: unknown) => {
    if (live) { const removed = e instanceof ApiError && e.status === 410; setMissing(removed); setError(removed ? e.message : "Preset provenance could not be read."); }
  }); return () => { live = false; }; }, []);
  if (error) return <p role={missing ? "status" : "alert"}>{error}</p>;
  if (!receipt) return null;
  return <details className="preset-origin"><summary>Preset origin — {receipt.manifest.name} {receipt.selection.version}</summary>
    <p>{receipt.manifest.attribution}</p><p>This records the starting copy. Later edits belong to this Profile; changes to the preset do not update it.</p>
    <p>Full provenance is saved in <code>PRESET.json</code>; redistribution notices are saved in <code>PRESET-LICENSES.txt</code>. Retain applicable notices when sharing adapted material.</p>
    <button type="button" className="button ghost micro" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "PRESET.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
    }}>Download provenance and notices</button>
    {receipt.manifest.notices.map((n) => <details key={n.title}><summary>{n.title}</summary><pre className="preset-license">{n.text}</pre></details>)}
  </details>;
}
