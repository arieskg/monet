# Monet Design System

This file is generated from the canonical Monet workspace files.

## Principles

### Prefer familiar patterns over novel interactions

Use the established convention for a task unless a different pattern measurably improves it. Novelty is a cost that must be repaid.

**Why it matters.** Users arrive already knowing how a select, a dialog, a table, and a back button behave. Every deviation spends attention on learning the interface instead of doing the work. Familiar patterns also come with settled keyboard behavior, assistive-technology semantics, and browser defaults that reimplementations usually lose.

**How to apply.**

- Reach for the canonical Monet component for the job before composing a custom control. If a concept already exists in the taxonomy, use it rather than building an equivalent.
- Keep the anatomy the source inspiration establishes: a select opens a list and commits on choice; a dialog traps focus and closes on Escape; a link navigates and a button acts.
- Preserve platform behavior that users depend on — text selection, browser back, middle-click, native scrolling, form autofill, and standard keyboard shortcuts.
- When a novel interaction genuinely wins, keep a conventional path to the same outcome available. Discoverable shortcuts are additive; replacing the ordinary path is not.
- Name things with the words users already use in the product. Consistent terminology is part of the pattern.

**Avoid.**

- Reimplementing native controls to gain styling control while losing keyboard, focus, and screen-reader behavior.
- Custom scrolling, drag, gesture, or hover-only interactions as the only route to an action.
- Inventing a component when an existing one with different preferences would do.
- Treating a source inspiration's visual novelty as a reason to adopt its interaction model wholesale.

### Remove elements that do not serve the experience

Every visible element must contribute to the task, understanding, navigation, hierarchy, or feedback. If it does none of those, delete it.

**Why it matters.** Interfaces accumulate. Each container, icon, divider, badge, and helper sentence competes for the same attention the actual task needs, and the cost is paid on every view, by every user, forever. Removing an element is almost always cheaper and more reliable than making the important elements louder.

**How to apply.**

- Before adding an element, name the job it does. "It looks empty otherwise" and "for consistency with a screenshot" are not jobs.
- Prefer removing a competing element over amplifying the important one. One primary action reads as primary because nothing else is trying to.
- Delete decorative dividers, nested cards, redundant icons beside self-explanatory labels, and helper text that restates the label.
- Show metadata only where a user acts on it. Timestamps, IDs, and counts belong in detail views or on demand, not on every row.
- Empty space is a legitimate result. Do not fill a region because it is available.

**Avoid.**

- Wrapping content in a card, panel, or border that adds no grouping information.
- Icons used as decoration next to text that already says the same thing.
- Placeholder illustrations, promotional copy, or tips inserted to occupy empty regions.
- Repeating global guidance — principles, foundations, patterns — inside individual screens.

### Keep primary actions obvious

Users should identify what they can do next without scanning the whole interface. Each region carries at most one primary action, and emphasis follows importance rather than convenience.

**Why it matters.** Action hierarchy is the fastest signal an interface gives about what it is for. When several controls share the same weight, users read all of them; when nothing is emphasized, they read everything twice. Getting this right also makes destructive and irreversible actions legible instead of accidental.

**How to apply.**

- One primary action per page, dialog, panel, or other logical region. Supporting actions step down to secondary or tertiary emphasis.
- Place the primary action where the task ends — after form fields, at the end of a dialog's action row, or in the page header when it applies to the whole page.
- Use the lowest emphasis variant that still reads as available. Emphasis comes from variant and semantic meaning, not from size, shadow, or an unrelated accent color.
- Label the outcome, not the mechanism: `Save changes`, `Create project`, `Delete member`. Generic labels force users to reconstruct context.
- Give destructive actions their own semantic treatment and separate them from the routine actions they sit beside.

**Avoid.**

- Two filled buttons side by side competing for the same decision.
- Emphasizing `Cancel`, `Back`, or other exits at the same weight as the action that advances the task.
- Hiding the action that completes the current task inside an overflow menu.
- Using destructive color to make an ordinary action more noticeable.

### Always show what the system is doing

Loading, saving, errors, selections, changes, and system state must have visible, honest feedback. If the system knows something that changes what a user should do next, the interface says so.

**Why it matters.** Uncertainty produces the worst user behavior: duplicate submissions, abandoned tasks, and mistrust of data that is actually correct. Feedback is also the cheapest form of error prevention — a visible pending state prevents the second click that creates the duplicate record.

**How to apply.**

- Acknowledge every action that is not instantaneous, close to the control that started it, and prevent repeat activation while a non-idempotent request is in flight.
- Keep loading, empty, error, and unavailable states distinct. They mean different things and lead to different next steps.
- Report the outcome the system actually observed. If a result is unknown, say it is unknown rather than guessing success or failure.
- Make current state visible without interaction: which row is selected, which filters are applied, which tab is active, whether content is stale.
- Never communicate state through color, motion, or position alone. Pair the visual signal with text or accessible semantics.

**Avoid.**

- Silent success, silent failure, or a spinner that outlives the request that started it.
- Fabricated progress percentages for work that cannot report progress.
- Optimistic UI that shows a result the system has not accepted, with no correction path.
- Important, actionable information delivered only through a message that disappears.

### Prefer hierarchy over decoration

Establish structure with typography, spacing, position, contrast, and scale before adding containers, borders, shadows, or fills.

**Why it matters.** Decoration is the expensive way to say what layout can say for free. Borders and shadows accumulate into visual noise, they multiply the surfaces a theme has to keep coherent, and they still do not tell a user which of two adjacent things matters more. Type scale and whitespace do, and they survive density changes, responsive reflow, and theming.

**How to apply.**

- Group related content with spacing first. Add a border only when spacing cannot express the boundary, and a surface or elevation only when the content genuinely sits on a separate plane.
- Use the type scale for rank. A heading one step up communicates more reliably than the same text in a colored box.
- Reserve elevation for things that float — menus, popovers, dialogs, drag surfaces. Static cards and page sections do not need shadows.
- Keep contrast meaningful: strong foreground for content that carries the message, muted foreground for supporting metadata. Do not introduce a third intermediate value per screen.
- Use one radius family within a region and avoid nesting two rounded surfaces with nearly equal radii.

**Avoid.**

- Cards inside cards, or a border and a shadow and a background doing the same separation job.
- Color used as the primary hierarchy tool where weight or size would work.
- Section dividers between groups that spacing has already separated.
- Adding a container to make a region "look designed" when its content needs no boundary.

### Keep interfaces compact without becoming cluttered

Show useful information efficiently while preserving hierarchy, readability, and enough spacing to distinguish related groups. Density is a tool, not a target.

**Why it matters.** Monet targets productivity software, where scrolling and paging cost more than a slightly tighter row. But density fails the moment groups stop being distinguishable — a compact list where everything is equidistant is slower to read than a roomier one with clear grouping. The goal is more signal per screen, not more pixels used.

**How to apply.**

- Default to the compact control size in toolbars, tables, filters, and dense working areas; use the standard size for forms, dialogs, and primary page actions.
- Spend space on the boundaries between groups and take it back from the space inside them. Uneven spacing is what makes grouping legible.
- Protect readable measure: long-form text, descriptions, and settings stay in a narrow content width even inside a wide page shell.
- Let data-heavy regions use the wide content width rather than compressing rows to fit a narrower one.
- Wrap or truncate predictably with a way to see full values. Truncation without recovery is data loss.

**Avoid.**

- Shrinking type below the interface minimum, or reducing line height, to fit another row.
- Using the compact control size merely to fit more, in contexts where the standard size is expected.
- Uniform spacing everywhere, which removes the grouping that density depends on.
- Dense layouts that lose their hit targets — visible size and interaction target are separate concerns.

### Start simple and reveal complexity gradually

Keep common workflows immediately accessible and introduce advanced controls only when they become relevant or the user asks for them.

**Why it matters.** Most users do the common thing most of the time. Exposing every capability at once slows them down and makes the product look harder than it is, while hiding capability behind discovery makes power users slower forever. Progressive disclosure resolves the tension: the default path stays short, and depth stays one predictable step away.

**How to apply.**

- Design the default path for the common case and make sure it can be completed without opening anything.
- Put advanced options behind a labeled, predictable disclosure — a section, an accordion, a settings surface, a menu — not behind hover or an unlabeled icon.
- Choose sensible defaults so most users never open the advanced surface. A default that must be changed is not a default.
- Keep disclosed state visible: if advanced options are set to something non-default, surface that fact where the user is working rather than only where they were configured.
- Split long processes into steps only when the steps are genuinely sequential. Otherwise show one form.

**Avoid.**

- Wizards for tasks that fit on one screen.
- Advanced settings that silently change common behavior with no indication at the point of use.
- Progressive disclosure used to hide required input.
- Two paths to the same setting that can disagree with each other.

### Make the whole product feel like one product

Reuse established terminology, components, interactions, spacing, and visual treatments so knowledge transfers across the interface.

**Why it matters.** Consistency is compounding: every screen that behaves like the last one makes the next one free to learn. It is also what makes a design system worth having — the value is not that each screen is good, it is that they are the same kind of good. Local optimizations that break the shared language usually cost more elsewhere than they gain where they were made.

**How to apply.**

- Resolve conflicts in Monet's authority order: Principles, then resolved Foundations, then explicit component preferences, then Patterns, then source inspiration.
- Use semantic tokens rather than raw values. A hard-coded hex or pixel value is a decision that cannot be themed or corrected system-wide.
- Reuse the same word for the same concept everywhere — in labels, headings, empty states, errors, and documentation.
- Keep repeated multi-component structures as patterns. If a layout appears on three screens, it is a pattern, not three layouts.
- Adapt a source inspiration to Monet, never the reverse. Sources inform anatomy, behavior, and character; they do not override foundations.

**Avoid.**

- Screen-specific spacing, widths, or radii that redefine the shared page geometry.
- Two components that do the same job with different names or different interaction models.
- Mixing several source systems' visual languages inside one surface.
- Introducing a new value when an existing token is close enough to serve.

## Foundations

- **Color** (selected) — Color system for application surfaces, text, borders, interactions, status, feedback, and expressive accents.
- **Typography** (selected) — A compact, modern typography system for product interfaces, data-heavy views, navigation, forms, and readable long-form content.
- **Spacing** (selected) — A compact, predictable spacing system for component internals, grouping, layout rhythm, and page-level separation.
- **Radius** (selected) — Corner rounding for controls, surfaces, pills, and nested composition.
- **Sizing** (selected) — Canonical control, icon, and target dimensions.
- **Borders** (selected) — A restrained border system for separating regions, drawing the boundary of an unfilled control, and marking keyboard focus, with every stroke color owned by the Color foundation.
- **Elevation** (selected) — A restrained elevation system for raised controls, floating surfaces, overlays, and dialogs.
- **Layout** (selected) — Responsive layout rules for the application shell, shared page geometry, readable content, dense working areas, navigation regions, gutters, and maximum content widths.
- **Interaction states** (selected) — The canonical state model for every interactive element: rest, hover, focus, pressed, selected, disabled, read-only, loading, and invalid.
- **Opacity** (selected) — A restrained transparency system for disabled elements, secondary visual content, and modal backdrops.
- **Motion** (selected) — A restrained motion system for state changes, feedback, overlays, and spatial transitions in product interfaces.
- **Breakpoints** (selected) — A small responsive breakpoint system for page-level layout adaptation, navigation changes, and workspace expansion.
- **Z-index / Layering** (selected) — A small semantic stacking system for normal content, sticky interface regions, temporary overlays, modal surfaces, and global feedback.

## Active theme

Default (default)

Theme files contain overrides only. Resolved values below are Base Monet plus the active theme.

## Tokens

### Color

- `neutral.white` = `#ffffff` — White used for primary surfaces and inverse foreground content.
- `neutral.100` = `#ecf0f1` — Light neutral used for application backgrounds and subtle surfaces.
- `neutral.300` = `#d8d7d0` — Neutral used for default borders and separators.
- `neutral.600` = `#5f605a` — Neutral used for secondary and muted foreground content.
- `neutral.900` = `#2c3e50` — Dark blue-gray neutral used for primary text and strong visual contrast.
- `purple.300` = `#dc95ff` — Bright expressive purple used for highlights and supporting visual emphasis.
- `purple.500` = `#9b59b6` — Amethyst primary identity and interaction color.
- `teal.300` = `#7ae2cf` — Soft teal used for subtle accents and supporting surfaces.
- `teal.500` = `#1abc9c` — Turquoise secondary accent and positive-state color.
- `blue.500` = `#3498db` — Identity blue retained for expressive accents, illustration, and data visualization; semantic link and info roles use the darker blue.600.
- `raspberry.500` = `#cf4173` — Raspberry expressive accent for selective non-semantic emphasis.
- `red.600` = `#d0311e` — Red reserved for errors and destructive actions.
- `amber.600` = `#b7791f` — Amber retained as a palette step; the semantic warning role uses the darker amber.700 so warning text and warning fills both meet contrast.
- `color.background` = `#ecf0f1` — Default application background.
- `color.surface` = `#ffffff` — Default content, panel, card, and elevated surface.
- `color.surface.subtle` = `#ecf0f1` — Subtle surface used to distinguish secondary regions without strong containers.
- `color.foreground` = `#2c3e50` — Default primary text and foreground content.
- `color.foreground.muted` = `#5f605a` — Secondary text, metadata, descriptions, and lower-emphasis content.
- `color.foreground.inverse` = `#ffffff` — Foreground content displayed on sufficiently dark backgrounds.
- `color.border` = `#d8d7d0` — Default subtle border and separator.
- `color.border.strong` = `#5f605a` — Higher-emphasis border used where stronger visual separation is necessary.
- `color.primary` = `#9b59b6` — Primary brand and interactive emphasis.
- `color.secondary` = `#1abc9c` — Secondary accent used when a contrasting supporting color is appropriate.
- `color.highlight` = `#dc95ff` — Expressive highlight color for selected visual emphasis and decorative accents.
- `color.accent` = `#cf4173` — Optional expressive accent that should not replace semantic status colors.
- `color.link` = `#26709f` — Default link and navigational text emphasis, verified at 4.5:1 against color.surface.
- `color.info` = `#26709f` — Informational messages, indicators, and feedback. Readable as text on color.surface and carries color.on.info when filled.
- `color.success` = `#1abc9c` — Successful, completed, and positive states. Use color.success.foreground for success text on light surfaces.
- `color.warning` = `#946118` — Warning and caution states that require attention but are not errors. Readable as text on color.surface and carries color.on.warning when filled.
- `color.danger` = `#d0311e` — Errors, destructive actions, and critical negative states.
- `color.focus` = `#9b59b6` — Visible keyboard-focus indicator.
- `neutral.50` = `#f6f8f8` — Near-white neutral used for quiet hover surfaces on white content.
- `neutral.200` = `#e4e6e4` — Neutral used for pressed and active surfaces and for stronger neutral fills.
- `neutral.400` = `#9d9e98` — Low-contrast neutral reserved for disabled foreground content.
- `purple.100` = `#f3ebf6` — Tinted amethyst surface for selected rows, active navigation, and subtle primary emphasis.
- `purple.600` = `#884ea0` — Amethyst one step darker, used for hover on primary fills.
- `purple.700` = `#79458e` — Amethyst two steps darker, used for pressed on primary fills.
- `teal.100` = `#e4f7f3` — Tinted teal surface for positive and success feedback regions.
- `teal.700` = `#0f715d` — Darkened teal that meets text contrast on light surfaces.
- `blue.100` = `#e7f3fb` — Tinted blue surface for informational feedback regions.
- `blue.600` = `#26709f` — Darkened blue that meets text contrast on light surfaces and carries white foreground when filled.
- `amber.100` = `#f6efe4` — Tinted amber surface for warning feedback regions.
- `amber.700` = `#946118` — Darkened amber that meets text contrast on light surfaces and carries white foreground when filled.
- `red.100` = `#f9e6e4` — Tinted red surface for error and destructive feedback regions.
- `red.700` = `#b72b1a` — Red one step darker, used for hover on destructive fills.
- `red.800` = `#a22617` — Red two steps darker, used for pressed on destructive fills.
- `color.surface.hover` = `#f6f8f8` — Surface under the pointer for rows, list items, menu items, cards, and quiet controls.
- `color.surface.pressed` = `#e4e6e4` — Surface while a control is held down or while a menu trigger stays open.
- `color.surface.selected` = `#f3ebf6` — Surface for the currently selected row, item, tab, or navigation entry, and for subtle primary emphasis.
- `color.surface.disabled` = `#ecf0f1` — Surface for disabled controls and non-interactive regions.
- `color.foreground.disabled` = `#9d9e98` — Foreground for disabled labels, values, and icons. Never the only signal that a control is unavailable.
- `color.primary.hover` = `#884ea0` — Primary fill under the pointer.
- `color.primary.pressed` = `#79458e` — Primary fill while held down.
- `color.danger.hover` = `#b72b1a` — Destructive fill under the pointer.
- `color.danger.pressed` = `#a22617` — Destructive fill while held down.
- `color.info.surface` = `#e7f3fb` — Tinted background for informational alerts, banners, and badges. Carries color.foreground.
- `color.success.surface` = `#e4f7f3` — Tinted background for success alerts, banners, and badges. Carries color.foreground.
- `color.success.foreground` = `#0f715d` — Success text and icons on color.surface, where color.success itself is too light to read.
- `color.warning.surface` = `#f6efe4` — Tinted background for warning alerts, banners, and badges. Carries color.foreground.
- `color.danger.surface` = `#f9e6e4` — Tinted background for error alerts, banners, and badges. Carries color.foreground.
- `color.on.primary` = `#ffffff` — Verified foreground on a color.primary fill.
- `color.on.secondary` = `#2c3e50` — Verified foreground on a color.secondary fill. Teal is light, so its foreground is dark rather than white.
- `color.on.accent` = `#ffffff` — Verified foreground on a color.accent fill.
- `color.on.highlight` = `#2c3e50` — Verified foreground on a color.highlight fill. The expressive purple is light and requires dark foreground.
- `color.on.info` = `#ffffff` — Verified foreground on a color.info fill.
- `color.on.success` = `#2c3e50` — Verified foreground on a color.success fill. Turquoise is light, so its foreground is dark rather than white.
- `color.on.warning` = `#ffffff` — Verified foreground on a color.warning fill.
- `color.on.danger` = `#ffffff` — Verified foreground on a color.danger fill.
- `color.border.subtle` = `#ecf0f1` — Quietest boundary, for separators inside a surface that should stay visually secondary.
- `color.primary.foreground` = `#884ea0` — Readable amethyst for text, icons, and selection indicators on light and tinted surfaces.

