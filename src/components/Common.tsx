/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { componentDecisionLabels, componentDecisionStatus, componentDecisionStatuses, statusLabels, statuses, type ComponentDecisionStatus, type Status } from "../domain";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-actions">{action}</div>}</header>;
}

export function StatusSelect({ value, onChange }: { value: Status; onChange: (value: Status) => void }) {
  return <label className="status-field"><span>Status</span><select value={value} onChange={(event) => onChange(event.target.value as Status)}>{statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>;
}

export function ComponentDecisionSelect({ value, onChange }: { value: Status; onChange: (value: ComponentDecisionStatus) => void }) {
  return <label className="status-field"><span>Decision</span><select value={componentDecisionStatus(value)} onChange={(event) => onChange(event.target.value as ComponentDecisionStatus)}><option value="" disabled>Choose…</option>{componentDecisionStatuses.map((item) => <option key={item} value={item}>{componentDecisionLabels[item]}</option>)}</select></label>;
}

export function StatusPill({ value }: { value: Status }) {
  return <span className={`status-pill ${value}`}>{statusLabels[value]}</span>;
}

export function SaveNotice({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  return <span className={`save-notice ${state}`} aria-live="polite">{state === "saving" ? "Saving…" : state === "saved" ? "Saved to files" : state === "error" ? "Save failed" : ""}</span>;
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="state-panel"><span className="eyebrow">Unable to load</span><h2>Monet’s files are not available.</h2><p>{message}</p><button className="button" onClick={retry}>Try again</button></div>;
}

export function formatDate(value: string): string {
  if (!value) return "Not saved yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
