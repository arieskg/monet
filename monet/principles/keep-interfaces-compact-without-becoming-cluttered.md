---
title: "Keep interfaces compact without becoming cluttered"
order: 5
updated_at: "2026-09-02T00:00:00.000Z"
---

# Keep interfaces compact without becoming cluttered

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
