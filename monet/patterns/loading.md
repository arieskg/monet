---
title: "Loading"
summary: "Preserve context, communicate honest progress, and keep the interface responsive while work completes."
status: "selected"
tags: ["feedback","performance"]
order: 4
updated_at: "2026-09-01T21:55:07.683Z"
components: ["progress","spinner","skeleton"]
foundations: ["motion","layout"]
---

# Loading

Use loading feedback when the system cannot respond immediately and users would otherwise be uncertain whether their action was received or content is still being retrieved.

## Preserve context

Keep existing content visible during refresh whenever it remains useful and accurate enough to display. Avoid replacing an entire page with a loading indicator when only one region is updating.

Update the smallest meaningful region rather than blocking unrelated parts of the interface. Users should be able to maintain orientation and continue unaffected work whenever the operation allows it.

Do not briefly replace content with an empty state while data is still loading.

## Choose the right treatment

Use a Spinner for a small localized wait with unknown duration when preserving the exact content structure is unnecessary.

Use a Skeleton when initial content is loading and approximating the eventual layout helps preserve structure, reduce visual reflow, and communicate what kind of content is expected.

Use determinate Progress only when the underlying operation can report meaningful and reasonably accurate completion. Do not fabricate percentages or progress merely to make an indeterminate operation appear measurable.

For very fast operations, avoid flashing a loading indicator that disappears almost immediately. Loading feedback should reduce uncertainty rather than introduce visual noise.

## Initial loading

For first-load experiences, preserve the expected page structure when practical. Keep stable navigation, page chrome, headings, and other already-known interface regions visible while dynamic content loads.

Skeletons should approximate the structure of the incoming content rather than act as generic decoration. Avoid excessive skeleton detail that creates more visual noise than the final interface.

## Refreshing existing content

When refreshing already-visible content, prefer keeping the current content in place while communicating that an update is occurring. Do not unnecessarily blank tables, lists, dashboards, or detail views during background refreshes.

When stale content could cause a harmful decision, clearly communicate that the data is updating or temporarily unavailable rather than presenting it as current.

## Actions and submission

When an action such as saving, submitting, deleting, or creating is processing, provide feedback close to the control that initiated it. Prevent duplicate activation when repeated requests could create duplicate or conflicting work.

A Button or Icon Button may show a loading state when the action itself is processing. Preserve the control's dimensions while loading so surrounding layout does not shift.

Do not disable unrelated controls or block the entire interface unless the operation genuinely requires exclusive interaction.

## Longer operations

For operations that may take substantial time, explain what is happening when the task would otherwise appear stalled. Use determinate progress when trustworthy progress information exists; otherwise use an indeterminate treatment with useful status text when appropriate.

If users can safely leave while work continues, do not unnecessarily trap them on the loading screen. Preserve or surface completion status when they return when the product supports it.

## Completion and failure

Replace loading feedback promptly when the operation completes. Update the affected content or state directly rather than requiring users to manually refresh.

If loading fails, replace the loading treatment with clear error feedback and an appropriate recovery action such as Retry. Do not leave a spinner running indefinitely after the system knows the request has failed.

Preserve existing usable content when a background refresh fails and clearly indicate that the latest update could not be retrieved when that distinction matters.

## Motion

Keep loading motion restrained and functional. Loading indicators should communicate ongoing activity rather than attract attention for their own sake.

Honor reduced-motion preferences. Avoid large, decorative, or continuous animations that are unnecessary to understanding progress.

## Accessibility

Communicate meaningful loading and completion states to assistive technology when users need that information. Avoid excessive announcements for frequent background updates.

Do not rely on animation alone to indicate that work is in progress. Pair loading treatment with appropriate semantics or status text when the state would otherwise be ambiguous.

## Avoid

- Blocking the entire page when only one region is loading.
- Removing useful existing content during routine refreshes.
- Showing an empty state before loading has completed.
- Flashing spinners for operations that complete almost immediately.
- Using skeletons when the eventual layout is unknown or materially different.
- Showing fabricated percentages for indeterminate work.
- Allowing repeated submission while a non-idempotent action is processing.
- Changing button or layout dimensions when entering a loading state.
- Leaving loading indicators visible after an operation has failed.
- Using decorative motion that does not improve understanding of progress.
