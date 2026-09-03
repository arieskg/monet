---
title: "Destructive actions"
summary: "Make destructive outcomes explicit and proportionate while preserving recovery whenever the action can honestly be reversed."
status: "selected"
tags: ["safety","confirmation"]
order: 2
updated_at: "2026-09-01T21:51:57.436Z"
components: ["button","alert-dialog","toast"]
foundations: ["color","spacing"]
---

# Destructive actions

Use destructive treatment for actions that permanently remove data, revoke meaningful access, discard important work, or otherwise create a significant negative consequence.

## Make the consequence clear

Name the action and its target specifically. Users should understand what will happen before they commit.

Prefer labels such as `Delete project`, `Remove member`, or `Discard changes` over vague labels such as `Confirm`, `Continue`, or `Yes`.

Explain consequences that may not be obvious, especially when an action affects related data, other users, permissions, billing, or work that cannot be restored.

## Match friction to risk

Do not interrupt every destructive action with a confirmation dialog. Add friction in proportion to the cost and reversibility of the action.

For low-cost reversible actions, perform the action directly and provide Undo when recovery is technically reliable.

For meaningful destructive actions, use a confirmation step when accidental activation could cause substantial loss or disruption.

For exceptionally high-impact or difficult-to-recover actions, require stronger confirmation only when the additional friction materially reduces risk. Do not require users to type confirmation phrases for routine deletion.

## Confirmation dialogs

When confirmation is warranted, use an Alert Dialog that clearly identifies the target and consequence. Keep the message concise and focused on the decision being made.

The destructive button must use a specific action label that matches the consequence. The safe action should be easy to identify and should not itself use destructive styling.

Do not use generic confirmation copy such as `Are you sure?` without explaining what the user is confirming.

Do not close the dialog or report success until the destructive operation has actually been accepted or completed as appropriate to the workflow.

## Placement and hierarchy

Destructive actions should not visually compete with the normal primary action unless destruction is itself the explicit purpose of the current workflow.

Separate destructive actions from frequently used routine actions when proximity could increase accidental activation. In settings and detail views, destructive actions may appear in a dedicated lower-emphasis or danger region when that improves comprehension.

Use destructive color only for genuinely destructive or critical negative actions. Do not use red merely to make an ordinary action more noticeable.

## Recovery

Prefer recovery over confirmation when recovery can be implemented reliably. After a reversible destructive action, provide clear feedback and an Undo action for a reasonable period when appropriate.

Do not offer Undo if restoration is incomplete, unreliable, or misleading. If an action is permanent, communicate that before the user commits.

Preserve unaffected user state when a destructive operation fails. Explain the failure and allow the user to retry when appropriate.

## Loading and completion

Prevent duplicate activation while a destructive operation is being processed. Show a loading state when completion is not immediate.

After success, update the interface promptly so deleted or removed content does not appear to remain available. Use transient feedback when confirmation of completion is useful, but do not require users to dismiss unnecessary success dialogs.

## Bulk destructive actions

For bulk operations, clearly communicate the scope before execution. Include the number or identity of affected items when practical.

Confirmation becomes more appropriate as the number of affected items, irreversibility, or consequence increases. Never make a bulk destructive action easier to trigger accidentally than the equivalent single-item action.

## Accessibility

Do not communicate destructive meaning through red alone. Use explicit action labels and supporting text where necessary. Preserve visible focus, logical keyboard order, and accessible names throughout confirmation and recovery flows.

When a confirmation dialog opens, move focus into it appropriately and keep keyboard interaction contained until the decision is resolved.

## Avoid

- Using destructive styling for ordinary secondary actions.
- Generic labels such as `Yes`, `OK`, or `Confirm` when a specific action label is available.
- Showing `Are you sure?` without explaining the actual consequence.
- Requiring confirmation for every trivial or easily reversible action.
- Offering Undo when the action cannot be completely restored.
- Placing dangerous actions immediately beside frequent routine actions when accidental activation is plausible.
- Using red as the only indication that an action is destructive.
- Clearing unrelated state when a destructive operation fails.
- Allowing repeated activation while a destructive request is already processing.
