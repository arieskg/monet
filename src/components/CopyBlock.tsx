import { useState } from "react";

/** A copyable snippet. Copy failures are reported rather than swallowed, so the text stays selectable. */
export function CopyBlock({ label, value, language }: { label: string; value: string; language?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1800);
    } catch { setState("error"); }
  }
  return <figure className="copy-block">
    <figcaption><span>{label}</span><button className="button ghost micro" type="button" onClick={() => void copy()} aria-live="polite">{state === "copied" ? "Copied" : state === "error" ? "Copy failed" : "Copy"}</button></figcaption>
    <pre data-language={language}><code>{value}</code></pre>
  </figure>;
}
