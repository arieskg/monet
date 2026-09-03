import { useEffect, useState } from "react";
import { buildDecisionClipboardText, buildDecisionInstructions, buildDecisionJson, restoreProtectedDecisionFields, validateDecisionJson, type AiDecisionKind } from "../aiDecision";
import { JsonImportDialog } from "./JsonImportDialog";

export function AiDecisionActions<T extends { id: string }>({ kind, value, context, onImport }: {
  kind: AiDecisionKind;
  value: T;
  context?: string;
  onImport: (value: T) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [promptOpen, setPromptOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [decisionJson, setDecisionJson] = useState("");

  useEffect(() => {
    if (!promptOpen && !importOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setPromptOpen(false); setImportOpen(false); }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [promptOpen, importOpen]);

  useEffect(() => {
    document.body.classList.toggle("dialog-open", promptOpen || importOpen);
    return () => document.body.classList.remove("dialog-open");
  }, [promptOpen, importOpen]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildDecisionClipboardText(instructions, decisionJson));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  }

  function showPrompt() {
    setInstructions(buildDecisionInstructions(kind, context));
    setDecisionJson(buildDecisionJson(kind, value));
    setCopyState("idle");
    setPromptOpen(true);
  }

  function showImport() {
    setImportOpen(true);
  }

  function parseImport(input: unknown): T {
    const parsed = restoreProtectedDecisionFields(kind, input, value);
    const validationError = validateDecisionJson(kind, parsed, value.id);
    if (validationError) throw new Error(validationError);
    return parsed as T;
  }

  return <>
    <div className="ai-decision-actions">
      <button className="button ghost micro" onClick={showPrompt} title={`Prepare an AI prompt for this ${kind.toLowerCase()}`}>AI prompt</button>
      <button className="button ghost micro" onClick={showImport} title={`Paste an AI-generated ${kind.toLowerCase()} JSON record`}>Import JSON</button>
    </div>
    {promptOpen && <div className="json-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPromptOpen(false); }}>
      <section className="json-import-dialog ai-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby={`ai-prompt-${value.id}`}>
        <header><div><span className="eyebrow">AI handoff</span><h2 id={`ai-prompt-${value.id}`}>Prepare {kind} prompt</h2></div><button className="dialog-close" aria-label="Close AI prompt" onClick={() => setPromptOpen(false)}>×</button></header>
        <p>Adjust the instructions if needed. Copy AI combines the instructions and current JSON into one clipboard-ready prompt.</p>
        <div className="ai-prompt-fields">
          <label>Instructions<textarea autoFocus value={instructions} onChange={(event) => { setInstructions(event.target.value); setCopyState("idle"); }} aria-label={`${kind} AI instructions`} /></label>
          <label><span>Current {kind} JSON{kind === "Component" ? " · history and candidate catalog excluded" : ""}</span><textarea className="ai-prompt-json" readOnly spellCheck={false} value={decisionJson} aria-label={`${kind} AI JSON`} /></label>
        </div>
        <footer><span className={`copy-ai-status ${copyState}`} aria-live="polite">{copyState === "copied" ? "Copied both sections" : copyState === "error" ? "Clipboard copy failed" : ""}</span><button className="button ghost" onClick={() => setPromptOpen(false)}>Cancel</button><button className="button primary" disabled={!instructions.trim() || !decisionJson.trim()} onClick={() => void copyPrompt()}>{copyState === "copied" ? "Copied" : "Copy AI"}</button></footer>
      </section>
    </div>}
    {importOpen && <JsonImportDialog title={`Import ${kind} JSON`} description={`Paste or choose the complete ${kind.toLowerCase()} JSON object. Monet validates it and keeps the result as an unsaved draft.${kind === "Component" ? " Existing candidates, history, and omitted Advanced fields remain unchanged." : ""}`} dialogId={`json-import-${value.id}`} onClose={() => setImportOpen(false)} onImport={(next) => { onImport(next); setImportOpen(false); }} parse={parseImport} primaryLabel="Use JSON draft" />}
  </>;
}
