---
title: "Forms"
summary: "Collect input with clear labels, honest validation, preserved work, and one obvious way to commit."
status: "selected"
tags: ["input","validation"]
order: 0
updated_at: "2026-09-02T00:00:00.000Z"
components: ["field","label","text-input","textarea","select","checkbox","radio","switch","fieldset","button"]
foundations: ["spacing","typography","color","interaction","layout"]
---

# Forms

Use a form when the user supplies structured input that the system will act on. The form's job is to make the required input obvious, make mistakes recoverable, and make the commit action unambiguous.

## Structure

Give every field a visible label above the control. Placeholder text is not a label: it disappears exactly when the user needs it, it fails contrast, and it does not survive autofill.

Keep a single column for the main flow. Multiple columns break the vertical scan and force users to re-read for order. Pair fields side by side only when they form one value the user thinks of together, such as a date range, a city and postal code, or an amount and its currency.

Use section headings only when they change what a user is thinking about. If a group needs a heading merely to look organized, spacing alone is enough. Use Fieldset when a group of controls shares one question, such as a radio group or a set of related checkboxes.

Order fields by the user's mental model, not the database schema. Put the fields that determine other fields first.

## Labels and help

Label the value, not the widget: `Project name`, not `Enter project name`. Use sentence case and no trailing colon.

Mark the smaller set. If most fields are required, mark the optional ones; if most are optional, mark the required ones. Do not do both.

Put descriptions directly under the label, above the control, so they are read before the user starts typing. Put format hints there too, and prefer accepting several formats over demanding one.

Keep helper text short enough that it does not become the reason the form looks long. If an explanation needs a paragraph, the field probably needs a better label or a different control.

## Choosing a control

Use Text Input for short freeform values and Textarea when the expected value has more than one line. Use Select for one choice from a known, stable list; Radio when there are few options and comparing them matters; Checkbox for independent yes/no values; Switch only for a setting that takes effect immediately. Use Combobox or Autocomplete when the list is long enough that typing is faster than scanning.

Do not use a Switch inside a form that is committed with a Save action — a switch that does not apply immediately contradicts what it looks like it does. Use a Checkbox there instead.

## Validation

Validate on submit for the whole form, and validate a single field on blur only after the user has finished with it. Do not show an error while the user is still typing a value for the first time; do clear an error as soon as the input becomes valid.

Say what needs to change, not that something is wrong. `Enter a complete email address` beats `Invalid input`. Put the message adjacent to the field it describes and associate it programmatically with that control.

Preserve every entered value when validation fails. Never clear a field, a selection, an uploaded file reference, or a scroll position because something else on the form was rejected.

When several fields fail at once, make each error visible at its field. Move focus to the first invalid field on submit, and add a form-level summary only when errors could otherwise be off-screen.

Do not rely on red alone. Pair the danger boundary with a message, and keep the focus ring visible over it.

## Committing

Give a form exactly one primary action, at the end of the flow, labeled with what it does: `Save changes`, `Create project`, `Send invite`. Cancel and other exits stay lower emphasis.

Never disable the submit button to express that the form is incomplete — the user then has no way to find out what is missing. Let them submit and show them where the problems are.

While a submission is in flight, show the pending state on the initiating control, keep its dimensions stable, and prevent repeat activation. On success, say what happened and move the user forward; on failure, keep them where they are with their work intact.

Support Enter to submit a single-line form. In a Dialog, the primary action is the default action.

## Long and destructive forms

Split a form into steps only when the steps are genuinely sequential and the user cannot usefully complete later ones first. Otherwise a long single form is faster than a wizard.

Warn before discarding unsaved work when the user navigates away, and describe what will be lost. Place destructive actions such as delete outside the normal save flow.

## Accessibility

Every control has a programmatically associated label. Group related controls with Fieldset and a group label. Preserve logical tab order and visible focus, and keep the focus ring visible on invalid fields.

Announce validation results when the user cannot see them, and keep error text available long enough to act on. Do not use a disappearing message as the only report of a failed submission.

## Avoid

- Placeholder text as the only label.
- Multi-column layouts for fields that are not one combined value.
- Disabling submit until the form is valid.
- Validating a field before the user has finished entering it.
- Clearing entered values, selections, or uploads after a failed submission.
- Errors that state a value is invalid without stating what is expected.
- Marking both required and optional fields.
- A Switch inside an explicitly saved form.
- Wizards for tasks that fit on one screen.
- Two primary actions competing to commit the same form.