### Typography

- `font.family.sans` = `"Mona Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` — Primary interface font stack with Mona Sans as the preferred typeface and high-quality platform fallbacks.
- `font.family.mono` = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace` — Monospaced family for code, technical identifiers, keyboard input, logs, and fixed-width content.
- `font.size.xs` = `12px` — Supporting size for captions, metadata, timestamps, compact badges, helper text, and secondary labels.
- `font.size.sm` = `14px` — Primary compact interface size for controls, navigation, tables, labels, and information-dense UI.
- `font.size.md` = `16px` — Default readable body size for primary content, descriptions, forms, and prose.
- `font.size.lg` = `20px` — Compact heading size for sections, panels, and prominent interface regions.
- `font.size.xl` = `24px` — Prominent heading size for dialogs, major sections, and compact page headings.
- `font.size.2xl` = `32px` — Major page-title size and the normal upper limit for product-interface typography.
- `font.weight.regular` = `400` — Default weight for body copy, editable text, placeholders, helper text, and other readable content.
- `font.weight.medium` = `500` — Moderate emphasis for controls, labels, navigation, and important interface text.
- `font.weight.semibold` = `600` — Primary heading and strong-emphasis weight.
- `font.weight.bold` = `700` — Strongest standard weight, reserved for exceptional emphasis rather than routine hierarchy.
- `line.height.tight` = `1.2` — Tight line height for large headings and short display text.
- `line.height.heading` = `1.3` — Default line height for headings and titles.
- `line.height.compact` = `1.4` — Compact line height for controls, navigation, tables, labels, and dense interface text.
- `line.height.body` = `1.5` — Default line height for body text and general readable content.
- `line.height.relaxed` = `1.6` — Relaxed line height for longer prose when additional reading comfort is useful.
- `letter.spacing.tight` = `-0.02em` — Subtle negative tracking for larger headings where tighter spacing improves visual cohesion.
- `letter.spacing.normal` = `0em` — Default tracking for body text, controls, labels, and most interface typography.
- `letter.spacing.wide` = `0.02em` — Subtle positive tracking for very small labels or specialized interface treatments; use sparingly.
- `measure.readable` = `68ch` — Preferred maximum measure for long-form readable prose.
- `typography.caption.size` = `12px` — Semantic size for captions, metadata, timestamps, and supporting information.
- `typography.ui.size` = `14px` — Default semantic size for compact product-interface text, controls, navigation, and tables.
- `typography.body.size` = `16px` — Default semantic size for body content and readable prose.
- `typography.heading.small.size` = `20px` — Semantic size for section and panel headings.
- `typography.heading.medium.size` = `24px` — Semantic size for major sections, dialogs, and compact page headings.
- `typography.page.title.size` = `32px` — Semantic size for major page titles.
- `typography.body.weight` = `400` — Default body-text weight.
- `typography.ui.weight` = `500` — Default weight for controls, labels, and navigation.
- `typography.heading.weight` = `600` — Default heading and title weight.
- `typography.input.weight` = `400` — Default weight for user-entered values, text inputs, textareas, search fields, placeholders, and other editable text.
- `typography.label.weight` = `500` — Default weight for field labels and compact interface labels.
- `typography.navigation.section.family` = `"Mona Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` — Primary sans-serif family for navigation group labels and section headings. Do not use monospace typography for navigation categories.
- `typography.navigation.section.weight` = `500` — Medium emphasis for navigation group labels without competing with navigation items.

### Spacing

- `space.0` = `0px` — No spacing. Use only when elements intentionally touch or a default gap must be removed.
- `space.1` = `4px` — Tight spacing for closely related content, icon-to-label gaps, and compact internal relationships.
- `space.2` = `8px` — Small spacing for related controls, repeated elements, compact stacks, and common component internals.
- `space.3` = `12px` — Compact component padding and spacing where 8px is too tight and 16px is unnecessarily loose.
- `space.4` = `16px` — Default spacing unit between related component regions and a common padding value for product UI.
- `space.5` = `20px` — Intermediate spacing for larger controls, panels, and layouts that need slightly more separation than the default.
- `space.6` = `24px` — Comfortable spacing between grouped component regions, card sections, form groups, and larger component internals.
- `space.8` = `32px` — Section-level spacing that creates clear separation while maintaining a compact application layout.
- `space.10` = `40px` — Large spacing for prominent groups and layout transitions.
- `space.12` = `48px` — Large layout spacing between major content regions.
- `space.16` = `64px` — Major page-level separation used sparingly between distinct regions.
- `space.20` = `80px` — Largest standard spacing value for strong page-level separation and spacious layouts; use sparingly in dense product UI.
- `space.inline-gap` = `4px` — Default tight gap between directly related inline elements such as an icon and text.
- `space.control-gap` = `8px` — Default spacing between closely related controls and repeated interactive elements.
- `space.component-gap` = `16px` — Default gap between related component regions.
- `space.group-gap` = `24px` — Default separation between distinct groups of related content or controls.
- `space.section-gap` = `32px` — Default separation between sections within the same page or major container.
- `space.region-gap` = `48px` — Default separation between major page regions where a stronger visual break is required.

### Radius

- `radius.none` = `0px` — Square corners for surfaces that meet a viewport, container, or adjacent element edge.
- `radius.xs` = `2px` — Hairline rounding for progress tracks, scrollbar thumbs, and other small decorative details.
- `radius.sm` = `4px` — Small rounding for inline details such as swatches, code chips, thumbnails, and nested elements inside a rounded control.
- `radius.md` = `7px` — Standard rounding; controls reference it through radius.control, and inline regions such as an Alert use it directly.
- `radius.lg` = `12px` — Rounding for elevated and floating surfaces: cards, panels, popovers, menus, dialogs, drawers, and toasts.
- `radius.xl` = `16px` — Largest standard rounding, reserved for full-screen sheets and large feature surfaces.
- `radius.full` = `9999px` — Fully rounded ends for pills, avatars, circular icon buttons, and status dots.
- `radius.control` = `7px` — Default radius for interactive controls. Prefer this over radius.md in component code so control rounding stays themeable in one place.

### Sizing

- `size.control.sm` = `32px` — Compact control height for dense application UI such as toolbars, tables, and filters.
- `size.control.md` = `40px` — Default height for standard interactive controls.
- `size.target` = `44px` — Preferred minimum interaction target for isolated and touch-capable controls, independent of their visible size.
- `size.icon.sm` = `12px` — Compact supporting icon for chevrons, metadata, and other low-prominence details.
- `size.icon.md` = `16px` — Default interface icon for controls, navigation, and common actions.
- `size.icon.lg` = `20px` — Prominent interface icon for larger controls or situations requiring greater visual emphasis.

### Borders

- `border.subtle` = `1px solid #ecf0f1` — Quietest separator inside a surface, for divisions that should remain visually secondary.
- `border.default` = `1px solid #d8d7d0` — Structural one-pixel border for panels, cards, section edges, and container boundaries.
- `border.strong` = `1px solid #5f605a` — Resting boundary of an unfilled control, meeting the 3:1 non-text minimum that the structural border does not.
- `border.focus` = `2px solid #9b59b6` — High-visibility amethyst border for keyboard focus and interaction states that require an unmistakable boundary.

### Elevation

- `shadow.raised` = `0 1px 2px rgb(44 62 80 / 0.08), 0 2px 6px rgb(44 62 80 / 0.06)` — Subtle elevation for lightweight floating or raised elements that need gentle separation from the surrounding surface.
- `shadow.overlay` = `0 4px 12px rgb(44 62 80 / 0.10), 0 12px 28px rgb(44 62 80 / 0.12)` — Medium elevation for dropdowns, menus, popovers, tooltips, and temporary floating surfaces.
- `shadow.dialog` = `0 8px 24px rgb(44 62 80 / 0.14), 0 24px 64px rgb(44 62 80 / 0.18)` — Strongest standard elevation for dialogs, modals, and major temporary surfaces above the main application layer.

### Layout

- `layout.content-narrow` = `720px` — Maximum width for narrow inner content such as prose, forms, settings, and focused detail views. Apply inside the shared page shell and align to the shell's content origin rather than independently centering the region.
- `layout.content-default` = `1200px` — Default maximum inner content width for most product pages, lists, detail views, and mixed application workflows within the shared page shell.
- `layout.content-wide` = `1440px` — Wide maximum inner content width for dashboards, tables, comparison interfaces, timelines, and other information-dense layouts while preserving the shared page origin and gutter.
- `layout.sidebar` = `240px` — Default expanded width for persistent primary or secondary application navigation. The application shell owns this dimension rather than individual pages.
- `layout.gutter-mobile` = `16px` — Shared horizontal page-shell gutter for mobile and narrow viewports.
- `layout.gutter-desktop` = `24px` — Shared horizontal page-shell gutter for desktop application layouts. Primary pages should inherit this value rather than define page-specific horizontal padding.
- `layout.page-shell-max` = `1440px` — Maximum width of the shared outer page container that establishes a consistent horizontal origin for page headers and primary content across Monet.

### Interaction states

- `focus.ring.width` = `2px` — Stroke width of the keyboard focus ring, matched to border.focus so outline and border expressions of focus stay identical.
- `focus.ring.offset` = `2px` — Gap between an element's edge and its focus ring, keeping the ring clear of the element's own border and corner radius.

### Opacity

- `opacity.disabled` = `0.5` — Fallback opacity for disabled controls and visual elements when dedicated disabled semantic colors are unavailable or insufficient.
- `opacity.muted` = `0.72` — De-emphasis for decorative, supplementary, or nonessential visual content; avoid using it for required readable text.
- `opacity.scrim` = `0.4` — Default opacity for dark modal backdrops behind dialogs, drawers, and other blocking overlay surfaces.

### Motion

- `motion.fast` = `120ms` — Fast duration for hover, focus, opacity, color, pressed states, and other small immediate transitions.
- `motion.standard` = `180ms` — Default duration for menus, popovers, disclosure, selection changes, and most visible product-interface transitions.
- `motion.slow` = `280ms` — Upper standard duration for dialogs, drawers, expanding regions, and larger spatial transitions that benefit from clearer continuity.
- `ease.standard` = `cubic-bezier(0.2, 0, 0, 1)` — Default productive easing with a responsive start and smooth deceleration for most interface motion.

### Breakpoints

- `breakpoint.sm` = `480px` — Wide-phone and compact-layout threshold for modest increases in spacing, control arrangement, and available horizontal composition.
- `breakpoint.md` = `768px` — Primary tablet and responsive-layout threshold for single-column to multi-column changes, expanded navigation, and broader content composition.
- `breakpoint.lg` = `1024px` — Desktop workspace threshold for persistent navigation, wider grids, denser layouts, and more complex application composition.

### Z-index / Layering

- `z.base` = `0` — Normal document content and the default stacking level for application UI.
- `z.sticky` = `10` — Persistent headers, toolbars, sticky controls, and other interface regions that must remain above normal scrolling content.
- `z.overlay` = `100` — Temporary non-modal surfaces such as menus, dropdowns, popovers, tooltips, and similar floating UI.
- `z.dialog` = `200` — Modal dialogs, drawers, blocking overlays, and their associated scrims.
- `z.toast` = `300` — Transient global feedback that should remain visible above overlays and dialogs.

## Primitive decisions

### Box

- Status: selected
- Purpose: Provide the neutral base for tokenized layout without adding product semantics.
- Tokens: `space.1`, `space.2`, `space.4`
- Preferences: default_element=div, responsive_props=limited
- Notes: Prefer semantic HTML at call sites when the element carries meaning.
### Stack

- Status: selected
- Purpose: Arrange children vertically with a consistent spacing token.
- Tokens: `space.1`, `space.2`, `space.3`, `space.4`, `space.6`
- Preferences: direction=vertical, default_gap=token:space.4, alignment=stretch
- Notes: Use structural gap rather than margins on children.
### Inline

- Status: needs_review
- Purpose: Arrange peer content horizontally and allow deliberate wrapping.
- Tokens: `space.1`, `space.2`, `space.3`, `space.4`
- Preferences: default_gap=token:space.2, wrap=true
- Notes: None
### Container

- Status: needs_review
- Purpose: Keep content widths and gutters predictable across breakpoints.
- Tokens: `layout.content-narrow`, `layout.content-default`, `layout.content-wide`, `breakpoint.md`
- Preferences: default_width=token:layout.content-default
- Notes: None
### Spacer

- Status: do_not_use
- Purpose: Represent exceptional intentional space.
- Tokens: None documented
- Preferences: None documented
- Notes: Prefer Stack or Inline gap. A Spacer should be rare and justified.
### Separator

- Status: selected
- Purpose: Create a semantic boundary only when spacing or surface contrast is insufficient.
- Tokens: `border.subtle`, `color.border`
- Preferences: default_style=token:border.subtle
- Notes: None
### Text

- Status: selected
- Purpose: Render body, label, caption, and metadata roles consistently.
- Tokens: `font.family.sans`, `font.size.sm`, `font.size.md`, `color.foreground`, `color.foreground.muted`
- Preferences: default_role=body, inherit_color=true
- Notes: Visual role must not override semantic HTML.
### Heading

- Status: selected
- Purpose: Express document hierarchy while allowing visual size to vary independently.
- Tokens: `font.family.sans`, `font.size.lg`, `font.size.xl`, `color.foreground`
- Preferences: weight=semibold, balance=true
- Notes: Never choose heading levels for their default browser size.
### Code

