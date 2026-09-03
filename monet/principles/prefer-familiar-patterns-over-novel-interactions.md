---
title: "Prefer familiar patterns over novel interactions"
order: 0
updated_at: "2026-09-02T00:00:00.000Z"
---

# Prefer familiar patterns over novel interactions

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
