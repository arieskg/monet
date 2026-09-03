---
title: "Settings"
summary: "Organize configuration by what users are trying to change, make the save model unmistakable, and keep scope and consequences explicit."
status: "selected"
tags: ["configuration","forms","navigation"]
order: 11
updated_at: "2026-09-02T00:00:00.000Z"
components: ["switch","field","select","text-input","tabs","button","alert","fieldset"]
foundations: ["layout","spacing","typography","interaction","color"]
---

# Settings

Settings are visited rarely, under time pressure, usually to change one thing. Optimize for finding that one thing and understanding what changing it will do. Field mechanics follow the Forms pattern; this pattern covers organization, save model, and scope.

## Organization

Group settings by what the user is trying to accomplish, not by which system implements them. If two settings are always changed together, they belong together regardless of where they live in the backend.

Use one navigable page per major group once there are more than a handful of groups. Within a page, use headed sections. Keep the settings body at the narrow content width inside the standard page shell so labels and descriptions stay readable.

Order groups by frequency: the things people actually come here to change go first. Account, security, and billing concerns belong in their own groups rather than mixed with product preferences.

Put settings where users will look for them. A setting that meaningfully affects one workflow can also be reachable from that workflow, but it has exactly one canonical home and one source of truth.

## Rows

Each setting is one row: label, a short description of what it does, and the control. Put the description under the label, not after the control.

Describe the effect, not the mechanism. `Send an email when a run fails` is a setting; `Enable notification webhook` is an implementation detail.

State the current value plainly. A user should be able to read the page and know how the product is configured without opening any control.

When a setting depends on another, show the dependency rather than silently disabling the dependent row. If a row must be unavailable, say why next to it.

## Save model

Choose one save model per page and make it obvious which one is in effect.

**Immediate** settings apply on change and are the better default for independent toggles and selections. Use a Switch, confirm the change happened, and offer undo where the change is reversible and consequential. Never leave a user unsure whether an immediate change was stored.

**Explicit** settings are edited then committed with one primary action. Use Checkbox rather than Switch here, since a switch that does not take effect until Save contradicts what it looks like. Show that changes are pending, keep the save action reachable without hunting, and warn before navigating away from unsaved edits.

Do not mix the two models within one section. If a page genuinely needs both, separate them visually and label the boundary.

## Scope and consequences

State whose settings these are and what they affect: this user, this workspace, this project, or everyone. Scope is the single most common source of settings mistakes.

Where a setting affects other people, say so at the setting. Where a change is not reversible, say so before it is committed rather than after.

Show inherited and overridden values explicitly, including where the inherited value came from and how to return to it.

Settings that change access, billing, visibility, or data retention deserve confirmation proportionate to their consequence, and a record of what changed.

## Destructive settings

Group account- or object-level destructive actions — delete, transfer, revoke, reset — in one clearly separated region at the end of the page, away from routine controls.

Follow the Destructive actions pattern for confirmation and recovery. Do not place a delete action adjacent to a frequently used toggle.

## Feedback and failure

Confirm saves close to the affected setting, not only with a global message. On failure, restore the visible control to its actual stored value and explain what happened — a toggle that stays flipped after a failed write is a lie about system state.

## Accessibility

Each row's control is programmatically associated with its label and its description. Section headings are real headings so the page can be navigated structurally.

Announce immediate-save results when the user cannot see the confirmation, and keep the reason a setting is unavailable available to assistive technology, not only in a tooltip.

## Avoid

- Grouping settings by the system that implements them.
- Mixing immediate and explicit save models in one section.
- A Switch in a section that is committed with a Save button.
- Settings whose current value cannot be read without opening a control.
- Disabled rows with no explanation of why they are unavailable.
- The same setting editable in two places with no single source of truth.
- Destructive actions mixed in with routine preferences.
- A toggle that stays in its new position after the write failed.
- Settings pages that use the full page width for a column of short rows.