- Status: needs_review
- Purpose: Distinguish technical identifiers and code with appropriate measure and contrast.
- Tokens: `font.family.mono`, `font.size.sm`
- Preferences: None documented
- Notes: None
### Pressable

- Status: selected
- Purpose: Normalize keyboard, pointer, pressed, disabled, and loading interaction behavior.
- Tokens: `size.target`, `motion.fast`, `ease.standard`
- Preferences: keyboard_activation=native, minimum_target=token:size.target
- Notes: Use a native button or link before adding press behavior to a generic element.
### Focus Ring

- Status: selected
- Purpose: Make keyboard focus unmistakable without changing layout.
- Tokens: `color.focus`, `border.focus`
- Preferences: trigger=focus-visible, offset=token:focus.ring.offset
- Notes: Never remove focus styling without an equivalent replacement.
### Icon

- Status: needs_review
- Purpose: Render symbols at predictable sizes with explicit decorative or labeled semantics.
- Tokens: `size.icon.sm`, `size.icon.md`, `size.icon.lg`
- Preferences: default_size=token:size.icon.md, stroke=consistent
- Notes: None
### Surface

- Status: selected
- Purpose: Apply semantic background, border, radius, and elevation as one intentional layer.
- Tokens: `color.surface`, `color.border`, `radius.lg`, `shadow.raised`
- Preferences: default_elevation=none
- Notes: Do not turn every content group into a raised card.
### Visually Hidden

- Status: selected
- Purpose: Keep essential labels or descriptions available to assistive technology.
- Tokens: None documented
- Preferences: focusable_variant=supported
- Notes: Hidden content must remain meaningful in its reading context.
### Accessible Label

- Status: selected
- Purpose: Provide a programmatic name when visible text does not already do so.
- Tokens: None documented
- Preferences: prefer_visible_text=true
- Notes: Do not duplicate visible labels with conflicting accessible names.
### Portal

- Status: experimental
- Purpose: Place layered UI outside clipping and stacking contexts.
- Tokens: `z.overlay`, `z.dialog`
- Preferences: default_root=application-overlay-root
- Notes: Preserve logical focus and ownership when DOM position changes.
### Slot

- Status: experimental
- Purpose: Compose behavior onto caller-owned elements without unnecessary wrappers.
- Tokens: None documented
- Preferences: api=as-child
- Notes: Keep polymorphism constrained so semantics remain legible.

## Component decisions

### Button

- Decision: Use
- Inspiration: Shopify Polaris Button
- Preferences: density=compact, radius=token:radius.control, label_weight=token:typography.ui.weight, icon_size=token:size.icon.md, primary_style=filled, secondary_style=subtle, tertiary_style=minimal, destructive_style=critical, label_case=sentence, content_alignment=center, action_hierarchy=one primary action per region, visual_emphasis=lowest emphasis that fits the action
- Notes: Use concise, action-oriented labels that describe the result of the action, such as "Save changes", "Create project", or "Delete item", rather than generic labels such as "OK" or "Submit" when a more specific label is available. Prefer one primary button within a logical region. Group related primary and secondary actions together with consistent spacing, but visually separate destructive actions when accidental activation would be costly. Use confirmation for destructive actions that are difficult or impossible to reverse. Show a loading state during asynchronous actions when repeated activation could duplicate work. Do not use color, size, or elevation alone to create hierarchy; variant and semantic meaning should determine emphasis. Buttons should remain compact, use the established typography, spacing, radius, color, border, and focus foundations, and avoid decorative shadows in normal states.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: loading_state=true, disabled_state=true, keyboard_activation=true, focus_visible=true, icon_support=true, destructive_state=true
- Advanced rationale: Use Shopify Polaris as the primary Button inspiration because its clear primary, secondary, tertiary, and critical action hierarchy fits Monet's restrained, task-focused design direction. Buttons should feel compact and polished without becoming visually dominant. Primary actions receive clear filled emphasis, supporting actions step down in prominence, and destructive actions remain semantically distinct. This supports the broader principles of keeping primary actions obvious, reducing unnecessary visual competition, using familiar patterns, and maintaining a consistent product-wide action language.
- Advanced use when: Submitting a form or saving changes; Starting a direct action that immediately changes application state; Confirming or advancing a workflow; Triggering an operation such as create, add, upload, run, retry, or refresh; Presenting the primary action for a page, dialog, panel, or logical region; Presenting supporting actions alongside a more important primary action; Presenting destructive actions when their critical meaning is clearly communicated
- Advanced avoid when: Inline navigation where a link is the familiar semantic control; A whole row, card, or other larger surface is already the interaction target; The action can be represented more clearly by a specialized control such as a checkbox, switch, select, or menu item; Adding another primary button would create competing primary actions within the same logical region; Using a button only as visual decoration or emphasis; An icon-only action would be clearer as an Icon Button component
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`
- Advanced primitives: `pressable`, `text`, `icon`, `focus-ring`
### Text Input

- Decision: Use
- Inspiration: Ant Design Input
- Preferences: density=compact, size=token:size.control.md, radius=token:radius.control, border=token:color.border.strong, background=token:color.surface, label_position=top, label_weight=token:typography.label.weight, input_weight=token:typography.input.weight, placeholder_style=token:color.foreground.muted, helper_text_position=below the control, error_position=below the control, prefix_suffix_style=inside the field, muted, not a separate control, validation=inline, visual_emphasis=restrained
- Notes: Use a persistent visible label above the field rather than relying on placeholder text as the label. User-entered values, placeholders, helper text, and validation text should use regular 400 weight through Monet's typography.input.weight or font.weight.regular. Field labels should use medium 500 through typography.label.weight or font.weight.medium. Do not apply the general typography.ui.weight token to entered input values. Placeholder text should provide an example or formatting hint only when useful and should disappear once input begins. Keep helper text and validation messages directly associated with the field below it. Use the established amethyst focus treatment so keyboard focus is unmistakable without making the idle field visually heavy. Preserve the compact density established by Monet's spacing and typography foundations. Prefixes and suffixes may provide context such as currency, units, or familiar actions, but should remain visually secondary to the entered value. Show validation close to the field and explain how to fix the problem rather than relying on color alone. Do not clear user-entered values after validation errors. Prefer specialized controls such as Select, Combobox, Date Picker, Number Input, Search Input, or Textarea when the data type or interaction requires them. The resting boundary is color.border.strong because an unfilled field's border is the only thing identifying it as a control; color.border is a structural edge and does not clear the 3:1 non-text minimum on its own.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: clearable=false, disabled_state=true, focus_visible=true, keyboard_input=true, validation_state=true, error_state=true, prefix_suffix_support=true, accessible_label_required=true
- Advanced rationale: Use Ant Design's Input as the primary inspiration because its compact proportions, restrained border treatment, clear interaction states, and support for prefixes, suffixes, and validation fit Monet's dense modern product-interface direction. Keep entered text at regular weight so fields remain readable and visually calm, while labels use medium weight to establish hierarchy without making the entire form feel bold.
- Advanced use when: Collecting a short freeform value; Entering names, titles, identifiers, codes, or other single-line text; Collecting values that benefit from a visible label, helper text, prefix, suffix, or inline validation; A user should type a value rather than choose from a known bounded set; A form requires a compact single-line field that fits consistently with surrounding controls
- Advanced avoid when: Choosing from a known bounded set; Entering multiple lines or substantial freeform content; Entering a value that has a more appropriate specialized control such as a date, number, search, password, or selection component; The field would rely on placeholder text as its only label; The value can be selected or derived without requiring manual text entry
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`
- Advanced primitives: `box`, `text`, `focus-ring`, `accessible-label`
### Select

- Decision: Use
- Inspiration: shadcn/ui Select
- Preferences: density=compact, size=token:size.control.md, radius=token:radius.control, border=token:color.border.strong, background=token:color.surface, labeling=persistent visible label, placeholder=neutral prompt, only when no safe default exists, default_value=only when safe and predictable for most users, option_labels=concise, distinct, understandable out of position, ordering=logical, frequency, or alphabetical, width=sized to the form context, not to the selected option, search_threshold=prefer Combobox once the set needs filtering
- Notes: Select represents value selection, not arbitrary actions or navigation; use a menu for action lists. Preserve a visible label even when a placeholder is present. Do not automatically select the first option when doing so could imply user intent. Disabled options should be uncommon and should not be used when removing an unavailable option would be clearer. If options require descriptions, rich content, asynchronous loading, filtering, custom values, or complex multi-selection, move to a more appropriate selection pattern rather than continuously expanding Select. Options that need descriptions, rich content, asynchronous loading, filtering, custom values, or multi-selection belong in a Combobox rather than a widened Select.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: disabled_state=true, single_selection_only=true, keyboard_navigation=true, typeahead_navigation=true, visible_focus_state=true, close_after_selection=true, preserve_trigger_width=true, allow_clear_when_optional=true, use_for_multiple_selection=false, use_search_for_large_lists=false
- Advanced rationale: Keep Select as the compact single-choice control for stable, predefined option sets. The strongest design-system pattern is to distinguish Select from adjacent controls by interaction cost: radios are better when a small set benefits from immediate comparison, while Combobox is better when users must search, filter, enter values, or navigate a large set. Select should therefore remain intentionally simple: one selected value, a compact trigger, predictable option ordering, strong keyboard and focus behavior, and no unnecessary search or multi-select functionality. This keeps the component efficient for forms and dense product interfaces without turning it into a general-purpose dropdown framework.
- Advanced use when: Choosing one value from a stable list.; The available choices are mutually exclusive.; Displaying every option simultaneously would consume unnecessary space.; The option set is familiar or short enough to scan without dedicated search.; A compact field is preferable in forms, settings, filters, or data-heavy interfaces.
- Advanced avoid when: Fewer than four options when comparison matters.; Users need to select multiple values.; Users need to search or filter a long option set; use a Combobox-style pattern instead.; Users may enter a value that is not already in the option set.; The choices represent actions rather than values; use a menu instead.; Options require substantial descriptions, previews, or other rich content to make a decision.; A binary choice can be expressed more directly with an appropriate checkbox, switch, or radio pattern.
- Advanced Foundation deviations: `spacing`, `radius`, `borders`
- Advanced primitives: `pressable`, `text`, `icon`, `focus-ring`, `portal`
### Tabs

- Decision: Use
- Inspiration: Ant Design Tabs
- Preferences: density=compact, indicator=underline in token:color.primary, count=fits one line at the default content width, labels=short nouns, sentence case, no punctuation, counts=allowed beside a label, kept visually secondary, overflow=scroll or a menu, never a second row, url=the active tab is reflected in the URL
- Notes: The active tab uses color.foreground with a color.primary indicator; inactive tabs use color.foreground.muted. Because the indicator is the primary signal, keep it visible in high-contrast conditions and never rely on color alone — the weight change between active and inactive labels is the second signal. Keep panels the same width and avoid layout shift when switching, and preserve each panel's scroll position and unsaved input across switches. Do not put an unsaved form in one tab and its save action in another. Follow the standard keyboard model: arrow keys move between tabs, Tab enters the panel.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_navigation=true, roving_tabindex=true, focus_visible=true, preserves_panel_state=true, lazy_loads_panels=true, used_for_page_routing=false, used_for_sequences=false
- Advanced rationale: Use Ant Design as the Tabs inspiration for its overflow-aware, compact tab bar. The underline indicator is preferred over contained or pill triggers because it separates the tab bar from the buttons around it and reads as navigation rather than action. The decision that matters is scope: tabs switch peer views of one subject, so they do not act as a general-purpose page nav and do not represent a sequence, which is a Stepper.
- Advanced use when: Switching between peer views of the same record or page; Separating overview, activity, and settings for one object; Filtering a collection by a small set of mutually exclusive states
- Advanced avoid when: Representing a task sequence, which is a Stepper; Routing between top-level product sections, which is primary navigation; The views need to be compared side by side; There are enough tabs that they cannot fit on one line at the default width; Only one tab exists
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `interaction`, `borders`
- Advanced primitives: `pressable`, `text`, `focus-ring`, `inline`
### Dialog

- Decision: Use
- Inspiration: React Aria Dialog
- Preferences: density=compact, width=focused, radius=token:radius.lg, elevation=token:shadow.dialog, actions=right-aligned, header=visible title naming the task, and the accessible name, action_order=safe action first, primary action last, scroll=the body scrolls, header and action row stay fixed, dismissal=Escape and close always, outside click only when safe
- Notes: Reserve modal interruption for focused tasks or consequential decisions. Use the dialog elevation over a scrim at the dialog layer; menus and popovers opened from inside render above and close with it. Send initial focus to the first meaningful control, or to the dialog itself when the first control is destructive. Keep width focused rather than filling the viewport, and keep the action row in the same position across dialogs so the primary action is always where users expect. Do not open a dialog from a dialog: replace the content or move the work to a page. On narrow viewports a dialog may become full-height, but it keeps its focus and dismissal contract.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: escape_closes=true, focus_trap=true, returns_focus_to_trigger=true, background_inert=true, scrim=true, nested_dialogs=false, outside_click_closes_when_safe=true
- Advanced rationale: Use React Aria as the Dialog inspiration because it settles the parts that are easy to get wrong — focus containment, initial and returned focus, inert background, and dismissal semantics — without imposing a visual language. The visual decision is restraint: a dialog is a temporary interruption, so it stays narrow, keeps one primary action, and does not accumulate its own navigation or nested surfaces. Anything that outgrows those constraints is a page.
- Advanced use when: A short focused task that should not lose the page behind it; A decision that must be resolved before the user continues; Confirming an action where surrounding context helps; Collecting a small amount of input related to the current page
- Advanced avoid when: Long or multi-step work, which belongs on a page; Content the user needs to compare against the page behind it, which is a Drawer; Content that should be linkable, refreshable, or reachable with browser back; Feedback the user does not need to act on, which is a Toast or an Alert; A destructive confirmation that must not be dismissed accidentally, which is an Alert Dialog
- Advanced Foundation deviations: `spacing`, `radius`, `elevation`, `layering`, `interaction`, `motion`
- Advanced primitives: `portal`, `surface`, `stack`, `heading`, `text`, `focus-ring`
### Date Picker

- Decision: Use
- Inspiration: GitHub Primer DatePicker
- Preferences: density=compact, radius=token:radius.lg, elevation=token:shadow.overlay, input=editable, first_day=locale, typing=the field is always typeable, the calendar is an aid, format=shown beside the field, several inputs accepted, constraints=unavailable dates disabled and explained in text, today=marked distinctly from the selected date
- Notes: The trigger follows Text Input for border, focus, sizing, label, helper, and error treatment. The calendar is an anchored overlay at the overlay layer with the overlay elevation, closing on Escape and returning focus to the field. Inside the grid, arrow keys move by day, page keys move by month, and the focused date is visibly distinct from both today and the selection — three states that must never collapse into one treatment. Respect the locale's first day of week and never rely on cell colour alone to indicate availability. When only a known date is needed, a plain Date Input is the better control.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_navigation=true, typeable_input=true, escape_closes=true, returns_focus_to_trigger=true, respects_locale_first_day=true, disabled_state=true, error_state=true, calendar_only_entry=false
- Advanced rationale: Use GitHub Primer as the Date Picker inspiration because its picker stays aligned to ordinary form-field anatomy rather than becoming a component with its own layout rules. The decision Monet enforces is that the calendar supplements typing instead of replacing it: for a known date, typing is faster than navigating a grid, and a calendar-only field is slow for everyone and hostile to keyboard and screen-reader users.
- Advanced use when: A date benefits from calendar context such as weekday, weekend, or proximity to today; Availability or blackout dates need to be visible while choosing; The user is choosing rather than recalling a specific date
- Advanced avoid when: Known dates such as a birth date are faster to type directly, which is a Date Input; A range is being selected, which is a Date Range Picker; A time is part of the value, which is a Date-Time Picker; The calendar would be the only way to enter a value
- Advanced Foundation deviations: `spacing`, `radius`, `elevation`, `interaction`, `layering`, `typography`
- Advanced primitives: `pressable`, `text`, `icon`, `grid`, `portal`, `focus-ring`
### Table

