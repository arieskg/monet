import type { ReactNode } from "react";

type PreviewAdapter = () => ReactNode;

function ActionButtons({ iconOnly = false }: { iconOnly?: boolean }) {
  return <div className="preview-row">{iconOnly ? <><button type="button" aria-label="Add item">＋</button><button type="button" className="secondary" aria-label="More options">•••</button></> : <><button type="button">Continue</button><button type="button" className="secondary">Cancel</button><button type="button" disabled>Disabled</button></>}</div>;
}

function TextFieldPreview({ kind = "text" }: { kind?: "text" | "textarea" | "search" | "password" | "number" | "otp" }) {
  if (kind === "textarea") return <label className="preview-field">Message<textarea defaultValue="A concise note about this decision." /></label>;
  if (kind === "otp") return <div className="preview-stack"><span className="preview-label">Verification code</span><div className="preview-otp">{["4", "8", "2", ""].map((value, index) => <span key={index}>{value || "·"}</span>)}</div><small>Enter the four-digit code.</small></div>;
  const labels = { text: "Email address", search: "Search", password: "Password", number: "Quantity" } as const;
  const values = { text: "name@example.com", search: "Design systems", password: "••••••••••", number: "12" } as const;
  return <label className="preview-field">{labels[kind]}<span className="preview-input-shell">{kind === "search" && <i>⌕</i>}<input readOnly value={values[kind]} />{kind === "password" && <button type="button" aria-label="Show password">Show</button>}{kind === "number" && <span className="preview-stepper">＋<i />−</span>}</span>{kind === "text" && <small>We’ll only use this for receipts.</small>}</label>;
}

function ChoicePreview({ kind }: { kind: "checkbox" | "radio" | "switch" | "segmented" | "select" | "combobox" | "autocomplete" | "multi-select" }) {
  if (kind === "segmented") return <div className="preview-segments"><b>Day</b><span>Week</span><span>Month</span></div>;
  if (kind === "select") return <label className="preview-field">Workspace<select defaultValue="design"><option value="design">Design system</option><option>Product</option></select></label>;
  if (kind === "combobox" || kind === "autocomplete") return <div className="preview-stack"><label className="preview-field">{kind === "combobox" ? "Assignee" : "Location"}<input readOnly value={kind === "combobox" ? "Aries" : "New Yo"} /></label><div className="preview-option-list"><b>{kind === "combobox" ? "Aries" : "New York"}</b><span>{kind === "combobox" ? "Design team" : "United States"}</span></div></div>;
  if (kind === "multi-select") return <div className="preview-stack"><span className="preview-label">Skills</span><div className="preview-chip-field"><span>Research ×</span><span>Design ×</span><i>Add skill…</i></div></div>;
  if (kind === "switch") return <div className="preview-stack preview-choice-list"><label><span className="preview-switch on"><i /></span><span><b>Notifications</b><small>Receive important updates</small></span></label><label><span className="preview-switch"><i /></span><span><b>Marketing</b><small>Occasional product news</small></span></label></div>;
  return <div className="preview-stack preview-choice-list">{["Design", "Engineering", "Research"].map((label, index) => <label key={label}><input type={kind} name={`preview-${kind}`} defaultChecked={index === 0} /><span>{label}</span></label>)}</div>;
}

