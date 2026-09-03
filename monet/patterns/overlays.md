---
title: "Overlays"
summary: "Pick the lightest surface that fits the interaction, and keep dismissal, focus, and stacking predictable across all of them."
status: "selected"
tags: ["overlays","focus","layering"]
order: 9
updated_at: "2026-09-02T00:00:00.000Z"
components: ["dialog","alert-dialog","drawer","sheet","popover","tooltip","hover-card","dropdown-menu","context-menu"]
foundations: ["layering","elevation","motion","interaction","spacing","opacity"]
---

# Overlays

An overlay interrupts. The decision is always which surface interrupts least while still supporting the interaction, and the failure mode is reaching for a modal because it is the easiest thing to build.

## Choosing the surface

Work down this list and stop at the first one that fits.

**Inline** — no overlay. If the content can live on the page, it should. Expanding a section beats opening a panel.

**Tooltip** — a short, non-interactive label for a control whose purpose is not obvious. No links, no buttons, no essential information. Never the only place a name exists.

**Hover Card** — supplementary preview of an entity behind a link or avatar. Enrichment only; the same information must be reachable another way.

**Dropdown Menu / Context Menu** — a list of actions or options anchored to the control that opened it. Menus contain commands, not forms.

**Popover** — a small anchored surface with real interactive content: a filter, a short form, a picker. Use it when the content relates to a specific element on the page.

**Drawer / Sheet** — a side or edge panel for supporting work that benefits from keeping page context visible. Good for details, previews, and secondary editing.

**Dialog** — a centered modal for a focused task or a decision that must be resolved before continuing.

**Alert Dialog** — a dialog that requires an explicit choice and cannot be dismissed by clicking outside. Reserve it for consequential and destructive confirmations.

## When not to use a modal

Do not use a dialog for long or multi-step work, for content the user needs to reference against the page behind it, or for anything that should be linkable, refreshable, or reachable by browser back. Those are pages.

Do not use a dialog for feedback the user does not need to act on. That is a toast, an alert, or an inline message.

Do not open a dialog from a dialog. Replace the dialog's content, or move the work to a page.

## Dismissal

Every overlay closes on Escape. Every non-modal overlay also closes on outside click and on scroll of the underlying content where anchoring cannot be maintained.

Modal dialogs close on outside click only when nothing would be lost. A dialog holding unsaved input either warns before discarding or ignores outside clicks. Alert dialogs never close on outside click.

Dismissal returns focus to the element that opened the overlay. If that element no longer exists, focus moves to a sensible nearby container rather than to the top of the page.

Never rely on a close affordance that only appears on hover, and never leave an overlay with no visible way to close it.

## Focus and keyboard

Modal surfaces — dialogs, alert dialogs, and modal drawers — trap focus, move initial focus into the surface, and mark the rest of the page inert. Send initial focus to the first meaningful control, or to the surface itself when the first control is destructive.

Menus and popovers do not trap focus, but they do take it: arrow keys move within a menu, typing jumps to a matching item, Escape closes and returns focus to the trigger.

Tooltips and hover cards never take focus. They must appear on keyboard focus of the trigger as well as on hover.

An overlay's trigger stays in its pressed treatment while its surface is open.

## Stacking and layering

Use the semantic layers rather than ad hoc z-index values: non-modal surfaces on the overlay layer, modal surfaces and their scrims on the dialog layer, transient global feedback on the toast layer. Never raise a z-index to escape a stacking context — fix the context.

Only one modal surface is open at a time. A menu or popover opened from inside a dialog renders above it and closes with it.

Toasts remain visible above an open dialog, but a toast is never where a dialog's own result belongs.

## Positioning and appearance

Anchored surfaces stay attached to their trigger, flip to stay in the viewport, and never cover the trigger itself. Constrain them to the viewport with internal scrolling rather than letting them run off-screen.

Use the overlay elevation for anchored non-modal surfaces and the dialog elevation for modal ones. A scrim separates a modal surface from the page without hiding it entirely.

Keep entrance and exit motion short and honor reduced-motion preferences. Motion is orientation, not decoration, and must never delay interaction.

Keep dialog width focused rather than filling the viewport. Actions sit in a consistent position, with one primary action and the safe action easy to identify.

## Avoid

- A modal where an inline expansion, a popover, or a page would work.
- Dialogs stacked on dialogs.
- Long or multi-step tasks inside a modal.
- Interactive content, links, or essential information inside a tooltip.
- Overlays that cannot be closed with Escape, or that lose the caller's focus on close.
- Outside-click dismissal that silently discards unsaved input.
- Hover-only triggers with no keyboard or touch equivalent.
- Arbitrary z-index values instead of the semantic layers.
- Anchored surfaces that cover their own trigger or escape the viewport.
- Content in a modal that users need to link to, refresh, or reach with browser back.