- Decision: Use
- Inspiration: Ant Design Table
- Preferences: density=compact, row_dividers=token:border.subtle, structure=horizontal dividers only, no vertical rules or zebra, alignment=text left, numbers right with tabular figures, row_height=uniform; overflow truncates or moves to a detail view, header=always present, distinct, sticky while the table scrolls
- Notes: Keep basic display tables distinct from interactive data tables. Alignment does the structural work, so borders stay minimal: horizontal dividers in color.border, no vertical rules, no alternating row fills. Right-aligned numbers with consistent decimal places are what makes columns comparable; centered numbers are not. On narrow viewports the table scrolls horizontally inside its own container rather than reflowing into stacked labels, because reflowing destroys the comparison the table exists for. Use real table markup with header cells associated to their columns.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: responsive_scroll=true, semantic_table_markup=true, sortable=false, selectable=false, paginated=false
- Advanced rationale: Use Ant Design as the Table inspiration for its dense, restrained presentation. Monet keeps a plain Table distinct from a Data Table on purpose: a display table has no obligation to preserve sort, selection, or position, and pretending otherwise is how simple tables acquire half-working interaction. If sorting, selection, row actions, or paging are needed, the component is a Data Table.
- Advanced use when: Comparing aligned structured values across a small fixed set of rows; A specification, summary, or breakdown embedded in a page; Data that does not need sorting, selection, or paging
- Advanced avoid when: Sorting, selection, row actions, or paging are needed, which is a Data Table; Items are primarily narrative, which is a List; There is only one record, which is a description list or a detail view; The layout is being built with a table rather than a grid
- Advanced Foundation deviations: `typography`, `spacing`, `borders`, `color`
- Advanced primitives: `box`, `grid`, `text`, `separator`
### Icon Button

- Decision: Use
- Inspiration: Ant Design Button (icon-only)
- Preferences: density=compact, shape=square or circular by context, radius=token:radius.control, icon_size=token:size.icon.md, hover_style=token:color.surface.hover, active_style=token:color.surface.pressed, destructive_style=critical only when the action is destructive, tooltip_policy=required for every non-obvious icon, target=token:size.target regardless of the visible hit area, visual_emphasis=subtle by default
- Notes: Use icon buttons for common, recognizable actions such as close, edit, delete, more options, refresh, copy, or navigation controls. Keep the default treatment visually subtle so icon buttons do not compete with primary text buttons. Maintain a comfortable interactive target even when the icon itself is small. Use one consistent icon style and size within the same toolbar or action group. Tooltips should use short action labels such as "Copy", "Close", or "More options" rather than explanatory sentences. Do not rely on the tooltip as the accessible name; provide an accessible label directly. If an action is important enough to require explanation or strong emphasis, prefer a standard Button with visible text.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: tooltip=true, keyboard_activation=true, focus_visible=true, disabled_state=true, loading_state=false, accessible_label_required=true
- Advanced rationale: Use Ant Design's icon-only Button as the primary inspiration because it provides a compact, familiar action treatment that fits Monet's dense and restrained interface direction. Icon buttons should minimize visual weight while remaining clearly interactive, accessible, and predictable. The icon communicates the action visually, while the accessible label and tooltip preserve clarity for users who may not recognize the symbol immediately.
- Advanced use when: A familiar icon communicates a compact secondary or utility action; Toolbar actions where visible text would create unnecessary visual density; Repeated actions such as edit, delete, copy, refresh, close, or more options; Navigation controls such as previous, next, expand, collapse, or dismiss; A compact action must sit beside related content without competing with the primary action
- Advanced avoid when: The icon meaning is ambiguous or unfamiliar to the expected user; The action is the primary action for a page, dialog, or workflow; The action requires explanatory text to be understood confidently; Several similar icon buttons would be difficult to distinguish without labels; A standard text Button would provide clearer hierarchy; The entire surrounding row, card, or region already acts as the interaction target
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`
- Advanced primitives: `pressable`, `icon`, `focus-ring`
### Textarea

- Decision: Use
- Inspiration: GitHub Primer Textarea
- Preferences: density=compact, radius=token:radius.control, border=token:color.border.strong, background=token:color.surface, label_position=top, placeholder_style=token:color.foreground.muted, helper_text_position=below the control, error_position=below the control, validation=inline, resize=vertical, minimum_height=three to four text lines, visual_emphasis=restrained
- Notes: Keep Textarea visually consistent with Text Input through the same typography, border, radius, focus, label, helper-text, and validation conventions. Use a persistent visible label above the field and use placeholder text only for examples or formatting hints. Default to a compact minimum height of roughly three to four lines and allow vertical resizing when additional space may help the user. Do not allow unrestricted horizontal resizing because it can break layout composition. Keep helper text and validation messages directly below the field. Preserve user-entered content after validation errors. If a character or length limit exists, show the limit or remaining count near the field when it becomes relevant. Prefer Text Input for short single-line values and specialized editors when users need formatting, code editing, mentions, or rich-text capabilities.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: disabled_state=true, focus_visible=true, keyboard_input=true, validation_state=true, error_state=true, resize_vertical=true, accessible_label_required=true
- Advanced rationale: Use GitHub Primer's Textarea as the primary inspiration because its restrained styling, compact proportions, explicit labeling, and clear focus treatment fit Monet's dense product-interface direction. The textarea should behave like a natural extension of the Text Input component while providing enough vertical space for longer freeform content without becoming visually dominant.
- Advanced use when: Collecting multi-line freeform text; Entering descriptions, comments, notes, explanations, feedback, or longer messages; The expected response may reasonably span several sentences or paragraphs; Users may benefit from expanding the field vertically while writing; A form requires longer text while maintaining the same visual language as other inputs
- Advanced avoid when: Collecting a short value that normally fits on one line; Choosing from a known bounded set; The content requires rich-text formatting, structured editing, code editing, or another specialized editor; The expected answer is so long that a dedicated writing or editing surface would provide a better experience; A textarea is being used only to make a single-line input appear larger
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`
- Advanced primitives: `box`, `text`, `focus-ring`, `accessible-label`
### Checkbox

- Decision: Use
- Inspiration: shadcn/ui Checkbox
- Preferences: density=compact, radius=token:radius.sm, size=token:size.icon.md, border=token:color.border.strong, alignment=box aligned to the first line of its label, label_position=right of the box, inside the click target, indeterminate=parent summary only, never a third user-selectable value, group_layout=vertical in a Fieldset, a row only for two or three, error_display=once below the group, never per option
- Notes: Checked uses color.primary as the box fill with color.on.primary for the mark. Unchecked uses color.surface with color.border.strong so the box is identifiable as interactive on its own. Hover moves the surrounding row to color.surface.hover rather than changing the box. Focus draws the ring outside the box, not inside it, so the mark stays legible. Disabled uses color.surface.disabled and color.foreground.disabled on the label. Keep the box aligned to the cap height of the first label line so multi-line labels do not center the box vertically. Give the box and its label one shared hit area of at least size.target even though the box itself is smaller.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_activation=true, focus_visible=true, indeterminate_state=true, disabled_state=true, label_is_click_target=true, applies_immediately=false, supports_multiple_selection=true
- Advanced rationale: Use shadcn/ui as the Checkbox inspiration because its unstyled, accessible primitive keeps native semantics and keyboard behavior while leaving the visual treatment entirely to Monet. Checkbox is the deferred-commit control: it expresses a value that will be saved with the rest of the form, which is what separates it from Switch. Keeping that distinction strict is the point of this record, because the two controls look interchangeable and behave differently.
- Advanced use when: Turning an independent option on or off inside a form that is saved explicitly; Selecting several items from a set of independent options; Selecting rows in a table or list; Accepting terms or acknowledging a statement before submitting; Summarizing a partially selected group with an indeterminate parent
- Advanced avoid when: The change takes effect immediately, which is a Switch; Options are mutually exclusive, which is a Radio group; There are many options and the user needs filtering, which is a Multi-select; The control is really a filter chip or a toggle button; A third state is being used to mean something other than a partially selected group
- Advanced Foundation deviations: `color`, `spacing`, `radius`, `borders`, `interaction`, `sizing`
- Advanced primitives: `pressable`, `box`, `icon`, `text`, `focus-ring`, `accessible-label`
### Radio

- Decision: Use
- Inspiration: Ant Design Radio.Group
- Preferences: density=compact, radius=token:radius.full, size=token:size.icon.md, border=token:color.border.strong, alignment=circle aligned to the first line of its label, option_count=two to six; prefer Select or Combobox above that, layout=vertical in a Fieldset, a row only for two or three, default_value=preselect only when safe for most users, descriptions=under the option label, inside the click target
- Notes: Selected uses color.primary for the ring and dot; unselected uses color.border.strong so the circle is identifiable without a fill. Hover and focus behave as they do for Checkbox: the row surface changes, and the focus ring is drawn outside the circle. A radio group takes one tab stop, and arrow keys move the selection within it. Once a value is selected it cannot be cleared by clicking it again; if clearing must be possible, include an explicit option such as None or use a Select that allows clearing. Keep option labels parallel in structure so they can be compared, and never rely on option order alone to convey meaning.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_navigation=true, focus_visible=true, single_selection_only=true, disabled_state=true, label_is_click_target=true, roving_tabindex=true, allow_deselect=false
- Advanced rationale: Use Ant Design as the Radio inspiration because its grouped radio anatomy, including described options and button-style groups, matches the productivity contexts Monet targets. Radio earns its space by making the alternatives visible; if the options do not need to be compared, a Select is more compact and equally clear. A radio group is one control, not several, which is why it moves with arrow keys and carries a single group label and a single validation message.
- Advanced use when: Choosing one option from a small set where seeing the alternatives matters; Options need per-option descriptions to be understood; The choice changes what the rest of a form asks for; A comparison between options is part of the decision
- Advanced avoid when: More than one value can be chosen, which is a Checkbox group; The option set is long or benefits from filtering; The choice switches between views rather than setting a value, which is Tabs or a Segmented Control; Only one option exists; The user must be able to clear the selection and no explicit empty option is offered
- Advanced Foundation deviations: `color`, `spacing`, `borders`, `interaction`, `sizing`
- Advanced primitives: `pressable`, `box`, `text`, `focus-ring`, `accessible-label`
### Switch

- Decision: Use
- Inspiration: shadcn/ui Switch
- Preferences: density=compact, radius=token:radius.full, off_track=unfilled, bounded by token:color.border.strong, on_track=filled token:color.primary, knob=token:color.border.strong off, token:color.on.primary on, label_position=left in a settings row, right when inline in a form, labeling=names the state enabled, not the act of toggling, state_text=none; the track and knob position carry the state, confirmation=immediate change confirmed near the switch, pending_state=shown on the switch without changing its size
- Notes: On uses color.primary for the track with color.on.primary for the knob; off uses color.border.strong so the track is visible against color.surface. Hover applies to the row, not the track. Because the state is carried by knob position and track fill, never let color be the only difference between on and off — the position change must be visually obvious. When an immediate write fails, the switch returns to the stored value and the failure is explained beside it; a switch left in its new position after a failed write misreports system state. Track and knob are smaller than size.target, so the row provides the hit area. The off track is unfilled and carries the same color.border.strong boundary as any other unfilled control, so the switch follows Monet's one border decision rather than being an exception to it. The on track is a color.primary fill, which is what makes the two states distinguishable without relying on knob position alone.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: applies_immediately=true, keyboard_activation=true, focus_visible=true, disabled_state=true, label_is_click_target=true, reverts_on_failure=true, requires_form_submit=false
- Advanced rationale: Use shadcn/ui as the Switch inspiration for the same reason as Checkbox: an accessible primitive with no imposed styling. The decision that matters is behavioral rather than visual. A switch signals that the change is live, so a switch inside a form that is committed with a Save button is a lie about what just happened. Monet resolves this strictly: immediate effect means Switch, deferred effect means Checkbox, and no page mixes the two models inside one section.
- Advanced use when: Enabling or disabling a setting that applies as soon as it changes; A settings row where the current configuration should be readable at a glance; Turning a live feature, integration, or notification on or off
- Advanced avoid when: The value is committed later with a Save action, which is a Checkbox; The choice is between two named alternatives rather than on and off, which is a Segmented Control; The control filters or selects rather than configures; Accepting terms or acknowledging a statement
- Advanced Foundation deviations: `color`, `spacing`, `radius`, `interaction`, `motion`, `sizing`
- Advanced primitives: `pressable`, `box`, `text`, `focus-ring`, `accessible-label`
### Combobox

- Decision: Use
- Inspiration: shadcn/ui Combobox
- Preferences: density=compact, radius=token:radius.control, border=token:color.border.strong, background=token:color.surface, popup_elevation=token:shadow.overlay, labeling=persistent visible label, selection_model=one existing option by default, filtering=forgiving prefix and substring matching while typing, autocomplete=suggestions never overwrite typed input, option_ordering=meaningful before input, ranked predictably after, empty_state=explicit no-results state, custom_values=not allowed unless the product requires them, large_datasets=asynchronous or virtualized option retrieval
- Notes: Combobox combines text input and option selection, so both input semantics and listbox interaction must remain clear. Typing filters or searches; it should not silently commit a value. Keep visual distinction between the current text, the actively highlighted suggestion, and the committed selection. Use Select when users can efficiently scan a compact list without searching. If arbitrary text is the primary input and suggestions are only optional assistance, use an autocomplete-oriented text-field pattern instead. If multiple selections are required, use a dedicated multi-select composition rather than overloading the default Combobox.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: filter_options_while_typing=true, keyboard_navigation=true, typeahead_input=true, visible_focus_state=true, highlight_active_option=true, close_after_selection=true, restore_selected_label=true, show_no_results_state=true, allow_custom_values_by_default=false, multiple_selection_by_default=false, open_on_focus_by_default=false, support_async_options=true
- Advanced rationale: Keep Combobox as the searchable counterpart to Select rather than treating the two as interchangeable dropdowns. Combobox is appropriate when the option set is large enough that scanning becomes inefficient, when users already know part of the value they want, or when options may be loaded dynamically. The pattern should preserve a real text-input experience while providing an accessible list of matching options, explicit selection, predictable keyboard navigation, and clear empty states. Monet should keep the default model constrained to existing single-select values so the component remains understandable and does not accumulate unrelated tag-input, free-form entry, and multi-select behaviors.
- Advanced use when: Users need to choose one value from a large predefined list.; Users can identify the desired option more efficiently by typing part of its name.; A searchable alternative to Select materially reduces scanning effort.; Options are loaded dynamically or retrieved from a large dataset.; Autocomplete suggestions help users enter a valid existing value.; Space constraints make displaying all available choices impractical.
- Advanced avoid when: The option set is short and easy to scan; use Select or radios instead.; Users primarily need unrestricted text entry rather than choosing from known values.; Multiple values must be selected unless a dedicated multi-select pattern is intentionally being used.; Options represent actions or navigation rather than selectable values.; Search adds interaction cost without meaningfully helping users find an option.; The choices require extensive descriptions, previews, or comparison that cannot be understood in a compact option list.
### Dropdown Menu

