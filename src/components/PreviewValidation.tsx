import type { ReactNode } from "react";
import type { CompiledPreview, PreviewComponentDecision } from "../previewCompiler";

function DecisionOrigin({ decision }: { decision?: PreviewComponentDecision }) {
  if (!decision || decision.usesDefault) return <span className="compiled-decision-origin">Monet default</span>;
  return <span className="compiled-decision-origin selected">{decision.sourceName ? `${decision.sourceName} · ${decision.sourceComponent}` : "Selected"}</span>;
}

function ValidationHeader({ eyebrow, title, description, decisions }: { eyebrow: string; title: string; description: string; decisions: (PreviewComponentDecision | undefined)[] }) {
  return <header className="validation-header"><div><span className="compiled-kicker">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><div className="validation-origins">{decisions.map((decision, index) => <DecisionOrigin decision={decision} key={decision?.id ?? index} />)}</div></header>;
}

function StateLabel({ children }: { children: ReactNode }) {
  return <span className="validation-state-label">{children}</span>;
}

function InteractionStates({ model }: { model: CompiledPreview }) {
  const button = model.components.button;
  const input = model.components["text-input"];
  return <section className="compiled-validation-card interaction-validation" data-button-density={button?.preferences.density ?? "default"} data-button-radius={button?.preferences.radius ?? "default"} data-input-size={input?.preferences.size ?? "default"}>
    <ValidationHeader eyebrow="Validation 01" title="Interaction states" description="Resolved controls shown in deterministic resting, pointer, keyboard, unavailable, and destructive states." decisions={[button, input]} />
    <div className="interaction-state-group"><h3>Button</h3><div className="interaction-state-grid">
      <label><StateLabel>Default</StateLabel><button className="state-button" type="button">Continue</button></label>
      <label><StateLabel>Hover</StateLabel><button className="state-button is-hover" type="button">Continue</button></label>
      <label><StateLabel>Focus</StateLabel><button className="state-button is-focus" type="button">Continue</button></label>
      <label><StateLabel>Disabled</StateLabel><button className="state-button" type="button" disabled>Continue</button></label>
      <label><StateLabel>Destructive</StateLabel><button className="state-button is-danger" type="button">Delete project</button></label>
    </div></div>
    <div className="interaction-state-group"><h3>Text input</h3><div className="interaction-state-grid input-states">
      <label><StateLabel>Default</StateLabel><input readOnly value="Project Atlas" /></label>
      <label><StateLabel>Hover</StateLabel><input className="is-hover" readOnly value="Project Atlas" /></label>
      <label><StateLabel>Focus</StateLabel><input className="is-focus" readOnly value="Project Atlas" /></label>
      <label><StateLabel>Disabled</StateLabel><input disabled value="Project Atlas" readOnly /></label>
      <label><StateLabel>Error</StateLabel><input className="is-error" aria-invalid="true" readOnly value="at" /><small>Enter a valid project name.</small></label>
    </div></div>
  </section>;
}

type FeedbackKind = "success" | "warning" | "error" | "info";

function FeedbackTreatment({ kind, title, children }: { kind: FeedbackKind; title: string; children: ReactNode }) {
  const symbols: Record<FeedbackKind, string> = { success: "✓", warning: "!", error: "×", info: "i" };
  return <article className={`feedback-treatment ${kind}`}><i>{symbols[kind]}</i><span><b>{title}</b><small>{children}</small></span></article>;
}

function FeedbackStates({ model }: { model: CompiledPreview }) {
  return <section className="compiled-validation-card feedback-validation">
    <ValidationHeader eyebrow="Validation 02" title="Feedback states" description="Semantic color, hierarchy, and messaging treatments across system and form feedback." decisions={[model.components.alert, model.components.toast]} />
    <div className="feedback-treatment-grid"><FeedbackTreatment kind="success" title="Changes saved">The workspace is up to date.</FeedbackTreatment><FeedbackTreatment kind="warning" title="Review recommended">Two decisions may conflict.</FeedbackTreatment><FeedbackTreatment kind="error" title="Export failed">Check the unresolved token references.</FeedbackTreatment><FeedbackTreatment kind="info" title="New source available">Refresh mappings when you are ready.</FeedbackTreatment></div>
    <div className="feedback-examples"><label className="inline-validation-example"><span>Email address</span><input aria-invalid="true" readOnly value="aries@" /><small><b>Enter a complete email address.</b> Example: aries@example.com</small></label><aside className="toast-validation-example" role="status"><i>✓</i><span><b>Decision saved</b><small>Button preferences were written to Monet.</small></span><button type="button" aria-label="Dismiss example toast">×</button></aside></div>
  </section>;
}

