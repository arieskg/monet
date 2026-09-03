---
title: "Keep primary actions obvious"
order: 2
updated_at: "2026-09-02T00:00:00.000Z"
---

# Keep primary actions obvious

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