- Decision: Use
- Inspiration: Ant Design Dropdown
- Preferences: density=compact, radius=token:radius.lg, elevation=token:shadow.overlay, content=commands and command-like options, never forms, grouping=a divider only between groups that mean different things, destructive_items=their own trailing group, item_anatomy=optional leading icon, label, optional trailing shortcut, length=short enough to scan; filtering means Combobox or Palette, submenus=at most one level
- Notes: Use the overlay elevation at the overlay layer, anchored to the trigger, flipping to stay in the viewport and never covering the trigger. The trigger keeps its pressed treatment while the menu is open. Item hover and keyboard highlight use the same treatment so pointer and keyboard users see one active item, and the pointer does not steal the highlight from keyboard navigation without movement. Destructive items use color.danger for their label and sit apart from routine items. Disabled items say why nearby or are omitted. A menu is not navigation: destinations that belong in navigation should be discoverable without opening a menu.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_navigation=true, typeahead_navigation=true, escape_closes=true, outside_click_closes=true, returns_focus_to_trigger=true, closes_after_selection=true, trigger_shows_open_state=true, focus_trap=false
- Advanced rationale: Use Ant Design as the Dropdown Menu inspiration for its compact item anatomy and grouping. The decision that matters is scope: a menu holds actions, and the moment inputs, checkboxes, or paragraphs appear inside one, it has become a Popover with the wrong keyboard model. Keeping that boundary strict is what lets the menu keep arrow-key navigation, typeahead, and close-on-select without special cases.
- Advanced use when: Overflow actions for a row, card, or toolbar; A set of commands too numerous or infrequent to show directly; Actions scoped to a specific object, opened from that object; Choosing an option that immediately performs something
- Advanced avoid when: The content includes inputs or a form, which is a Popover; A value is being selected for later submission, which is a Select; The list is long enough to need filtering, which is a Combobox or Command Palette; The items are primary navigation destinations; The trigger is a right-click target, which is a Context Menu
- Advanced Foundation deviations: `spacing`, `radius`, `elevation`, `layering`, `interaction`, `color`
- Advanced primitives: `portal`, `surface`, `stack`, `text`, `icon`, `pressable`, `focus-ring`, `separator`
### Drawer

- Decision: Use
- Inspiration: Ant Design Drawer
- Preferences: edge=one consistent edge per purpose across the product, width=constrained and consistent, never near the full viewport, modality=non-modal by default, structure=own header, scrolling body, fixed action row when editing, dismissal=Escape and close always, outside click only when safe, url=an open record drawer is reflected in the URL
- Notes: Follow the Overlays pattern for stacking, dismissal, and focus. A non-modal drawer uses the overlay elevation with no scrim; a modal one uses the dialog layer with a scrim and traps focus. The drawer body scrolls independently of the page. Do not open a drawer from a drawer — replace its content instead. On narrow viewports a drawer may become full-width, but it keeps its close control and its dismissal contract. If the content deserves its own address and browser back, it is a page.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: escape_closes=true, returns_focus_to_trigger=true, scrolls_independently=true, focus_trap=false, modal_variant_traps_focus=true, nested_drawers=false
- Advanced rationale: Use Ant Design as the Drawer inspiration for its edge-anchored panel anatomy. Drawer sits between Popover and Dialog: it holds more than a popover but, unlike a dialog, keeps the page context visible, which is exactly what makes it right for inspecting or editing one record while a list stays on screen. Defaulting to non-modal is the decision that preserves that advantage.
- Advanced use when: Inspecting or editing a record while its collection stays visible; Secondary controls, filters, or details that outgrow a popover; Temporary navigation on narrow viewports
- Advanced avoid when: The task must be completed before anything else, which is a Dialog; The content is small and anchored to a control, which is a Popover; The content deserves its own URL and history entry, which is a page; Another drawer is already open
- Advanced Foundation deviations: `layout`, `spacing`, `elevation`, `layering`, `interaction`, `motion`
- Advanced primitives: `portal`, `surface`, `stack`, `heading`, `text`, `focus-ring`
### Tooltip

- Decision: Use
- Inspiration: Ant Design Tooltip
- Preferences: density=compact, radius=token:radius.sm, elevation=token:shadow.overlay, content=one short phrase, no links, buttons, or essential information, icon_only_controls=the tooltip text is also the accessible name, timing=delayed on hover, immediate on focus, hidden on leave, placement=above or beside the trigger, never covering it
- Notes: Use the overlay elevation at the overlay layer. Keep it short enough to read in a glance; anything needing a sentence or interaction is a Popover or a Hover Card. Never place a link, a button, or a dismissible control inside a tooltip — there is no way for a pointer to reach it reliably and no way for a keyboard to reach it at all. On touch, the information must be available another way, since there is no hover. Do not attach tooltips to disabled controls that cannot receive focus; put the explanation in adjacent text instead.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: shows_on_focus=true, shows_on_hover=true, escape_dismisses=true, interactive_content=false, receives_focus=false, touch_equivalent_required=true
- Advanced rationale: Use Ant Design as the Tooltip inspiration for its restrained compact label. The governing decision is that a tooltip is enrichment and never the only carrier of information, because it is unavailable on touch, invisible in print, and easy to miss. Its most important job in Monet is naming icon-only controls, where the tooltip text and the accessible name must be the same string so that what a sighted user reads and what a screen reader announces do not diverge.
- Advanced use when: Naming an icon-only button or control; Clarifying an abbreviated or truncated value; Adding a brief note about what a control will do
- Advanced avoid when: The content is interactive, which is a Popover; The content is an entity preview, which is a Hover Card; The information is required to complete the task; The trigger is disabled and unfocusable; A visible label would fit and be clearer
- Advanced Foundation deviations: `typography`, `spacing`, `radius`, `elevation`, `layering`, `motion`
- Advanced primitives: `portal`, `surface`, `text`
### Card

- Decision: Use
- Inspiration: Ant Design Card
- Preferences: density=compact, radius=token:radius.lg, surface=token:color.surface, border=token:color.border, elevation=none, padding=one consistent internal padding across a card grid, media=full-bleed media and tables inherit the card's radius, actions=at most one primary, in the header or at the bottom, nesting=never inside another card
- Notes: Use color.surface with a color.border edge against color.background; do not add a shadow at rest, since elevation means floating. If a whole card navigates, it is one link with one focus ring and its interior controls stay small, explicit, and non-overlapping — nested interactive elements inside a clickable card are a keyboard and screen-reader trap. Hover on a clickable card moves the surface to color.surface.hover rather than lifting or scaling it. In a grid, keep card heights uniform and let internal content scroll or truncate rather than making one card taller than its row.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: clickable_surface=true, focus_visible=true, uniform_height_in_grid=true, supports_media=true, elevates_on_hover=false, nested_cards=false
- Advanced rationale: Use Ant Design as the Card inspiration for its clear header, body, and action anatomy. The decision worth recording is restraint: Monet's hierarchy principle puts spacing and typography ahead of containers, so a card must earn its boundary by grouping content about one entity. Cards used as a default wrapper produce the nested, over-bordered layouts the principle exists to prevent, which is why this record rules out nesting and resting elevation explicitly.
- Advanced use when: Grouping content that describes one entity, repeated across a collection; A summary that leads to a detail view; Separating a region that genuinely sits on its own surface; A dashboard tile whose content needs its own boundary
- Advanced avoid when: Spacing and a heading would express the grouping; The content is a list of like items, which is a List or a Table; It would nest inside another card; Every section of a page is being wrapped for visual consistency; The card is a container for one number, which is a Statistic
- Advanced Foundation deviations: `color`, `spacing`, `radius`, `borders`, `interaction`, `layout`
- Advanced primitives: `surface`, `stack`, `heading`, `text`, `focus-ring`
### Badge

- Decision: Use
- Inspiration: Ant Design Badge
- Preferences: density=compact, radius=token:radius.full, variants=quiet neutral default plus the tinted status surfaces, content=one or two words, or a number, case=sentence, interaction=none; a removable or selectable chip is a Tag, count_overflow=capped rather than widening the badge
- Notes: Use the .surface variants of info, success, warning, and danger with ordinary color.foreground text; these are verified to carry normal foreground. Do not switch the text to the status color on top of a tinted surface. The status word itself must carry the meaning — a red dot with no label is not a status. Keep badge height aligned to the surrounding line so rows do not grow, and keep the set of statuses small and consistent across the product so users learn them once.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: interactive=false, removable=false, conveys_meaning_with_text=true, color_only_meaning=false
- Advanced rationale: Use Ant Design as the Badge inspiration for its compact status and count anatomy. The decision that separates Badge from Tag in Monet is interactivity: Badge reports state and does nothing when clicked, Tag participates in filtering and selection. Keeping them apart prevents the common outcome where some badges are clickable and users cannot tell which. Tinted status surfaces are preferred over solid fills so a row of badges does not out-shout the content it annotates.
- Advanced use when: Showing the state of a record in a list, table, or header; Showing a count attached to a navigation item or tab; Labeling a category or type that the user does not act on
- Advanced avoid when: The badge is clickable, removable, or filters a collection, which is a Tag; The status needs a sentence to be understood, which is an Alert; Color would be the only carrier of the meaning; So many badges appear that they compete with the content
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`
- Advanced primitives: `inline`, `text`
### Pagination

- Decision: Use
- Inspiration: Ant Design Pagination
- Preferences: density=compact, placement=below the collection, aligned to its left edge, controls=previous, next, a numbered window, optional page size, summary=current range and total when the total is cheap to compute, url=page number and page size live in the URL, unknown_total=previous and next only, with no invented page count
- Notes: The current page uses color.surface.selected with stronger foreground weight; unavailable directions are disabled rather than hidden, so the control's shape does not change at the ends of the range. Changing a filter or a search resets to the first page, and this must be visible rather than silent; changing sort does not. Preserve the page and page size when the user opens a record and returns. Announce page changes for assistive technology without announcing on every keystroke of an adjacent search field. Page links are real links.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: real_links=true, keyboard_navigable=true, focus_visible=true, preserves_sort_and_filters=true, resets_page_on_filter_change=true, scrolls_to_top_of_collection=true, disables_unavailable_directions=true
- Advanced rationale: Use Ant Design as the Pagination inspiration for its compact numbered anatomy with an integrated page-size control. Monet prefers pagination over infinite scroll for tables and dense collections because it gives users a position they can return to, a total they can reason about, and a URL they can share — all of which infinite scroll trades away for a smoother first screen.
- Advanced use when: A table or dense collection where users need a stable, returnable position; The total count is meaningful to the user; Results should be linkable and restorable
- Advanced avoid when: The collection is short enough to show at once; The feed is continuous and position does not matter; It would page a result set that is sorted or filtered only within the current page
- Advanced Foundation deviations: `spacing`, `typography`, `color`, `interaction`
- Advanced primitives: `inline`, `text`, `pressable`, `focus-ring`, `icon`
### Sidebar

- Decision: Use
- Inspiration: Ant Design Layout.Sider
- Preferences: width=token:layout.sidebar, density=compact, depth=one level of nesting, grouping=spacing first, a group label only when not self-evident, collapsed_state=icons with names, or a drawer below the large breakpoint, persistence=expanded, collapsed, and open sections survive navigation, footer=account and utility controls, separated from navigation
- Notes: The active item uses color.surface.selected with a color.primary indicator and stronger foreground weight; an ancestor of the active item gets a visibly weaker treatment so only one item reads as current. Hover uses color.surface.hover, which must remain distinguishable from the selected surface. Keep the width fixed at layout.sidebar rather than sizing to content, and let the sidebar scroll independently of the content region. Items are real links. Collapsed icon-only items still require accessible names. Do not put page-level actions in the sidebar; it navigates.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: real_links=true, active_item_reflects_route=true, focus_visible=true, keyboard_navigable=true, stable_width=true, collapsible=true, scrolls_independently=true
- Advanced rationale: Use Ant Design as the Sidebar inspiration for its grouped, collapsible navigation anatomy. The decisions that matter are structural rather than visual: a fixed width so the workspace never shifts as users move between sections, one level of nesting so the sidebar does not become a substitute for information architecture, and persistent selected state that is distinguishable from hover. The App shell pattern owns how the sidebar behaves responsively; this record owns the sidebar's own anatomy.
- Advanced use when: Persistent primary navigation across a workspace-style product; A section list that stays visible while the user works; Navigation with enough destinations that a horizontal bar would overflow
- Advanced avoid when: The product has few enough destinations for a horizontal navigation menu; The content is peer views of one subject, which is Tabs; It would carry actions rather than destinations; A third level of nesting is needed
- Advanced Foundation deviations: `layout`, `color`, `spacing`, `typography`, `interaction`, `breakpoints`
- Advanced primitives: `stack`, `surface`, `text`, `icon`, `pressable`, `focus-ring`, `separator`
### Toast

- Decision: Use
- Inspiration: Ant Design Message
- Preferences: density=compact, radius=token:radius.lg, elevation=token:shadow.overlay, placement=one consistent corner, positioned by the app shell, duration=long enough to read; anything with an action waits, stacking=show a few and collapse the rest, content=one sentence plus at most one action, severity=success and neutral; errors go to a persistent surface
- Notes: Use the toast layer so feedback stays visible above overlays and dialogs, but never let a dialog's own result appear only as a toast behind it. Auto-dismiss pauses while the pointer is over the toast or focus is inside it, so an action is never snatched away mid-reach. Toasts must not steal focus; they are announced politely instead, and their actions are reachable by keyboard from where the user is. Do not queue more than a few — collapse the rest and, where an operation produces many results, summarize once instead of emitting one toast per item.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: auto_dismiss=true, manually_dismissible=true, pauses_on_hover_or_focus=true, keyboard_reachable_actions=true, announced_to_assistive_tech=true, blocks_interaction=false, sole_carrier_of_important_information=false
- Advanced rationale: Use Ant Design as the Toast inspiration for its compact notification anatomy. The decision that matters is what may never live in a toast: because the surface disappears, anything the user must act on or may need to re-read belongs somewhere persistent. Monet allows a toast to carry an action such as Undo, but only when the same outcome remains reachable after the toast is gone.
- Advanced use when: Confirming a completed action that did not otherwise change the visible interface; Offering Undo immediately after a reversible action; Reporting a background operation that finished elsewhere on the page
- Advanced avoid when: The message requires the user to act, which is an Alert or an inline message; The failure needs to remain readable, which is a persistent surface; Confirming a change that is already visible in the interface; Several toasts would be emitted for one bulk operation
- Advanced Foundation deviations: `color`, `spacing`, `radius`, `elevation`, `layering`, `motion`
- Advanced primitives: `portal`, `surface`, `stack`, `text`, `icon`, `pressable`
### Skeleton

- Decision: Use
- Inspiration: Ant Design Skeleton
- Preferences: fidelity=approximate blocks, not every detail of the content, geometry=matches the final element's height and position, surface=token:color.surface.subtle, motion=at most a restrained pulse, removed under reduced motion, duration=never for operations that complete almost immediately
- Notes: Follow the Loading pattern for choosing between Skeleton, Spinner, and Progress. Skeletons must match the real element's dimensions, particularly row heights in tables, or the layout jumps when data arrives and undoes the reason for using one. Keep them coarse — a skeleton with more detail than the final interface is noise. They are decorative to assistive technology; the loading state is announced separately where it matters. When a request fails, replace the skeleton with an error and a recovery action rather than leaving it running.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: preserves_layout=true, respects_reduced_motion=true, used_for_refresh=false, announced_as_content=false, replaces_error_state=false
- Advanced rationale: Use Ant Design as the Skeleton inspiration for its structural placeholder anatomy. Monet's decision is about when a skeleton is the wrong answer: it belongs to first loads where the shape of the result is known, and it is actively harmful during a refresh, because blanking content the user was reading to replace it with grey bars loses more than it communicates. Refreshes keep their content and say they are updating.
- Advanced use when: First load of a page or region whose layout is known; Table rows and list items while the first page of data arrives; Preserving the shape of a dashboard grid while tiles load
- Advanced avoid when: Refreshing content the user is already reading; The eventual layout is unknown or materially different; The wait is short enough that the placeholder would flash; The request has failed, which is an error state
- Advanced Foundation deviations: `color`, `radius`, `spacing`, `motion`
- Advanced primitives: `box`, `surface`
### Empty State

- Decision: Use
- Inspiration: Ant Design Empty
- Preferences: density=compact, variants=new collection, no search matches, legitimately empty, placement=inside the region, keeping headings, search, and filters, visual_weight=typography and spacing over illustration, action=one primary action only when a clear next step exists, copy=leads with the reason the region is empty
- Notes: Follow the Empty states pattern for content and behavior. Keep the state inside the affected region rather than replacing the page, so users can see the filters or search that produced it. Never show an empty state while data is still loading, and never use one for a network failure, a permission problem, or an unavailable service. An icon or illustration is allowed only when it materially improves recognition and stays secondary to the message and the action.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: distinguishes_filtered_results=true, preserves_filter_context=true, shown_during_loading=false, used_for_errors=false, auto_clears_filters=false
- Advanced rationale: Use Ant Design as the Empty State inspiration for its restrained text-first treatment. The decision Monet enforces is that empty is not one state: a new collection, a filtered result with no matches, and a failed request need different messages and different next steps, and collapsing them into one generic panel is what makes an interface feel like it is hiding something. The visual restraint follows the hierarchy principle — an empty region should not become the most prominent thing on the page.
- Advanced use when: A collection has no items yet and the user can create the first one; A search or filter returned no matches and constraints can be loosened; A region is legitimately empty and simply needs to say so
- Advanced avoid when: Content failed to load, which is an error state; Data is still loading, which is a Skeleton or a Spinner; The same message would be used for new, filtered, failed, and unavailable; An action is being invented only because the region is empty
- Advanced Foundation deviations: `typography`, `spacing`, `layout`, `color`
- Advanced primitives: `stack`, `heading`, `text`, `icon`
### Button Group

- Decision: Use
- Inspiration: GitHub Primer ButtonGroup
- Preferences: orientation=horizontal by default, spacing=token:space.control-gap between independent buttons, attachment=reserved for controls that behave as one unit, hierarchy=at most one primary, neighbours visually subordinate
- Notes: Button Group is a layout and relationship pattern, not a new button variant. Buttons retain their own labels, states, hierarchy, accessibility behavior, and action semantics. Do not use visual attachment alone to imply selection; use a dedicated selection-oriented pattern when the group represents mutually exclusive state.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: wrap_when_constrained=true, preserve_individual_button_behavior=true, require_shared_selection_state=false, use_attached_borders_by_default=false
- Advanced rationale: Use GitHub Primer ButtonGroup as the primary inspiration because it treats a button group as a lightweight composition of related actions rather than conflating the pattern with an attached or segmented control. That distinction fits Monet better for product interfaces, toolbars, forms, tables, and data-heavy views where actions should read as related while retaining their individual semantics and hierarchy. Ant Design Space.Compact remains a useful reference for tightly attached controls, but its compact joined treatment is too specific to define the general Button Group pattern.
- Advanced use when: Two or more related actions should be presented together as a recognizable action set.; Actions operate on the same object, view, form, or workflow context.; A toolbar, table row, dialog, card, or page header needs a compact cluster of actions.; Related actions need consistent alignment and spacing while remaining individually actionable.
- Advanced avoid when: The controls represent mutually exclusive choices or persistent selected state.; The actions are unrelated and grouping would imply a relationship that does not exist.; A single primary action is sufficient.; The group contains so many actions that an overflow menu, toolbar, or other action-disclosure pattern would provide clearer hierarchy.; Attached borders are being used only for decoration rather than to communicate a genuinely coupled control.
### Split Button

- Decision: Use
- Inspiration: Ant Design Dropdown.Button
- Preferences: density=compact, radius=token:radius.control, label_weight=token:typography.ui.weight, icon_size=token:size.icon.md, primary_style=filled, menu_trigger_style=attached secondary segment, label_case=sentence, action_hierarchy=the primary segment stays visually dominant, attachment=shared height and outer radius, no gap between segments, visual_emphasis=restrained
- Notes: Keep the primary action label explicit and stable. The menu trigger should open related alternatives, not unrelated commands. Preserve the established Button typography, color, spacing, radius, border, loading, and focus conventions. Treat the two segments as one visual control: use the shared outer radius, avoid a gap between segments, and use a restrained divider between them when needed. The menu trigger must have an accessible label that communicates that additional actions are available. If users regularly choose different actions with similar frequency, use a Button Group or another action-selection pattern instead of pretending one action is primary. Do not use Split Button merely to save horizontal space.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_activation=true, focus_visible=true, disabled_state=true, loading_state=true, menu_trigger=true, menu_keyboard_navigation=true
- Advanced rationale: Use Split Button when one action is clearly the expected default but closely related alternatives need to remain immediately available. The primary segment should behave like a normal Button, while the attached menu trigger exposes secondary actions without giving them equal visual weight. This preserves a compact action hierarchy and reduces clutter compared with showing several separate buttons.
- Advanced use when: One action is clearly the most common or recommended choice and closely related alternatives are also needed; A primary action and a small menu of variants should remain visually connected; Showing every related action as a separate button would create unnecessary clutter; The default action can be triggered immediately without requiring the user to inspect the menu
- Advanced avoid when: The available actions have similar importance or usage frequency; The menu contains unrelated commands; There is no meaningful default action; Users need to review options before safely choosing an action; A simple Button plus separate overflow menu would provide clearer hierarchy; The control would contain destructive and routine actions in a way that increases accidental activation
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`
- Advanced primitives: `pressable`, `text`, `icon`, `focus-ring`
### Floating Action Button