function OverlayValidation({ model }: { model: CompiledPreview }) {
  return <section className="compiled-validation-card overlay-validation">
    <ValidationHeader eyebrow="Validation 03" title="Overlay" description="Backdrop, elevated surface, border, radius, typography, and action hierarchy compiled into one dialog." decisions={[model.components.dialog]} />
    <div className="overlay-validation-stage"><div className="overlay-validation-context"><span /><span /><span /></div><section className="overlay-validation-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-dialog-title"><header><span className="compiled-kicker">Confirm action</span><button type="button" aria-label="Close example dialog">×</button></header><h3 id="preview-dialog-title">Publish this design system?</h3><p>The current foundations, theme, components, and patterns will be included in the export.</p><div className="overlay-dialog-summary"><span>Active theme</span><b>{model.theme.name}</b></div><footer><button className="overlay-secondary" type="button">Cancel</button><button className="overlay-primary" type="button">Publish system</button></footer></section></div>
  </section>;
}

function DenseStatus({ kind, children }: { kind: FeedbackKind | "neutral"; children: ReactNode }) {
  return <span className={`dense-status ${kind}`}><i />{children}</span>;
}

const denseRows = [
  ["DS-184", "Platform refresh", "Maya Chen", "On track", "success", "Sep 18"],
  ["DS-172", "Mobile launch", "Ravi Bose", "At risk", "warning", "Sep 24"],
  ["DS-169", "Billing migration", "Nora Patel", "Blocked", "error", "Sep 26"],
  ["DS-153", "Research synthesis", "Sam Lee", "Planning", "info", "Oct 02"],
  ["DS-148", "Archive cleanup", "Theo Park", "Paused", "neutral", "Oct 08"],
] as const;

function DenseData({ model }: { model: CompiledPreview }) {
  const tableDecision = model.components["data-table"];
  return <section className="compiled-validation-card dense-data-validation" data-density={tableDecision?.preferences.density ?? model.components.table?.preferences.density ?? "default"}>
    <ValidationHeader eyebrow="Validation 04" title="Dense data" description="Compact information hierarchy with semantic statuses, repeated actions, dividers, and pagination." decisions={[tableDecision, model.components.pagination]} />
    <div className="dense-data-toolbar"><div><b>Delivery projects</b><span>24 total · 5 shown</span></div><label><span aria-hidden="true">⌕</span><input readOnly value="" placeholder="Filter projects" aria-label="Filter dense data example" /></label><button type="button">Columns</button></div>
    <div className="dense-table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all example rows" /></th><th>ID</th><th>Project</th><th>Owner</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead><tbody>{denseRows.map(([id, project, owner, status, kind, due]) => <tr key={id}><td><input type="checkbox" aria-label={`Select ${project}`} /></td><td><code>{id}</code></td><td><b>{project}</b></td><td>{owner}</td><td><DenseStatus kind={kind}>{status}</DenseStatus></td><td>{due}</td><td><button className="dense-row-action" type="button" aria-label={`Actions for ${project}`}>•••</button></td></tr>)}</tbody></table></div>
    <footer className="dense-pagination"><span>1–5 of 24</span><nav aria-label="Dense data example pagination"><button type="button" aria-label="Previous page">‹</button><button className="active" type="button" aria-current="page">1</button><button type="button">2</button><button type="button">3</button><button type="button" aria-label="Next page">›</button></nav></footer>
  </section>;
}

export function PreviewValidationAreas({ model }: { model: CompiledPreview }) {
  return <div className="compiled-validation-areas"><InteractionStates model={model} /><FeedbackStates model={model} /><OverlayValidation model={model} /><DenseData model={model} /></div>;
}
