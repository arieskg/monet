---
title: "Master-detail workspace"
summary: "Pair a persistent selectable list with a detail or editor panel that keeps stable geometry across every state."
status: "selected"
tags: ["layout","navigation","collections"]
order: 6
updated_at: "2026-09-02T17:30:00.000Z"
components: ["list","data-table","tree","search-input","button","alert","empty-state","skeleton"]
foundations: ["layout","spacing","interaction","breakpoints","color"]
---

# Master-detail workspace

Use a master-detail workspace when users move repeatedly between items in one collection and need the collection to stay visible while they work. It is the right shape when comparison, rapid switching, or keeping one's place matters more than giving the item the full width of the screen.

Do not use it when items are consumed one at a time and rarely compared, when the detail view needs the whole viewport, or when the collection is small enough that a plain list and a separate page are simpler.

## Structure

The master is the collection column and the detail is the panel beside it. The master is a List by default; it is a Data Table when the collection needs sorting, selection, or row actions, and a Tree when the collection is genuinely hierarchical. Above it sit the collection's own search and filters.

The detail is a region of the page, not a component in a collection. It is not a Card: a card is a bounded summary repeated across a set, and the panel is the page's second column. Give it a heading, its own scroll region, and its own actions instead of a card's border and padding.

The Sidebar is not the master. Sidebar is the product's primary destination navigation and belongs to the app shell; the workspace sits inside that shell, and a collection rendered in the sidebar is navigation, not a selectable collection with a detail panel beside it.

## Geometry

The workspace lives inside the standard page container and starts at the same horizontal origin as the page header. It does not define its own outer margins, gutters, or maximum width.

The list column keeps a consistent width across every section that uses this pattern. The detail panel fills the remaining space. Neither column is centered independently.

Empty, loading, selected, and error states preserve the same geometry. Nothing about the workspace should move when a selection changes — only the detail panel's contents change.

## Selection

Selection is persistent state, not hover. A selected row keeps its selected treatment while the pointer is elsewhere and while the pointer is over it. Use the selected surface plus a second non-color signal so the current item is identifiable without color.

Reflect the selection in the URL so a detail view can be linked, reloaded, and reached by browser back. The list scroll position and any active search or filter survive navigating into an item and back.

Support keyboard traversal of the list: up and down move the selection, Enter opens or focuses the detail panel, and focus never jumps to the detail panel on its own while the user is scanning.

Preserve the selection when the collection refreshes. If the selected item disappears, say so in the detail panel rather than silently selecting a neighbour.

## Detail panel

The detail panel owns its own header, its own primary action, and its own scroll. The page header describes the section; the panel header describes the item.

When the panel is an editor, keep unsaved work safe: warn before switching items with pending changes, or save explicitly and predictably. Do not silently discard edits because the selection moved.

Long detail content scrolls within the panel while the list stays in place. Both columns scroll independently.

## States

With nothing selected, the detail panel shows a short prompt explaining what selecting an item will do. This is orientation, not an empty state for the collection.

With an empty collection, the empty state belongs in the list column and explains how to create the first item; the detail panel stays quiet rather than repeating the message.

While the detail loads, keep the list interactive and show the loading treatment inside the panel only. A slow detail request must never block switching items.

When the detail fails to load, keep the list and the selection intact and offer retry inside the panel. Do not replace the whole workspace with a page-level error.

## Narrow layouts

Below the medium breakpoint, show one column at a time: the list is the default view, and selecting an item navigates to the detail with an explicit way back. Do not squeeze both columns into a width where neither is usable.

The URL is what makes this work — the same route that shows a split view on a wide screen shows the detail view on a narrow one.

## Avoid

- Using the app shell's Sidebar as the master column instead of a collection column inside the workspace.
- Wrapping the detail panel in a Card, or rendering the master column as a grid of cards.
- Redefining the page's horizontal origin, gutters, or maximum width inside the workspace.
- A list column whose width changes between sections or between states.
- Selection that is indistinguishable from hover, or that is communicated by color alone.
- Losing list scroll position, search, or filters when returning from a detail view.
- Auto-selecting the first item in a way that hides an empty or error condition.
- Discarding unsaved edits when the selection changes.
- Blocking the whole workspace while one detail panel loads or fails.
- Shrinking both columns instead of collapsing to one on narrow viewports.