- Decision: Use
- Inspiration: Ant Design FloatButton
- Preferences: placement=lower trailing edge, clear of navigation and safe areas, content=an icon, with a short label only when it is ambiguous, prominence=prominent without competing with navigation
- Notes: FAB is a specialized expression of an action, not the default treatment for primary buttons. Prefer standard buttons, page actions, or navigation-integrated actions when persistent floating access does not materially improve the workflow.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: allow_multiple_fabs=false, remain_visible_during_scroll=true, obscure_interactive_content=false, require_primary_action=true
- Advanced rationale: Use Floating Action Button as a specialized mobile pattern for a single frequent, high-priority action that benefits from persistent access. It should remain uncommon in Monet rather than becoming a general-purpose floating button, because its strong visual prominence can compete with content and navigation.
- Advanced use when: A mobile view has one clearly dominant and frequently used action.; The primary action should remain accessible while the user scrolls through content.; The action creates or initiates the main object or workflow associated with the current view.
- Advanced avoid when: There are multiple actions of similar importance.; The primary action can be clearly and conveniently placed within the page or navigation.; The floating control would obscure content, controls, or system navigation.; The action is destructive, infrequent, contextual, or difficult to represent clearly.; The interface is primarily desktop-oriented.
### Link

- Decision: Use
- Inspiration: Ant Design Typography.Link
- Preferences: color=token:color.link standalone, inherited inside body text, underline=always in running text, on hover and focus when standalone, external_indicator=marked visually and in the accessible name, label_text=names the destination, never a bare URL or click here, type_scale=inherits the surrounding scale
- Notes: color.link is verified for text contrast on color.surface; against the darker page background, keep links on a surface. Underline is the non-color signal that makes a link identifiable, which is why in-text links keep it permanently rather than relying on color alone. Standalone links in navigation, headers, and table cells may omit the resting underline because their position identifies them, but they gain one on hover and always show the focus ring. Do not open a new tab by default; when a link does, the accessible name says so. Do not nest interactive controls inside a link.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: real_href=true, focus_visible=true, keyboard_activation=true, supports_new_tab=true, opens_new_tab_by_default=false, underline_on_hover=true
- Advanced rationale: Use Ant Design as the Link inspiration for its restrained typographic treatment. The decision that matters is semantic: links must be real anchors with real URLs so middle-click, copy link, open in new tab, browser history, and assistive technology all work. Implementing navigation as a click handler on a styled element is the single most common way generated interfaces break user expectations, so Monet states the rule at the component rather than leaving it to each screen.
- Advanced use when: Navigating to another page, view, or external resource; An inline reference inside body text; The identifying cell of a table row that leads to the record; A secondary alternative beside a primary action, where the alternative navigates
- Advanced avoid when: The control performs an action rather than navigating, which is a Button; The control submits a form; The whole row or card is already the navigation target; A link is being styled to look like a primary button without being one
- Advanced Foundation deviations: `color`, `typography`, `interaction`
- Advanced primitives: `text`, `focus-ring`, `icon`
### Search Input

- Decision: Use
- Inspiration: Ant Design Input.Search
- Preferences: density=compact, radius=token:radius.control, border=token:color.border.strong, background=token:color.surface, search_icon=leading and decorative, never the accessible label, labeling=accessible label always, visible label unless context is plain, placeholder=clarifies scope or gives an example, never the label, clear_action=inline clear control whenever the field holds a query, submission=explicit for navigation or expensive retrieval, live_search=debounced updates when filtering loaded content, scope=stated when narrower than users would assume, width=fits realistic queries, contracts responsively
- Notes: Search Input collects a query; it does not own the search results interface. Keep result lists, empty states, filters, suggestions, and autocomplete behavior separate unless they are deliberately composed around the field. A search icon reinforces meaning but does not replace an accessible label. Preserve entered queries when displaying results so users can understand and refine what they searched for. Use Combobox rather than Search Input when the primary interaction is selecting a suggested value from a defined option set. Use a normal text field when the entered text is data rather than a query.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: use_search_input_semantics=true, show_search_icon=true, show_clear_action_when_populated=true, clear_action_restores_focus=true, support_keyboard_submission=true, allow_live_results=true, debounce_live_queries=true, preserve_query_after_submission=true, use_placeholder_as_only_label=false, submit_empty_query=false
- Advanced rationale: Keep Search Input as a specialized input pattern because search has recognizable semantics and interaction needs beyond a generic text field. Strong design systems consistently pair a familiar search affordance with clear scope, keyboard support, query clearing, and either explicit submission or responsive filtering depending on the cost and behavior of the search. Monet should distinguish two common modes: live filtering for local or inexpensive datasets, and submitted search for navigation, remote retrieval, or expensive queries. This keeps the component predictable without embedding result presentation, autocomplete, or command behavior into the input itself.
- Advanced use when: Users need to search across a collection, application, page, or defined content scope.; Users need to filter a list, table, catalog, or other existing dataset by entering a query.; Search is important enough to warrant a recognizable dedicated input rather than a generic text field.; Users may need to refine, clear, and rerun a query repeatedly.; A persistent query should remain visible while users inspect search results.
- Advanced avoid when: The input collects ordinary text rather than a search query.; Users are primarily choosing one value from suggestions; use Combobox instead.; A predefined set of filters or controls would let users find content more effectively than free-text search.; The dataset is so small that direct browsing or selection is clearer than searching.; The field is being used as a command launcher rather than content search.; Search suggestions or results are being treated as part of the input when they should be separate composed patterns.
### Password Input

