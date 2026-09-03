import { useEffect, useRef, useState } from "react";

interface JsonImportDialogProps<T> {
  title: string;
  description: string;
  dialogId: string;
  onClose: () => void;
  onImport: (value: T) => void;
  parse: (value: unknown) => T;
  primaryLabel?: string;
}

export function JsonImportDialog<T>({ title, description, dialogId, onClose, onImport, parse, primaryLabel = "Use JSON" }: JsonImportDialogProps<T>) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add("dialog-open");
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("dialog-open"); };
  }, [onClose]);

  async function readFile(file: File) {
    try {
      setInput(await file.text());
      setError("");
    } catch {
      setError("Unable to read that JSON file.");
    }
  }

  function applyImport() {
    try {
      const value = parse(JSON.parse(input));
      onImport(value);
    } catch (caught) {
      setError(caught instanceof SyntaxError ? "Enter one valid JSON object or array." : caught instanceof Error ? caught.message : "Unable to import this JSON.");
    }
  }

  return <div className="json-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="json-import-dialog" role="dialog" aria-modal="true" aria-labelledby={dialogId}>
      <header><div><span className="eyebrow">JSON import</span><h2 id={dialogId}>{title}</h2></div><button className="dialog-close" aria-label={`Close ${title}`} onClick={onClose}>×</button></header>
      <p>{description}</p>
      <div className="json-file-actions"><label className="button ghost"><input ref={fileInput} type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.currentTarget.value = ""; }} />Choose JSON file</label><span>or paste below</span></div>
      <textarea autoFocus spellCheck={false} value={input} onChange={(event) => { setInput(event.target.value); setError(""); }} placeholder="Paste JSON here…" aria-label={`${title} JSON`} />
      {error && <div className="json-import-error" role="alert">{error}</div>}
      <footer><button className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={!input.trim()} onClick={applyImport}>{primaryLabel}</button></footer>
    </section>
  </div>;
}