function CalendarPreview({ range = false }: { range?: boolean }) {
  return <div className="preview-calendar"><header><button type="button" aria-label="Previous month">‹</button><b>September 2026</b><button type="button" aria-label="Next month">›</button></header><div>{["M", "T", "W", "T", "F", "S", "S", "31", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"].map((day, index) => <span className={day === "8" || (range && ["9", "10", "11"].includes(day)) ? "chosen" : ""} key={`${day}-${index}`}>{day}</span>)}</div></div>;
}

function DateTimePreview({ kind }: { kind: "date-input" | "date-picker" | "date-range-picker" | "calendar" | "time-picker" | "date-time-picker" }) {
  if (kind === "date-picker" || kind === "calendar") return <CalendarPreview />;
  if (kind === "date-range-picker") return <CalendarPreview range />;
  if (kind === "time-picker") return <label className="preview-field">Time<div className="preview-time"><b>09</b><span>:</span><b>30</b><i>AM</i></div></label>;
  if (kind === "date-time-picker") return <div className="preview-row"><label className="preview-field">Date<input readOnly value="Sep 8, 2026" /></label><label className="preview-field">Time<input readOnly value="9:30 AM" /></label></div>;
  return <label className="preview-field">Start date<span className="preview-input-shell"><input readOnly value="09 / 08 / 2026" /><i>▦</i></span></label>;
}

function NavigationPreview({ kind }: { kind: "breadcrumb" | "tabs" | "sidebar" | "navigation-menu" | "menubar" | "pagination" | "stepper" | "command-palette" }) {
  if (kind === "breadcrumb") return <div className="preview-breadcrumb"><span>Workspace</span><i>›</i><span>Components</span><i>›</i><b>Button</b></div>;
  if (kind === "tabs") return <div className="preview-stack"><div className="preview-tabs"><b>Overview</b><span>Activity</span><span>Settings</span></div><p>Selected view content</p></div>;
  if (kind === "sidebar") return <div className="preview-sidebar"><b>Workspace</b><span className="active">Overview</span><span>Components</span><span>Patterns</span></div>;
  if (kind === "navigation-menu") return <div className="preview-nav-menu"><b>Monet</b><span>Foundations</span><span>Components⌄</span><span>Patterns</span></div>;
  if (kind === "menubar") return <div className="preview-stack"><div className="preview-menubar"><b>File</b><span>Edit</span><span>View</span><span>Help</span></div><div className="preview-menu"><span>New decision <kbd>⌘N</kbd></span><span>Open… <kbd>⌘O</kbd></span><i /><span>Export</span></div></div>;
  if (kind === "pagination") return <div className="preview-pagination"><button type="button">‹</button><button type="button" className="active">1</button><button type="button">2</button><button type="button">3</button><span>…</span><button type="button">12</button><button type="button">›</button></div>;
  if (kind === "stepper") return <div className="preview-stepper-flow">{["Details", "Preferences", "Review"].map((label, index) => <span className={index === 0 ? "active" : ""} key={label}><i>{index + 1}</i><b>{label}</b></span>)}</div>;
  return <div className="preview-command"><span>⌕</span><b>Search commands…</b><kbd>⌘K</kbd><div><small>Suggested</small><span>Open Components <kbd>↵</kbd></span><span>Export workspace</span></div></div>;
}

function OverlayPreview({ kind }: { kind: "dialog" | "alert-dialog" | "drawer" | "sheet" | "popover" | "tooltip" | "hover-card" | "dropdown-menu" | "context-menu" }) {
  if (kind === "dialog" || kind === "alert-dialog") return <div className="preview-overlay-stage"><div className="preview-dialog"><b>{kind === "alert-dialog" ? "Delete this decision?" : "Save this decision?"}</b><p>{kind === "alert-dialog" ? "This action cannot be undone." : "Your changes will be written to the workspace."}</p><div><button type="button" className="secondary">Cancel</button><button type="button" className={kind === "alert-dialog" ? "danger" : ""}>{kind === "alert-dialog" ? "Delete" : "Save"}</button></div></div></div>;
  if (kind === "drawer" || kind === "sheet") return <div className={`preview-edge-panel ${kind}`}><div><header><b>{kind === "drawer" ? "Filters" : "Component details"}</b><button type="button" aria-label="Close">×</button></header><p>Focused supplementary content appears without replacing the page.</p><button type="button">Apply</button></div></div>;
  if (kind === "tooltip") return <div className="preview-anchor"><button type="button" aria-label="Information">?</button><span className="preview-tooltip">More information<i /></span></div>;
  if (kind === "hover-card") return <div className="preview-anchor"><span className="preview-link">@aries</span><div className="preview-hover-card"><span className="preview-avatar">AK</span><b>Aries</b><small>Design system owner</small></div></div>;
  if (kind === "popover") return <div className="preview-anchor"><button type="button">Open details</button><div className="preview-popover"><b>Component status</b><p>Needs review before adoption.</p></div></div>;
  return <div className="preview-menu"><span>Open</span><span>Duplicate <kbd>⌘D</kbd></span><i /><span className="danger-text">Delete</span></div>;
}

function FeedbackPreview({ kind }: { kind: "alert" | "toast" | "banner" | "progress" | "spinner" | "skeleton" | "empty-state" | "status-indicator" }) {
  if (kind === "alert" || kind === "banner") return <div className={`preview-notice ${kind}`}><i>i</i><span><b>{kind === "banner" ? "Workspace update available" : "Review needed"}</b><small>{kind === "banner" ? "Refresh when you are ready." : "Two component decisions need attention."}</small></span>{kind === "banner" && <button type="button">Review</button>}</div>;
  if (kind === "toast") return <div className="preview-toast"><i>✓</i><span><b>Decision saved</b><small>Your workspace is up to date.</small></span><button type="button" aria-label="Dismiss">×</button></div>;
  if (kind === "progress") return <div className="preview-stack"><div className="preview-progress-meta"><b>Exporting workspace</b><span>68%</span></div><div className="preview-progress"><i /></div><small>Preparing design-system files…</small></div>;
  if (kind === "spinner") return <div className="preview-loading"><i /><span>Loading components…</span></div>;
  if (kind === "skeleton") return <div className="preview-skeleton"><i /><span><b /><b /><b /></span></div>;
  if (kind === "empty-state") return <div className="preview-empty"><i>◇</i><b>No decisions yet</b><span>Choose a component to begin.</span><button type="button">Browse components</button></div>;
  return <div className="preview-row"><span className="preview-status success"><i />Operational</span><span className="preview-status warning"><i />Needs review</span></div>;
}

function TablePreview({ interactive = false }: { interactive?: boolean }) {
  return <table className="preview-table"><thead><tr>{interactive && <th><input type="checkbox" aria-label="Select all" /></th>}<th>Component</th><th>Status</th><th>Owner</th></tr></thead><tbody>{[["Button", "Selected", "Aries"], ["Dialog", "Review", "Aries"]].map((row) => <tr key={row[0]}>{interactive && <td><input type="checkbox" aria-label={`Select ${row[0]}`} /></td>}{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table>;
}

function DataDisplayPreview({ kind }: { kind: "table" | "data-table" | "list" | "tree" | "card" | "badge" | "tag" | "avatar" | "timeline" | "accordion" | "carousel" | "statistic" }) {
  if (kind === "table" || kind === "data-table") return <TablePreview interactive={kind === "data-table"} />;
  if (kind === "list") return <div className="preview-list">{["Color foundations", "Button decision", "Form pattern"].map((item, index) => <span key={item}><i>{index + 1}</i><b>{item}</b><small>Updated today</small></span>)}</div>;
  if (kind === "tree") return <div className="preview-tree"><span>⌄ <b>Foundations</b></span><span className="nested">◇ Color</span><span className="nested">◇ Typography</span><span>› <b>Components</b></span></div>;
  if (kind === "card") return <div className="preview-card"><span className="preview-card-art">M</span><b>Monet workspace</b><p>Portable design intent for future projects.</p><button type="button">Open workspace</button></div>;
  if (kind === "badge" || kind === "tag") return <div className="preview-row">{kind === "badge" ? <><span className="preview-badge">Selected</span><span className="preview-badge muted">Draft</span><span className="preview-badge warning">Review</span></> : <><span className="preview-tag">Design ×</span><span className="preview-tag">React ×</span></>}</div>;
  if (kind === "avatar") return <div className="preview-row"><span className="preview-avatar large">AK</span><span className="preview-avatar">MO</span><span className="preview-avatar small">DS</span></div>;
  if (kind === "timeline") return <div className="preview-timeline"><span><i /><b>Decision selected</b><small>Today, 3:42 PM</small></span><span><i /><b>Candidate compared</b><small>Yesterday</small></span><span><i /><b>Component created</b><small>Aug 30</small></span></div>;
  if (kind === "accordion") return <div className="preview-accordion"><span><b>What is Monet?</b><i>−</i><p>A portable design-system workspace.</p></span><span><b>How are decisions stored?</b><i>＋</i></span></div>;
  if (kind === "carousel") return <div className="preview-carousel"><button type="button" aria-label="Previous">‹</button><div><b>Component foundations</b><span>1 of 3</span></div><button type="button" aria-label="Next">›</button></div>;
  return <div className="preview-stat"><span>Components defined</span><b>23</b><small>↑ 4 this week</small></div>;
}

function VisualizationPreview({ kind }: { kind: "chart" | "sparkline" | "gauge" | "progress-visualization" }) {
  if (kind === "chart") return <div className="preview-chart"><div className="preview-bars">{[42, 68, 54, 82, 64, 92].map((height, index) => <i style={{ height: `${height}%` }} key={index} />)}</div><span><small>Mon</small><small>Tue</small><small>Wed</small><small>Thu</small><small>Fri</small><small>Sat</small></span></div>;
  if (kind === "sparkline") return <div className="preview-spark"><span><b>1,284</b><small>Component views</small></span><svg viewBox="0 0 180 60" aria-label="Upward trend"><polyline points="0,48 28,39 55,44 82,24 110,31 142,12 180,18" /></svg></div>;
  if (kind === "gauge") return <div className="preview-gauge"><div><i /><span><b>72%</b><small>Coverage</small></span></div></div>;
  return <div className="preview-stage-progress">{[["Foundations", 92], ["Components", 28], ["Patterns", 83]].map(([label, value]) => <span key={label}><b>{label}</b><i><em style={{ width: `${value}%` }} /></i><small>{value}%</small></span>)}</div>;
}

function LayoutPreview({ kind }: { kind: "container" | "stack" | "flex" | "grid" | "divider" | "scroll-area" | "resizable-panels" | "aspect-ratio" }) {
  if (kind === "container") return <div className="preview-container-demo"><span>Constrained content region</span></div>;
  if (kind === "stack") return <div className="preview-layout-stack"><span /><span /><span /></div>;
  if (kind === "flex") return <div className="preview-layout-flex"><span>Flexible</span><span>Content</span><span>Row</span></div>;
  if (kind === "grid") return <div className="preview-layout-grid">{Array.from({ length: 6 }, (_, index) => <span key={index}>{index + 1}</span>)}</div>;
  if (kind === "divider") return <div className="preview-divider"><span>Account</span><i /><span>Preferences</span></div>;
  if (kind === "scroll-area") return <div className="preview-scroll"><div>{["Color", "Typography", "Spacing", "Radius", "Sizing", "Borders"].map((item) => <span key={item}>{item}</span>)}</div><i /></div>;
  if (kind === "resizable-panels") return <div className="preview-panels"><span>Navigation</span><i>⋮</i><span>Content</span></div>;
  return <div className="preview-aspect"><span>16 : 9</span></div>;
}

function UtilityPreview({ kind }: { kind: "field" | "fieldset" | "label" | "file-upload" | "slider" | "rating" | "clipboard" | "keyboard-shortcut" }) {
  if (kind === "field") return <label className="preview-field">Project name<input readOnly value="Monet" /><small>Use a short, recognizable name.</small></label>;
  if (kind === "fieldset") return <fieldset className="preview-fieldset"><legend>Notifications</legend><label><input type="checkbox" defaultChecked /> Product updates</label><label><input type="checkbox" /> Weekly summary</label></fieldset>;
  if (kind === "label") return <div className="preview-stack"><span className="preview-standalone-label">Email address <b>Required</b></span><input readOnly value="name@example.com" /></div>;
  if (kind === "file-upload") return <div className="preview-upload"><i>⇧</i><b>Drop files here</b><span>or choose from your computer</span><button type="button">Choose files</button></div>;
  if (kind === "slider") return <div className="preview-stack"><div className="preview-progress-meta"><b>Volume</b><span>68</span></div><input type="range" defaultValue="68" /></div>;
  if (kind === "rating") return <div className="preview-rating"><span>★</span><span>★</span><span>★</span><span>★</span><i>☆</i><b>4.0</b></div>;
  if (kind === "clipboard") return <div className="preview-copy"><code>npm run monet</code><button type="button">Copy</button></div>;
  return <div className="preview-shortcuts"><span>Open search <kbd>⌘ K</kbd></span><span>Save decision <kbd>⌘ S</kbd></span><span>Close dialog <kbd>Esc</kbd></span></div>;
}

interface SourceProfile {
  id: string;
  primary: string;
  secondary: string;
  icon: string;
  fieldLabel: string;
  fieldValue: string;
  selectLabel: string;
  selectValue: string;
  tabs: readonly [string, string, string];
  dialogTitle: string;
  dialogAction: string;
  dateLabel: string;
}

const sourceProfiles: readonly SourceProfile[] = [
  { id: "github-primer", primary: "Create issue", secondary: "Preview", icon: "＋", fieldLabel: "Issue title", fieldValue: "Improve component previews", selectLabel: "Repository", selectValue: "acme / platform", tabs: ["Code", "Issues", "Pull requests"], dialogTitle: "Open a pull request?", dialogAction: "Create pull request", dateLabel: "Contribution date" },
  { id: "material-ui", primary: "SAVE CHANGES", secondary: "CANCEL", icon: "✦", fieldLabel: "Project name", fieldValue: "Monet workspace", selectLabel: "Theme", selectValue: "Material 3", tabs: ["OVERVIEW", "ACTIVITY", "SETTINGS"], dialogTitle: "Save changes?", dialogAction: "SAVE", dateLabel: "Select date" },
  { id: "shadcn", primary: "Save changes", secondary: "Cancel", icon: "⌘", fieldLabel: "Username", fieldValue: "aries", selectLabel: "Framework", selectValue: "React", tabs: ["Account", "Password", "Team"], dialogTitle: "Edit component", dialogAction: "Save changes", dateLabel: "Pick a date" },
  { id: "shopify-polaris", primary: "Save", secondary: "Discard", icon: "◇", fieldLabel: "Product title", fieldValue: "Design system kit", selectLabel: "Sales channel", selectValue: "Online Store", tabs: ["Details", "Inventory", "Shipping"], dialogTitle: "Save product changes?", dialogAction: "Save", dateLabel: "Active dates" },
  { id: "ibm-carbon", primary: "Continue", secondary: "Back", icon: "→", fieldLabel: "Service name", fieldValue: "Design system API", selectLabel: "Environment", selectValue: "Production", tabs: ["Overview", "Resources", "Activity"], dialogTitle: "Submit this request?", dialogAction: "Submit", dateLabel: "Deployment date" },
  { id: "ant-design", primary: "Primary", secondary: "Default", icon: "＋", fieldLabel: "Application name", fieldValue: "Monet Admin", selectLabel: "Region", selectValue: "North America", tabs: ["Overview", "Analytics", "Settings"], dialogTitle: "Confirm this action", dialogAction: "OK", dateLabel: "Effective date" },
  { id: "mantine", primary: "Save profile", secondary: "Cancel", icon: "✎", fieldLabel: "Display name", fieldValue: "Aries K.", selectLabel: "Color scheme", selectValue: "Auto", tabs: ["Profile", "Security", "Notifications"], dialogTitle: "Update your profile?", dialogAction: "Update", dateLabel: "Available from" },
  { id: "react-aria", primary: "Save", secondary: "Reset", icon: "◎", fieldLabel: "Accessible name", fieldValue: "Component preview", selectLabel: "Locale", selectValue: "English (US)", tabs: ["Details", "Access", "History"], dialogTitle: "Save accessible settings?", dialogAction: "Save", dateLabel: "Appointment date" },
  { id: "atlassian-design", primary: "Create", secondary: "Cancel", icon: "＋", fieldLabel: "Project key", fieldValue: "MONET", selectLabel: "Project type", selectValue: "Software", tabs: ["Summary", "Board", "Timeline"], dialogTitle: "Create this project?", dialogAction: "Create project", dateLabel: "Due date" },
  { id: "chakra-ui", primary: "Submit", secondary: "Cancel", icon: "⚡", fieldLabel: "Workspace name", fieldValue: "Monet", selectLabel: "Plan", selectValue: "Professional", tabs: ["General", "Members", "Billing"], dialogTitle: "Submit your changes?", dialogAction: "Submit", dateLabel: "Start date" },
];

function SourceAdapterFrame({ profile, children }: { profile: SourceProfile; children: ReactNode }) {
  return <div className={`source-adapter-frame source-${profile.id}`} data-preview-source={profile.id}>{children}</div>;
}

function SourceButtonPreview({ profile }: { profile: SourceProfile }) {
  return <div className={`source-specific-preview source-button-preview source-${profile.id}`} data-preview-source={profile.id}><button type="button"><span>{profile.icon}</span>{profile.primary}</button><button type="button" className="secondary">{profile.secondary}</button>{profile.id === "ant-design" && <button type="button" className="source-dashed">Dashed</button>}</div>;
}

function SourceIconButtonPreview({ profile }: { profile: SourceProfile }) {
  return <div className={`source-specific-preview source-icon-button-preview source-${profile.id}`} data-preview-source={profile.id}><button type="button" aria-label={profile.primary}>{profile.icon}</button><button type="button" className="secondary" aria-label="More options">•••</button><button type="button" className="secondary" aria-label="Close">×</button></div>;
}

function SourceTextFieldPreview({ profile, multiline = false }: { profile: SourceProfile; multiline?: boolean }) {
  return <label className={`source-specific-preview source-field-preview source-${profile.id}`} data-preview-source={profile.id}><span>{profile.fieldLabel}</span>{multiline ? <textarea defaultValue={`${profile.fieldValue}\nAdd supporting context here.`} /> : <input readOnly value={profile.fieldValue} />}<small>{profile.id === "material-ui" ? "Helper text" : profile.id === "ibm-carbon" ? "Optional helper text" : `${profile.fieldValue.length}/80`}</small></label>;
}

function SourceSelectPreview({ profile }: { profile: SourceProfile }) {
  return <label className={`source-specific-preview source-select-preview source-${profile.id}`} data-preview-source={profile.id}><span>{profile.selectLabel}</span><button type="button"><b>{profile.selectValue}</b><i>⌄</i></button>{profile.id === "shadcn" && <div><span>{profile.selectValue}</span><span>Vue</span><span>Svelte</span></div>}</label>;
}

function SourceTabsPreview({ profile }: { profile: SourceProfile }) {
  return <div className={`source-specific-preview source-tabs-preview source-${profile.id}`} data-preview-source={profile.id}>{profile.tabs.map((label, index) => <span className={index === 0 ? "active" : ""} key={label}>{label}{profile.id === "github-primer" && index > 0 && <i>{index * 4}</i>}</span>)}</div>;
}

function SourceDialogPreview({ profile }: { profile: SourceProfile }) {
  return <div className={`source-specific-preview source-dialog-stage source-${profile.id}`} data-preview-source={profile.id}><section><header><b>{profile.dialogTitle}</b><button type="button" aria-label="Close">×</button></header><p>Your changes will be applied to this workspace.</p><footer><button type="button" className="secondary">{profile.secondary}</button><button type="button">{profile.dialogAction}</button></footer></section></div>;
}

function SourceDatePickerPreview({ profile }: { profile: SourceProfile }) {
  return <div className={`source-specific-preview source-date-preview source-${profile.id}`} data-preview-source={profile.id}><span>{profile.dateLabel}</span><CalendarPreview range={profile.id === "shopify-polaris"} /></div>;
}

function SourceTablePreview({ profile, interactive = false }: { profile: SourceProfile; interactive?: boolean }) {
  return <div className={`source-specific-preview source-table-preview source-${profile.id}`} data-preview-source={profile.id}><table><thead><tr>{interactive && <th><input type="checkbox" aria-label="Select all rows" /></th>}<th>{profile.tabs[0]}</th><th>Status</th><th /></tr></thead><tbody><tr>{interactive && <td><input type="checkbox" aria-label="Select first row" /></td>}<td>{profile.fieldValue}</td><td><span>Active</span></td><td>•••</td></tr><tr>{interactive && <td><input type="checkbox" aria-label="Select second row" /></td>}<td>{profile.selectValue}</td><td><span>Draft</span></td><td>•••</td></tr></tbody></table></div>;
}

const previewAdapterRegistry: Readonly<Record<string, PreviewAdapter>> = {
  "button": () => <ActionButtons />,
  "icon-button": () => <ActionButtons iconOnly />,
  "button-group": () => <div className="preview-button-group"><button type="button">Left</button><button type="button" className="active">Center</button><button type="button">Right</button></div>,
  "split-button": () => <div className="preview-split-button"><button type="button">Create</button><button type="button" aria-label="More create options">⌄</button></div>,
  "floating-action-button": () => <button type="button" className="preview-fab"><span>＋</span> Create</button>,
  "link": () => <div className="preview-stack"><span className="preview-link">View documentation →</span><span className="preview-link subtle">Learn about Monet</span></div>,
  "text-input": () => <TextFieldPreview />,
  "textarea": () => <TextFieldPreview kind="textarea" />,
  "search-input": () => <TextFieldPreview kind="search" />,
  "password-input": () => <TextFieldPreview kind="password" />,
  "number-input": () => <TextFieldPreview kind="number" />,
  "otp-input": () => <TextFieldPreview kind="otp" />,
  "checkbox": () => <ChoicePreview kind="checkbox" />,
  "radio": () => <ChoicePreview kind="radio" />,
  "switch": () => <ChoicePreview kind="switch" />,
  "segmented-control": () => <ChoicePreview kind="segmented" />,
  "select": () => <ChoicePreview kind="select" />,
  "combobox": () => <ChoicePreview kind="combobox" />,
  "autocomplete": () => <ChoicePreview kind="autocomplete" />,
  "multi-select": () => <ChoicePreview kind="multi-select" />,
  "date-input": () => <DateTimePreview kind="date-input" />,
  "date-picker": () => <DateTimePreview kind="date-picker" />,
  "date-range-picker": () => <DateTimePreview kind="date-range-picker" />,
  "calendar": () => <DateTimePreview kind="calendar" />,
  "time-picker": () => <DateTimePreview kind="time-picker" />,
  "date-time-picker": () => <DateTimePreview kind="date-time-picker" />,
  "breadcrumb": () => <NavigationPreview kind="breadcrumb" />,
  "tabs": () => <NavigationPreview kind="tabs" />,
  "sidebar": () => <NavigationPreview kind="sidebar" />,
  "navigation-menu": () => <NavigationPreview kind="navigation-menu" />,
  "menubar": () => <NavigationPreview kind="menubar" />,
  "pagination": () => <NavigationPreview kind="pagination" />,
  "stepper": () => <NavigationPreview kind="stepper" />,
  "command-palette": () => <NavigationPreview kind="command-palette" />,
  "dialog": () => <OverlayPreview kind="dialog" />,
  "alert-dialog": () => <OverlayPreview kind="alert-dialog" />,
  "drawer": () => <OverlayPreview kind="drawer" />,
  "sheet": () => <OverlayPreview kind="sheet" />,
  "popover": () => <OverlayPreview kind="popover" />,
  "tooltip": () => <OverlayPreview kind="tooltip" />,
  "hover-card": () => <OverlayPreview kind="hover-card" />,
  "dropdown-menu": () => <OverlayPreview kind="dropdown-menu" />,
  "context-menu": () => <OverlayPreview kind="context-menu" />,
  "alert": () => <FeedbackPreview kind="alert" />,
  "toast": () => <FeedbackPreview kind="toast" />,
  "banner": () => <FeedbackPreview kind="banner" />,
  "progress": () => <FeedbackPreview kind="progress" />,
  "spinner": () => <FeedbackPreview kind="spinner" />,
  "skeleton": () => <FeedbackPreview kind="skeleton" />,
  "empty-state": () => <FeedbackPreview kind="empty-state" />,
  "status-indicator": () => <FeedbackPreview kind="status-indicator" />,
  "table": () => <DataDisplayPreview kind="table" />,
  "data-table": () => <DataDisplayPreview kind="data-table" />,
  "list": () => <DataDisplayPreview kind="list" />,
  "tree": () => <DataDisplayPreview kind="tree" />,
  "card": () => <DataDisplayPreview kind="card" />,
  "badge": () => <DataDisplayPreview kind="badge" />,
  "tag": () => <DataDisplayPreview kind="tag" />,
  "avatar": () => <DataDisplayPreview kind="avatar" />,
  "timeline": () => <DataDisplayPreview kind="timeline" />,
  "accordion": () => <DataDisplayPreview kind="accordion" />,
  "carousel": () => <DataDisplayPreview kind="carousel" />,
  "statistic": () => <DataDisplayPreview kind="statistic" />,
  "chart": () => <VisualizationPreview kind="chart" />,
  "sparkline": () => <VisualizationPreview kind="sparkline" />,
  "gauge": () => <VisualizationPreview kind="gauge" />,
  "progress-visualization": () => <VisualizationPreview kind="progress-visualization" />,
  "container": () => <LayoutPreview kind="container" />,
  "stack": () => <LayoutPreview kind="stack" />,
  "flex": () => <LayoutPreview kind="flex" />,
  "grid": () => <LayoutPreview kind="grid" />,
  "divider": () => <LayoutPreview kind="divider" />,
  "scroll-area": () => <LayoutPreview kind="scroll-area" />,
  "resizable-panels": () => <LayoutPreview kind="resizable-panels" />,
  "aspect-ratio": () => <LayoutPreview kind="aspect-ratio" />,
  "field": () => <UtilityPreview kind="field" />,
  "fieldset": () => <UtilityPreview kind="fieldset" />,
  "label": () => <UtilityPreview kind="label" />,
  "file-upload": () => <UtilityPreview kind="file-upload" />,
  "slider": () => <UtilityPreview kind="slider" />,
  "rating": () => <UtilityPreview kind="rating" />,
  "clipboard": () => <UtilityPreview kind="clipboard" />,
  "keyboard-shortcut": () => <UtilityPreview kind="keyboard-shortcut" />,
};

function createSourceAdapterRegistry(profile: SourceProfile): Readonly<Record<string, PreviewAdapter>> {
  const adapters: Record<string, PreviewAdapter> = {};
  for (const [componentId, BaseAdapter] of Object.entries(previewAdapterRegistry)) {
    adapters[componentId] = () => <SourceAdapterFrame profile={profile}><BaseAdapter /></SourceAdapterFrame>;
  }
  return {
    ...adapters,
    "button": () => <SourceButtonPreview profile={profile} />,
    "icon-button": () => <SourceIconButtonPreview profile={profile} />,
    "text-input": () => <SourceTextFieldPreview profile={profile} />,
    "textarea": () => <SourceTextFieldPreview profile={profile} multiline />,
    "select": () => <SourceSelectPreview profile={profile} />,
    "tabs": () => <SourceTabsPreview profile={profile} />,
    "dialog": () => <SourceDialogPreview profile={profile} />,
    "date-picker": () => <SourceDatePickerPreview profile={profile} />,
    "table": () => <SourceTablePreview profile={profile} />,
    "data-table": () => <SourceTablePreview profile={profile} interactive />,
  };
}

const sourcePreviewAdapterRegistry: Readonly<Record<string, Readonly<Record<string, PreviewAdapter>>>> = Object.fromEntries(sourceProfiles.map((profile) => [profile.id, createSourceAdapterRegistry(profile)]));

export function RegisteredPreview({ componentId, sourceId }: { componentId: string; sourceId?: string }) {
  const Adapter = (sourceId ? sourcePreviewAdapterRegistry[sourceId]?.[componentId] : undefined) ?? previewAdapterRegistry[componentId];
  return Adapter ? <Adapter /> : <div className="preview-missing"><span>◇</span><b>Preview not available</b><small>Add a trusted adapter for {componentId}.</small></div>;
}