- Decision: Use
- Inspiration: Ant Design Input.Password
- Preferences: density=compact, size=token:size.control.md, radius=token:radius.control, border=token:color.border.strong, background=token:color.surface, reveal_control=trailing icon button in the field, off by default, requirements_display=shown before typing, not only after a failure, validation_timing=new passwords as typed, existing ones on submit, confirmation_field=none; the reveal toggle replaces it, autocomplete=correct role so password managers fill and save
- Notes: Follow Text Input for border, background, focus, sizing, label, helper, and error treatment; the only additions are masking and the reveal control. The reveal toggle sits inside the field, uses the compact icon size, has an accessible name that states what it will do, and reflects its current state. Keep the toggle out of the tab order only if it remains reachable another way; by default it is a normal focusable control. Never echo the entered value into helper text, an error message, or a log. Requirements are stated as expectations, met or unmet, rather than as errors while the user is still typing.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: masked_by_default=true, reveal_toggle=true, focus_visible=true, disabled_state=true, error_state=true, accessible_label_required=true, paste_allowed=true, blocks_password_managers=false
- Advanced rationale: Password Input inherits Text Input's anatomy and adds one decision: masking is a privacy affordance, not a security control, so Monet always gives the user a way to see what they typed. Blocking paste, disabling autofill, or requiring a confirm field all make credentials harder to enter correctly and push users toward weaker passwords, which is why this record rules them out explicitly rather than leaving them to per-screen judgment.
- Advanced use when: Entering a password during sign-in; Creating or changing a password where requirements must be visible; Entering a secret, token, or key that should not be readable over a shoulder
- Advanced avoid when: A one-time code is being entered, which is an OTP Input; The value is not secret and masking only makes it harder to verify; A long secret is being pasted and masking prevents the user from confirming it
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`, `interaction`
- Advanced primitives: `box`, `text`, `icon`, `pressable`, `focus-ring`, `accessible-label`
### Breadcrumb

- Decision: Use
- Inspiration: Ant Design Breadcrumb
- Preferences: density=compact, position=above the page title, at the page's horizontal origin, current_item=last, not a link, marked as current, separator=one consistent chevron, truncation=collapse the middle, always keeping root and current, labels=each level's real title, never a route segment
- Notes: Use color.foreground.muted for ancestors and color.foreground for the current item, so the trail reads as context rather than as a row of links competing with the page title. Ancestors are real links; the current item is plain text marked with aria-current. Keep the trail on one line and collapse the middle rather than wrapping. Do not repeat the current page in both the breadcrumb and the page title unless the title adds information. Breadcrumbs supplement navigation; they never replace a persistent way back.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: real_links=true, reflects_route=true, focus_visible=true, shows_history=false, includes_current_page=true
- Advanced rationale: Use Ant Design as the Breadcrumb inspiration for its compact separator-based trail. The decision worth recording is when not to use one: a breadcrumb on a flat or two-level structure is decoration that implies depth the product does not have. A breadcrumb also shows containment, not history — rendering the user's path through the product instead of the object's position is the most common way this component misleads.
- Advanced use when: A record sits inside a hierarchy the user needs to navigate upward through; Nesting is deeper than two levels and the position is not otherwise obvious; The user may have arrived by search or a direct link and needs orientation
- Advanced avoid when: The structure is flat or only two levels deep; It would show the path the user took rather than where the object lives; Primary navigation already makes the location obvious; It would be the only way back from a destination
- Advanced Foundation deviations: `typography`, `color`, `spacing`, `interaction`
- Advanced primitives: `inline`, `text`, `icon`, `focus-ring`
### Navigation Menu

- Decision: Use
- Inspiration: Ant Design Menu
- Preferences: density=compact, active_indicator=underline or surface plus weight, never color alone, overflow=moves into a menu, never wraps or shrinks labels, depth=one level, with an optional single dropdown per item, position=in the app header, at the shell's horizontal origin
- Notes: The active item uses a color.primary indicator with stronger foreground weight; inactive items use color.foreground.muted and move to color.foreground on hover. Keep the bar one line tall at every viewport so the shell's geometry stays constant. Items are real links, and dropdown groups within an item follow Dropdown Menu behavior while still containing destinations rather than commands. Do not mix actions into the navigation bar; account and utility controls belong in their own trailing region.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: real_links=true, active_item_reflects_route=true, keyboard_navigation=true, focus_visible=true, collapses_below_medium=true, carries_actions=false
- Advanced rationale: Use Ant Design as the Navigation Menu inspiration for its horizontal menu anatomy with grouped dropdowns. Navigation Menu and Sidebar are alternatives, not companions: a product picks one for its top-level destinations. Choosing the horizontal form is a statement that the destination set is small and stable, so the record caps depth at one level and rules out wrapping, which would change the shell's header height as the route changes.
- Advanced use when: Top-level navigation for a product with few, stable sections; A marketing or documentation surface with a horizontal header; A workspace whose content benefits from the full width a sidebar would take
- Advanced avoid when: There are enough destinations to overflow at common widths, which is a Sidebar; Navigation needs more than one level; The items are peer views of one subject, which is Tabs; The items are commands rather than destinations
- Advanced Foundation deviations: `layout`, `color`, `typography`, `spacing`, `interaction`
- Advanced primitives: `inline`, `text`, `pressable`, `focus-ring`, `icon`
### Command Palette

- Decision: Use
- Inspiration: shadcn/ui Command
- Preferences: density=compact, radius=token:radius.lg, elevation=token:shadow.dialog, trigger=a documented global shortcut plus a visible entry point, grouping=grouped by kind with quiet labels, most relevant first, result_content=each result says what it is and where it lives, empty_query=recent and suggested commands, shortcuts=shown for any result that has one
- Notes: The palette is a modal surface at the dialog layer that traps focus and returns it on close. Typing filters immediately; arrow keys move the highlight, Enter runs the highlighted result, and the pointer and keyboard share one highlight treatment. Show what a result will do before it runs, and route destructive results through their normal confirmation rather than executing them straight from the palette. Keep the surface a fixed height with an internal scroll so results do not resize the overlay as the user types. When a search returns nothing, say the query matched nothing rather than showing a bare surface.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_navigation=true, escape_closes=true, focus_trap=true, returns_focus_to_trigger=true, debounced_search=true, preserves_query_on_reopen=false, replaces_navigation=false
- Advanced rationale: Use shadcn/ui as the Command Palette inspiration because its composition of a dialog, a filtered list, and keyboard-first navigation matches what Monet wants without importing an opinionated visual language. The decision that matters is that the palette is an accelerator layered on top of real navigation, never a replacement for it: a product where the fastest path is the only path is unusable for anyone who has not learned it.
- Advanced use when: A keyboard-first accelerator for navigation and frequent commands; A product with more commands than a menu can reasonably expose; Jumping directly to a record by name
- Advanced avoid when: It would be the only way to reach a destination or run a command; The product has few enough commands for menus and navigation to cover; Searching content rather than commands, which is a Search Input over results; Running a destructive action without its normal confirmation
- Advanced Foundation deviations: `spacing`, `radius`, `elevation`, `layering`, `typography`, `interaction`
- Advanced primitives: `portal`, `surface`, `stack`, `text`, `icon`, `focus-ring`, `pressable`
### Alert Dialog

- Decision: Use
- Inspiration: Ant Design Modal.confirm
- Preferences: width=focused, radius=token:radius.lg, elevation=token:shadow.dialog, actions=right-aligned, title=states the decision, naming the action and its target, body=explains the consequence and whether it is recoverable, action_labels=the confirming action repeats the verb and target, action_emphasis=destructive only when the outcome is destructive
- Notes: Follow the Destructive actions pattern for when confirmation is warranted at all; many reversible actions are better served by performing them and offering undo. Name the target in the title so the dialog is meaningful when read alone. Do not use generic copy such as "Are you sure?" without stating the consequence. Do not close the dialog or report success until the operation has actually been accepted, and prevent repeat activation while it is in flight. Send initial focus to the safe action or the dialog itself rather than to the destructive one. Never use destructive color on the safe action.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: escape_closes=true, outside_click_closes=false, focus_trap=true, returns_focus_to_trigger=true, requires_explicit_choice=true, blocks_repeat_activation=true, closes_before_completion=false
- Advanced rationale: Use Ant Design as the Alert Dialog inspiration for its explicit confirmation anatomy. The difference from Dialog is behavioral and deliberate: an alert dialog cannot be dismissed by clicking outside, because accidental dismissal of a consequential decision is exactly the failure it exists to prevent. Friction is proportionate — this component is for decisions worth interrupting, not for every delete.
- Advanced use when: Confirming deletion or removal that cannot be reliably undone; Confirming an action that affects other users, permissions, billing, or retention; Confirming a bulk operation whose scope should be stated before it runs; Discarding work the user has not saved
- Advanced avoid when: The action is easily reversible and undo would serve better; The interruption is informational rather than a decision, which is an Alert or a Toast; Every action of a kind is being confirmed regardless of consequence; A form or a multi-step task is being collected, which is a Dialog or a page
- Advanced Foundation deviations: `color`, `spacing`, `radius`, `elevation`, `layering`, `interaction`
- Advanced primitives: `portal`, `surface`, `stack`, `heading`, `text`, `focus-ring`
### Sheet

- Decision: Use
- Inspiration: shadcn/ui Sheet
- Preferences: edge=bottom on narrow viewports, height=sized to content up to a maximum, then the body scrolls, dismissal=a visible close control plus Escape; drag is additive, relationship=the narrow-viewport form of Drawer, not a new surface
- Notes: Follow the Overlays pattern. A sheet on a narrow viewport is modal in practice, so it traps focus and returns it to the trigger on close. Drag-to-dismiss is unavailable to keyboard users and unreliable on pointer devices, so a visible close control is always present. Keep the sheet's maximum height short of the full viewport so the page behind remains partly visible and the surface still reads as temporary.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: escape_closes=true, returns_focus_to_trigger=true, focus_trap=true, scrolls_internally=true, drag_only_dismissal=false
- Advanced rationale: Use shadcn/ui as the Sheet inspiration because it treats sheets and drawers as one edge-anchored surface with a configurable side, which is the relationship Monet wants. Keeping Sheet as the narrow-viewport expression of Drawer, rather than a separate concept, prevents products from growing two overlay families with different dismissal and focus behavior.
- Advanced use when: The narrow-viewport form of a drawer or a secondary panel; A compact set of actions or filters on a small screen; Temporary content that should not become a full page navigation
- Advanced avoid when: The viewport is wide, which is a Drawer; The task must block everything else, which is a Dialog; Dismissal would depend on dragging
- Advanced Foundation deviations: `layout`, `spacing`, `elevation`, `layering`, `interaction`, `motion`
- Advanced primitives: `portal`, `surface`, `stack`, `text`, `focus-ring`
### Popover

- Decision: Use
- Inspiration: Ant Design Popover
- Preferences: density=compact, radius=token:radius.lg, elevation=token:shadow.overlay, content_scope=one short task: a filter, small form, picker, or detail, dismissal=Escape, outside click, or close; confirm if input is unsaved, positioning=anchored, flips to stay in view, never covers the trigger, width=constrained, scrolling internally rather than growing
- Notes: Use the overlay elevation at the overlay layer with no scrim; the page behind stays visible and interactive. Focus moves into the popover on open and returns to the trigger on close. Because focus is not trapped, tabbing past the last control closes the popover rather than cycling. Keep the content to one task — a popover that grows a header, tabs, or its own scroll region has become a Drawer or a Dialog. Never put essential information only in a popover, and never nest a popover inside a popover.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: escape_closes=true, outside_click_closes=true, returns_focus_to_trigger=true, focus_moves_into_surface=true, trigger_shows_open_state=true, focus_trap=false, opens_on_hover=false
- Advanced rationale: Use Ant Design as the Popover inspiration for its anchored surface anatomy. Popover is the middle rung of the overlay ladder: heavier than a tooltip because it holds interactive content, lighter than a dialog because it does not interrupt the page. It opens on click rather than hover, because hover-triggered interactive content is unreachable by keyboard and unusable on touch.
- Advanced use when: A short form or filter attached to a specific control; A picker such as a color, date, or emoji selector; Compact contextual detail that the user may interact with; Secondary controls that would clutter the page if always visible
- Advanced avoid when: The content is a plain label, which is a Tooltip; The content is a list of commands, which is a Dropdown Menu; The task is long, multi-step, or needs the page's full attention; The information is essential and must not depend on discovering a trigger
- Advanced Foundation deviations: `spacing`, `radius`, `elevation`, `layering`, `interaction`
- Advanced primitives: `portal`, `surface`, `stack`, `text`, `focus-ring`
### Hover Card

- Decision: Use
- Inspiration: Mantine UI HoverCard
- Preferences: density=compact, radius=token:radius.lg, elevation=token:shadow.overlay, content_hierarchy=title first, supporting detail second, width=a compact readable measure, trigger_relationship=anchored closely to the linked subject, placement=the side with room, without covering the trigger, dismissal=leaves when pointer and focus leave trigger and card, visual_emphasis=restrained
- Notes: Keep Hover Card content concise and directly related to the trigger subject. Use a clear title and only the supporting information that helps users decide whether to follow the link or understand the subject. Use Monet's overlay elevation and layering rather than decorative shadows. Open after a short intentional delay so incidental pointer movement does not create visual noise, and allow a brief close delay so users can move from the trigger into interactive card content. The same information or action must remain available without hover; never make Hover Card the only way to access required content. Support keyboard focus in addition to pointer hover. If the content is only a short label or explanation, use Tooltip instead. If users must complete a task, make a decision, or interact extensively, use Popover, Dialog, or the destination page instead. A hover card is a floating surface, so it takes radius.lg like every other floating surface rather than a control radius.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: hover_trigger=true, focus_trigger=true, keyboard_accessible=true, dismiss_on_escape=true, interactive_content=true, delayed_open=true, delayed_close=true
- Advanced rationale: Use Hover Card for optional contextual previews that help users inspect a linked subject without navigating away. The card should feel lightweight and temporary, provide more information than a Tooltip, and preserve the user's current context without becoming a substitute for the full destination or an essential interaction step.
- Advanced use when: Providing a richer preview of a linked person, project, file, repository, record, or other identifiable subject; Showing optional metadata that helps users decide whether to open the linked destination; Preserving context when navigating away merely to inspect basic subject details would create unnecessary friction; The preview is useful but not required to understand or operate the interface
- Advanced avoid when: The content is only a short label or simple explanation better suited to a Tooltip; The information is required to complete the current task; The user must perform substantial interaction or make an important decision inside the surface; The trigger is not clearly associated with the previewed subject; The same information cannot be accessed by keyboard or through the linked destination; Frequent hover cards would obscure content or create distracting visual activity
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`, `elevation`, `motion`, `layering`
- Advanced primitives: `box`, `text`, `focus-ring`
### Alert

- Decision: Use
- Inspiration: Ant Design Alert
- Preferences: density=compact, radius=token:radius.md, placement=inside or immediately above the region it describes, variants=info, success, warning, danger on tinted status surfaces, anatomy=optional icon, short title, body, one recovery action, dismissal=informational messages only; unresolved problems stay, content=what happened, what it means, and what to do next
- Notes: Use the tinted .surface variants with ordinary color.foreground text, which is verified to read on them; do not also color the text. The icon reinforces the level but never carries it alone — the text states the condition. A dismissible alert must not be the only report of an unresolved problem, since dismissing it would hide the fact. When an alert appears in response to something the user did, announce it; when it is present on load, it is part of the page and needs no announcement. Keep at most one action, matched to the actual recovery.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: persistent=true, dismissible_when_informational=true, supports_action=true, announced_when_dynamic=true, conveys_meaning_with_text=true, blocks_interaction=false
- Advanced rationale: Use Ant Design as the Alert inspiration for its inline message anatomy. Alert is the persistent counterpart to Toast: it stays, so it is where an unresolved condition belongs. Placing it adjacent to what it describes is the decision that makes it useful — an alert at the top of a page about a problem in one panel forces the user to hunt for the connection.
- Advanced use when: A persistent condition affecting a page or region; A warning that must remain visible while the user works; Explaining why a region is unavailable or degraded; A form-level error summary alongside field-level messages
- Advanced avoid when: The message is transient confirmation, which is a Toast; The message belongs to one field, which is inline validation; It would announce a marketing or promotional message; A decision must be resolved before continuing, which is a Dialog
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `borders`
- Advanced primitives: `surface`, `stack`, `text`, `icon`
### Progress

- Decision: Use
- Inspiration: Ant Design Progress
- Preferences: determinacy=determinate by default, otherwise use a Spinner, label=paired with what is happening and how much is left, value_text=shown when the exact amount matters, color=token:color.primary, token:color.success done, token:color.danger failed, placement=adjacent to the work, at the full width of its region
- Notes: Follow the Loading pattern for choosing between Progress, Spinner, and Skeleton. Expose the current value, minimum, and maximum to assistive technology, and announce completion. For multi-step work, prefer reporting the current step and total over a synthetic percentage. On failure, stop the bar, keep the amount completed visible where that matters, and offer recovery rather than resetting silently to zero.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: determinate=true, monotonic=true, announces_completion=true, respects_reduced_motion=true, fabricates_progress=false
- Advanced rationale: Use Ant Design as the Progress inspiration for its simple bar and circle anatomy. The decision that matters is refusing to fake it: a progress bar is a promise about how much work remains, and a fabricated percentage that stalls at ninety-nine costs more trust than an honest indeterminate indicator. Progress also must not go backwards, since a bar that retreats reads as failure.
- Advanced use when: Uploads, imports, exports, and other operations that report real completion; Multi-step processing where the step count is known; A long operation the user may wait through
- Advanced avoid when: Completion cannot be measured, which is a Spinner; The percentage would be estimated to look measurable; The steps are a user-driven workflow, which is a Stepper; The wait is short enough to need no indicator
- Advanced Foundation deviations: `color`, `motion`, `spacing`, `radius`
- Advanced primitives: `box`, `text`
### Spinner

- Decision: Use
- Inspiration: Ant Design Spin
- Preferences: size=token:size.icon.md in controls, otherwise the surrounding text size, placement=inside or beside the element that is waiting, color=token:color.foreground inherited from its surroundings, delay=brief, so fast operations do not flash an indicator, in_controls=dimensions and accessible name stay unchanged
- Notes: Follow the Loading pattern for treatment selection. Motion alone does not communicate state to everyone, so pair a spinner with status text or accessible semantics wherever the wait is meaningful. Honor reduced-motion preferences by minimizing rather than removing the indicator. Stop the spinner as soon as the outcome is known — a spinner still turning after a failure actively misinforms. Inside a button, swap the content without changing the button's width.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: indeterminate=true, respects_reduced_motion=true, preserves_control_dimensions=true, blocks_repeat_activation=true, blocks_whole_page=false
- Advanced rationale: Use Ant Design as the Spinner inspiration for its restrained indeterminate indicator. Monet's decisions are about scope and honesty: a spinner covers the smallest region that is actually waiting, and it never becomes a fake progress bar. A page-covering spinner for a single region's request is the most common way loading feedback removes more information than it adds.
- Advanced use when: A short localized wait inside a control or a small region; An action in flight on the control that started it; A wait whose duration cannot be estimated
- Advanced avoid when: The layout of incoming content is known, which is a Skeleton; Real progress can be reported, which is Progress; It would cover the whole page for one region's request; The operation has already failed
- Advanced Foundation deviations: `motion`, `color`, `sizing`
- Advanced primitives: `box`, `icon`
### Status Indicator

- Decision: Use
- Inspiration: Ant Design Badge.Status
- Preferences: anatomy=a small shape plus a text label, label_exception=omitted only in a dense column whose header names it, shape=shape or fill varies with state, not color alone, size=token:size.icon.sm, vocabulary=one state vocabulary across the product
- Notes: Map states to the semantic roles: success for healthy and complete, warning for degraded or needs attention, danger for failed and blocked, info for in progress, and neutral for idle or unknown. Use color.success for the positive dot but color.success.foreground when the state word is written as text, since the base teal does not meet text contrast. Any motion for a live state stays subtle and honors reduced-motion preferences. Unknown is a real state and is shown as unknown rather than as a default success.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: interactive=false, conveys_meaning_with_text=true, color_only_meaning=false, animates_when_live=true
- Advanced rationale: Use Ant Design as the Status Indicator inspiration for its dot-and-label anatomy. Status Indicator differs from Badge by being about a live or operational condition rather than a categorical label, and by being small enough to sit inline with a value. The decision this record enforces is that the shape is never the only signal: a colored dot alone fails for a meaningful share of users and in any monochrome context.
- Advanced use when: Showing operational state such as running, degraded, failed, or idle; Marking presence or availability beside a name or avatar; A compact status column in a dense table
- Advanced avoid when: The state is categorical rather than operational, which is a Badge; The state needs explanation, which is an Alert or an inline message; Color would be the only difference between states; The indicator would be interactive
- Advanced Foundation deviations: `color`, `sizing`, `typography`, `spacing`, `motion`
- Advanced primitives: `inline`, `text`, `icon`
### Data Table

