---
title: "Filtering"
summary: "Narrow a collection while keeping active constraints visible, understandable, and easy to reverse."
status: "selected"
tags: ["collections","search"]
order: 1
updated_at: "2026-09-01T21:50:41.057Z"
components: ["search-input","select","checkbox","data-table","tag"]
foundations: ["spacing","layout"]
---

# Filtering

Use filtering to help users narrow a collection without losing context about what is currently included or excluded.

## Behavior

Apply filters promptly when the result can update quickly and predictably. Avoid unnecessary Apply buttons unless the filtering operation is expensive, requires several coordinated choices, or users need to review changes before committing them.

Keep active filters visible near the collection or result count so users can understand why the current result set looks the way it does. Make each active constraint individually removable when practical, and provide one clear way to reset all filters.

Preserve filter state while users inspect individual results and return to the collection. Do not make users rebuild the same filter configuration after navigating away and back.

## Choosing filter controls

Use Search Input for freeform text narrowing, Select for a single known choice, Checkbox for multiple independent choices, and Tag for compact representation of active filters. Use more specialized controls when the data type requires them rather than forcing every filter into a generic dropdown.

Prefer controls that make available choices understandable before interaction. Avoid hiding common filters behind menus when there is enough space to show them directly.

## Layout

Place the most frequently used filters closest to the collection they affect. Keep related filters grouped together and separate unrelated filter groups through spacing before adding additional containers or borders.

On wide layouts, persistent filter controls may sit above or beside the collection when they materially improve repeated filtering. On narrow layouts, collapse secondary filters into a temporary panel or drawer while keeping the current active-filter state visible.

Do not allow filtering controls to consume more visual attention than the results themselves.

## Active filters

Represent active constraints clearly and consistently. When tags are used, each tag should describe the applied constraint rather than only the filter category. For example, prefer `Status: Active` over `Status`.

Allow users to remove an active filter without reopening the original control when practical. If several filters are active, provide a clear reset-all action without making it more prominent than ordinary result actions.

## Result feedback

Show the effect of filtering promptly and keep the result count updated when useful. Preserve a stable layout while results change so the interface does not jump unnecessarily.

If filtering produces no results, explain that the current constraints returned nothing and provide an obvious path to loosen or clear filters. Do not present the normal empty-state message for an intrinsically empty collection when the actual cause is filtering.

Use loading feedback when filter changes require a noticeable asynchronous request. Avoid blocking the entire page when only the collection needs to update.

## Search and filters

When search and structured filters work together, make their combined effect understandable. Clearing search should not silently remove unrelated structured filters, and clearing structured filters should not erase an intentional search query unless the product explicitly treats them as one combined operation.

## Defaults

Use neutral defaults that avoid unexpectedly hiding data. Preselected filters should exist only when they reflect a strong product expectation or saved user preference. Make non-obvious defaults visible so users understand that the collection is already constrained.

## Accessibility

Give every filter control an accessible name and preserve logical keyboard navigation. Announce meaningful result-count changes when appropriate without creating excessive screen-reader chatter. Do not rely on color alone to indicate active filters.

## Avoid

- Hiding active filters so users cannot explain the current result set.
- Requiring an Apply action for simple, fast filters without a clear reason.
- Resetting filters when users navigate into a result and return.
- Using placeholder text as the only label for filter controls.
- Mixing search, sorting, and filtering concepts without making their roles clear.
- Showing a generic empty state when filters are the reason no results remain.
- Providing multiple competing reset or clear actions.
- Exposing every possible filter at once when common filters can remain visible and advanced filters can be progressively disclosed.
