---
title: "Empty states"
summary: "Explain why content is absent, preserve context, and provide the most useful next action when one exists."
status: "selected"
tags: ["onboarding","feedback"]
order: 3
updated_at: "2026-09-01T21:53:37.562Z"
components: ["empty-state","button","link"]
foundations: ["typography","spacing","layout"]
---

# Empty states

Use an empty state when a collection, view, or meaningful content region has no content to display. The state should explain the situation clearly and help users understand what they can do next without adding unnecessary decoration or copy.

## Identify the reason

Distinguish between different causes of emptiness because they require different responses.

A new empty collection should explain what belongs there and, when appropriate, provide the action needed to create or add the first item.

An empty search or filtered result should explain that the current query or constraints returned no matches and provide a direct way to modify or clear them.

A temporarily unavailable or failed collection is not a normal empty state. Use appropriate error or unavailable feedback instead of implying that no content exists.

A legitimately empty collection that requires no action may simply communicate that there is currently nothing to show.

## Content

Keep empty-state copy concise and specific. Lead with the reason the area is empty rather than a generic heading such as `Nothing here` when more useful context is available.

Use supporting text only when it helps users understand the state or next step. Avoid promotional, decorative, humorous, or overly conversational copy that makes the action harder to find.

Do not explain concepts the user already understands merely to fill empty space.

## Actions

Provide a primary action only when there is a clear and useful next step.

For a new collection, the action may create or add the first item. For filtered results, the action may clear filters. For search results, changing the query may be more appropriate than presenting an unrelated call to action.

Use one obvious primary action when one action clearly advances the user. Secondary links may provide relevant alternatives, but avoid turning the empty state into a menu of possibilities.

Do not invent an action merely because the area is empty. Some empty states are informational and require no button.

## Placement

Render the empty state in the region where content would normally appear so users can understand what is affected. Preserve surrounding navigation, filters, search, headings, and other useful context unless the empty state applies to the entire page.

Avoid replacing an entire application screen when only one collection or region is empty.

Use enough spacing to make the state easy to recognize without creating excessive unused space. Keep the composition compact in information-dense interfaces.

## Visual treatment

Prefer typography, spacing, and clear hierarchy over large decorative illustrations, oversized icons, cards, or excessive whitespace.

An icon or illustration may be used when it materially improves recognition or comprehension, but it should remain secondary to the message and next action.

Keep empty states visually quieter than populated content and primary workflows. They should provide orientation, not become the most visually prominent element in the product.

## Search and filtering

Do not treat zero filtered results as though the underlying collection is empty. Preserve the active search query and filters so users can see why no results remain.

Provide an obvious way to loosen or clear the relevant constraints. Do not automatically clear filters or search terms without user intent.

If the underlying collection itself contains no items, use the new-collection empty state rather than filter-specific messaging.

## Loading and errors

Do not show an empty state while content is still loading if doing so could briefly imply that no data exists. Use the appropriate loading treatment until the system knows the collection is actually empty.

Do not use an empty state for network failures, permission problems, or unavailable services. Communicate the actual problem and recovery path instead.

## Accessibility

Use meaningful text rather than relying on an illustration or icon to explain the state. Ensure actions use descriptive accessible labels and maintain logical keyboard order and visible focus.

When content changes dynamically from populated to empty, provide appropriate feedback when users would otherwise be unable to understand what changed.

## Avoid

- Using the same message for new, filtered, searched, failed, and unavailable states.
- Generic copy such as `Nothing here` when the reason can be stated more clearly.
- Large decorative illustrations that compete with the next action.
- Adding a primary button when there is no meaningful next step.
- Hiding useful search or filtering context when those constraints caused the empty result.
- Automatically clearing filters or search terms to avoid showing zero results.
- Showing an empty state while data is still loading.
- Treating errors, permission problems, or unavailable services as empty content.
- Filling empty space with unnecessary explanatory or promotional copy.