- Decision: Use
- Inspiration: Ant Design Table (interactive)
- Preferences: density=compact, row_dividers=token:border.subtle, identifying_column=first, links to the record, never scrolls away, alignment=text left, numbers right with tabular figures, sort_state=always visible, including the default sort, sort_scope=the whole dataset, never only the current page, selection=leading checkbox column, header selects the current page, row_actions=one or two inline, the rest in a fixed trailing column, paging=pagination over infinite scroll, with its state in the URL
- Notes: Follow the Data tables pattern for the full behavioral contract, and the Filtering pattern for the controls above the table. Row hover uses color.surface.hover and a selected row uses color.surface.selected with a second non-color signal, so selection stays readable while the pointer moves. Row actions are never hover-only, since they would be unreachable by keyboard and on touch. Skeleton rows during load match the real row height so nothing shifts. Keep a stable row height and truncate long secondary values with a way to see the full value.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: sortable=true, selectable=true, paginated=true, sticky_header=true, responsive_scroll=true, keyboard_navigable=true, preserves_state_on_return=true, row_actions_hover_only=false, reorders_during_refresh=false
- Advanced rationale: Use Ant Design as the Data Table inspiration because its table carries sorting, selection, row actions, and paging as one coherent unit rather than as bolted-on features. The decisions Monet adds are about the user's position: sort, filters, page, selection, and scroll must survive opening a record and coming back, and rows must not reorder underneath someone mid-task. Those are the properties that make a dense table usable for real work, and they are the ones most often missing.
- Advanced use when: A collection users sort, filter, select from, and act on; Records that need bulk operations; Dense operational data where position and total matter
- Advanced avoid when: The data is a small fixed set with no interaction, which is a Table; Records are read one at a time and not compared, which is a List or Cards; Interaction would be added without preserving sort, filters, and position; Comparison would be discarded by reflowing into cards on narrow viewports
- Advanced Foundation deviations: `typography`, `spacing`, `borders`, `color`, `interaction`, `layout`
- Advanced primitives: `box`, `grid`, `text`, `separator`, `pressable`, `focus-ring`
### List

- Decision: Use
- Inspiration: github-primer-actionlist List
- Preferences: density=compact, item_anatomy=primary line, optional metadata, trailing state or actions, separators=spacing first, token:border.subtle only when dense, row_height=uniform; long values truncate, actions=one inline at most, the rest in a menu, never hover-only, selection=persistent state, distinguishable from hover
- Notes: Row hover uses color.surface.hover and a selected item uses color.surface.selected with a second non-color signal. When a whole item navigates, it is one link with one focus ring, and any controls inside it stay small and non-overlapping. Preserve scroll position and selection when the user opens an item and returns — this is what makes a list usable as the left column of a master-detail workspace. Keep item heights uniform so scanning stays rhythmic.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: keyboard_navigable=true, focus_visible=true, real_links_for_navigation=true, selectable=true, preserves_scroll_position=true, hover_only_actions=false
- Advanced rationale: Use GitHub Primer's ActionList as the List inspiration because it treats a list as a keyboard-navigable set of items with clear primary content and trailing affordances, which fits Monet's productivity focus better than a decorative list. The decision separating List from Table is whether values are compared across a shared set of attributes: if they are, the answer is a Table; if items are read individually, a list keeps them readable.
- Advanced use when: A collection read one item at a time rather than compared; The selectable column of a master-detail workspace; Items whose primary content is a name or a short phrase; Search results and activity feeds
- Advanced avoid when: Values are compared across shared attributes, which is a Table; Items are hierarchical, which is a Tree; Each item needs its own boundary and media, which may be Cards; The list is a set of commands, which is a Dropdown Menu
- Advanced Foundation deviations: `spacing`, `typography`, `color`, `interaction`, `borders`
- Advanced primitives: `stack`, `text`, `icon`, `pressable`, `focus-ring`, `separator`
### Tag

- Decision: Use
- Inspiration: Ant Design Tag
- Preferences: density=compact, radius=token:radius.full, content=names the constraint fully, not just its category, removal=a trailing remove control with an accessible name, wrapping=wraps onto more lines, never scrolls or truncates, variants=neutral unless the tag itself carries that meaning
- Notes: Neutral tags use color.surface.subtle with color.foreground and a color.border edge. Removal must be reachable by keyboard, and removing a tag returns focus predictably to the next tag or to the container rather than to the top of the page. Where tags represent filters, follow the Filtering pattern: keep them near the collection, make each individually removable, and provide one clear reset-all that is not more prominent than the ordinary actions around it. Do not use tags as buttons for actions.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: interactive=true, removable=true, keyboard_removable=true, focus_visible=true, conveys_meaning_with_text=true
- Advanced rationale: Use Ant Design as the Tag inspiration for its removable-token anatomy. Tag is the interactive counterpart to Badge, and its most important role in Monet is representing active filters: a tag that names the full constraint is what lets a user explain the current result set without reopening every control. That is why the record requires the constraint's value, not just its field name.
- Advanced use when: Representing an active filter that the user can remove; Tokens entered into a multi-value input; User-applied labels on a record; A selectable category chip in a compact filter row
- Advanced avoid when: The value is read-only status, which is a Badge; The tag would trigger an action rather than change a value; The label names only the filter category without its value; There are so many tags that the set needs its own scroll region
- Advanced Foundation deviations: `color`, `typography`, `spacing`, `radius`, `interaction`
- Advanced primitives: `inline`, `text`, `pressable`, `icon`, `focus-ring`
### Statistic / KPI

- Decision: Use
- Inspiration: Ant Design Statistic
- Preferences: anatomy=label above, value prominent, comparison and period below, value_typography=the largest step the layout allows, tabular figures, period=always stated, comparison=against a named baseline, direction_color=only with an arrow or a word, after deciding direction, container=none by default; spacing and type scale do the separating, precision=rounded consistently across a row, with units visible
- Notes: Zero, no data, and failed to load are three different states and must look different; only zero is displayed as a number. Use color.success.foreground and color.danger for delta text so both meet contrast on color.surface. Keep the label above the value: users scan values first and need the label already in view. A statistic that reports a problem should lead somewhere — link it to the filtered records behind it and carry the current time range along. Follow the Dashboard pattern for grid, refresh, and time-range behavior.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: supports_trend=true, supports_comparison=true, links_to_detail=true, shows_loading_placeholder=true, distinguishes_zero_from_no_data=true
- Advanced rationale: Use Ant Design as the Statistic inspiration for its compact label, value, and delta anatomy. The decisions that matter here are about honesty rather than layout: a delta with no stated comparison basis, a partial period compared against a complete one, and a green arrow on a metric where down is good are the three ways a number misleads while looking authoritative. Recording them at the component keeps every dashboard from re-deciding them.
- Advanced use when: A headline metric at the top of a dashboard or detail view; A number whose change over a period is the point; A summary figure that leads into the records behind it
- Advanced avoid when: The shape of the trend is the answer, which is a Chart or a Sparkline; Several values need comparing across categories, which is a Table or a Chart; No comparison basis or period can be stated; The value is a status rather than a quantity
- Advanced Foundation deviations: `typography`, `color`, `spacing`, `layout`
- Advanced primitives: `stack`, `text`, `icon`
### Field

- Decision: Use
- Inspiration: Mantine UI Input.Wrapper
- Preferences: structure=label, description, control, message, label=visible and above the control, never a placeholder, required_marking=mark the smaller set, required or optional, message_slot=one reserved slot, so an error cannot change the height, width=sized to the expected value, not to the form's width, spacing=consistent rhythm, larger between groups than within
- Notes: Follow the Forms pattern for validation timing, copy, and submission. The label uses the medium weight and color.foreground; the description uses color.foreground.muted; the error uses color.danger and is adjacent to the control it describes. Invalid state applies color.danger to the control's boundary, and the focus ring must remain visible over it. Disabled propagates to the control and to the label's foreground, but never removes the description that explains why. A field wrapping a group of controls uses Fieldset so the group has one label and one message rather than one per option.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: associates_label_with_control=true, associates_description_with_control=true, associates_error_with_control=true, preserves_height_on_error=true, propagates_disabled_state=true, propagates_invalid_state=true
- Advanced rationale: Use Mantine as the Field inspiration because it treats the label, description, error, and control as one composed unit with the accessibility wiring already settled. Field is where Monet's form rules are actually enforced: label placement, required marking, message position, and programmatic association are decided once here rather than re-decided by every control. Reserving the message slot is the small detail that keeps a form from jumping as validation appears.
- Advanced use when: Any labelled form control; A control that needs a description or a validation message; Keeping label, control, and message aligned and associated in a form
- Advanced avoid when: The control is a group of options sharing one question, which is a Fieldset; The value is read-only display content rather than input; It would be used purely for spacing around a control
- Advanced Foundation deviations: `typography`, `spacing`, `color`, `interaction`
- Advanced primitives: `stack`, `text`, `accessible-label`
### Fieldset

- Decision: Use
- Inspiration: Mantine UI Fieldset
- Preferences: legend=the group label is the question, validation=one message for the group, below it, layout=vertical, a row only for two or three short options, border=none by default; spacing and the legend do the grouping
- Notes: Required for radio groups and for checkbox groups that share one question, because without a group label each option is announced without its context. The legend uses the same weight as a field label so groups and fields read as peers. Disabled applies to the whole group rather than being set on each control. Do not nest fieldsets; if a group needs subgroups, the form needs sections.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: groups_related_controls=true, single_group_label=true, single_group_message=true, propagates_disabled_state=true, always_bordered=false
- Advanced rationale: Use Mantine as the Fieldset inspiration for its lightweight grouping. Monet's decision is to keep the semantics and drop the chrome: the accessibility value of a fieldset is the group label, not the box around it, and a bordered fieldset for every radio group contradicts the hierarchy principle. Grouping comes from spacing and the legend first.
- Advanced use when: A radio group answering one question; A set of checkboxes that belong to one question; Related controls that share a validation message
- Advanced avoid when: Only one control is involved, which is a Field; The grouping is a page section rather than one question; A border is wanted around unrelated controls
- Advanced Foundation deviations: `typography`, `spacing`, `interaction`
- Advanced primitives: `stack`, `text`, `accessible-label`
### Label

- Decision: Use
- Inspiration: Mantine UI Input.Label
- Preferences: position=above its control, case=sentence, with no trailing colon, content=names the value, not the action, weight=token:typography.label.weight, color=token:color.foreground, required_marking=one consistent marker, explained once per form, click_target=clicking the label activates its control
- Notes: Every control has a programmatically associated label, visible or not. When a label must be hidden, use the visually-hidden primitive rather than removing it. Keep labels short enough to sit on one line at the field's width; explanation belongs in the description, not in a longer label. Do not use a label to carry validation text.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: associated_with_control=true, click_focuses_control=true, visible_by_default=true, replaced_by_placeholder=false
- Advanced rationale: Use Mantine as the Label inspiration for its minimal, correctly associated label. The decision Monet enforces is that labels stay visible: floating and placeholder-only labels disappear exactly when the user needs them, fail contrast, and break with autofill. A visually hidden label is acceptable only where the surrounding structure already names the control, such as a search field with a visible section heading.
- Advanced use when: Naming any form control; Naming a group of controls through a Fieldset legend; Providing an accessible name where a visible label would be redundant
- Advanced avoid when: The text is instructional, which is a description; The text reports a problem, which is a validation message; It would be replaced by placeholder text
- Advanced Foundation deviations: `typography`, `color`, `spacing`
- Advanced primitives: `text`, `accessible-label`
### Container

- Decision: Use
- Inspiration: No inspiration selected
- Preferences: width_model=fluid with a maximum width, never a fixed page width, max_width=token:layout.page-shell-max, default_content_width=token:layout.content-default, narrow_content_width=token:layout.content-narrow, wide_content_width=token:layout.content-wide, alignment=container centered, inner regions at the content origin, horizontal_padding=token:layout.gutter-mobile, token:layout.gutter-desktop, density_modes=constrained by default, full-width intentionally, grid_relationship=the outer boundary for the page grid
- Notes: Container controls the outer horizontal bounds and alignment of a content region; it should not become a generic card or visual surface. Do not add background, border, radius, elevation, or internal component styling merely because content is inside a Container. Keep page containment separate from readable line length: long-form text and forms may use narrower nested regions inside the main container. The default should be constrained, while full-width is an explicit layout decision for interfaces that benefit from additional horizontal information density. Container never defines its own numeric widths or gutters: every value comes from the Layout foundation's tokens, and the App shell pattern governs how those values compose into a page.
- Inherits: Monet Principles, Foundations, and Patterns
- Advanced behavior: fluid_below_max_width=true, center_when_constrained=true, preserve_horizontal_gutters=true, allow_full_width_variant=true, allow_nested_content_widths=true, use_fixed_width_by_default=false, force_all_pages_to_same_width=false
- Advanced rationale: Use Container as a responsive page-level layout primitive with a centered maximum width, persistent horizontal gutters, and an intentional full-width escape hatch. This matches the strongest pattern across mature product systems: GitHub Primer constrains typical pages to a maximum width while allowing full layouts, Atlassian aligns top-level content containers to a responsive grid, and Carbon varies between centered constrained layouts, constrained product layouts, and full-width high-density interfaces according to content needs. A single rigid page width is too limiting for Monet because readable forms and settings pages, standard product pages, and dense analytical interfaces have materially different width requirements. The Layout foundation owns the actual dimensions; Container applies them rather than restating them, so page geometry has one source of truth.
- Advanced use when: Establishing the main horizontal bounds of a page or major content region.; Keeping page content aligned consistently across routes and viewport sizes.; Providing responsive page gutters without requiring individual page components to manage viewport spacing.; Constraining standard product pages so content does not spread unnecessarily across very wide displays.; Providing a full-width variant for tables, dashboards, canvases, timelines, and other high-density interfaces.; Creating narrower nested regions for forms, settings, documentation, or reading-focused content.
- Advanced avoid when: A component only needs local padding or spacing; use normal component spacing instead.; The element is a visual surface such as a card, panel, or section and needs its own border, background, or elevation semantics.; Constraining width would materially reduce the usefulness of a dense data interface.; Using multiple nested Containers solely to create arbitrary spacing.; Applying the same maximum width to every type of page regardless of content density or task.; Using Container to control individual component dimensions rather than page or region layout.
- Advanced Foundation deviations: `layout`, `spacing`, `breakpoints`
- Advanced primitives: `container`, `box`

## Patterns

- **Forms** (selected) — Collect input with clear labels, honest validation, preserved work, and one obvious way to commit.
- **Filtering** (selected) — Narrow a collection while keeping active constraints visible, understandable, and easy to reverse.
- **Destructive actions** (selected) — Make destructive outcomes explicit and proportionate while preserving recovery whenever the action can honestly be reversed.
- **Empty states** (selected) — Explain why content is absent, preserve context, and provide the most useful next action when one exists.
- **Loading** (selected) — Preserve context, communicate honest progress, and keep the interface responsive while work completes.
- **Error handling** (selected) — State what failed, preserve user work, and provide the clearest available path to recovery.
- **Master-detail workspace** (selected) — Pair a persistent selectable list with a detail or editor panel that keeps stable geometry across every state.
- **App shell** (selected) — One persistent frame — navigation, page header, and content region — that every primary page inherits instead of defining its own geometry.
- **Navigation** (selected) — Choose the navigation control that matches the relationship between destinations, and keep location, URL, and active state in agreement.
- **Overlays** (selected) — Pick the lightest surface that fits the interaction, and keep dismissal, focus, and stacking predictable across all of them.
- **Data tables** (selected) — Present many records so they can be scanned, compared, sorted, selected, and acted on without losing position or context.
- **Settings** (selected) — Organize configuration by what users are trying to change, make the save model unmistakable, and keep scope and consequences explicit.
- **Dashboard** (selected) — Answer a small number of known questions at a glance, with honest numbers, a visible time range, and a path from every metric to its detail.

## Reference memory

- **Linear Doc Pages** (image) — User preference: I like how the page uses cards, and spacing and sidebar makes it easy to navigate and browse a doc · AI tags: documentation portal, help center, knowledge base home, persistent sidebar, top navigation bar, search button, theme control, sign-up button, accordion navigation groups, icon-led article cards, section headings, hierarchical sidebar navigation, expandable documentation categories, sectioned card grid, active navigation state, icon-title-description card anatomy, dark monochrome interface, thin low-contrast borders, generous content spacing, subtle rounded corners, muted secondary text, minimal iconography, large card surfaces, fixed-width left sidebar, full-width top bar, wide main content area, four-column card grid, consistent grid gutters, vertically stacked content sections, near-black page background, charcoal card surfaces, soft gray borders

