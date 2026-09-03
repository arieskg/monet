---
title: "Data tables"
summary: "Present many records so they can be scanned, compared, sorted, selected, and acted on without losing position or context."
status: "selected"
tags: ["collections","data","density"]
order: 10
updated_at: "2026-09-02T00:00:00.000Z"
components: ["data-table","table","pagination","checkbox","dropdown-menu","badge","empty-state","skeleton","tag"]
foundations: ["spacing","typography","borders","layout","interaction","color"]
---

# Data tables

Use a table when users compare values across records along shared attributes. If records are read one at a time and their fields are not compared, a list or a set of cards communicates better.

Distinguish a display table from a data table. A display table presents a small fixed set of values. A data table adds sorting, selection, row actions, pagination, and column control, and it carries the responsibility to preserve the user's position across all of them.

## Columns

Show the columns that support the decision the table exists for. Additional attributes belong in the row's detail view, not in a horizontally scrolling wall of columns.

The first column identifies the record and is the link into it. Keep it leftmost and never let it scroll out of view horizontally.

Align by data type: text left, numbers right, and dates in a consistent format left-aligned unless they are being compared numerically. Right-aligned numbers with consistent decimal places are what makes columns comparable at a glance; centered numbers are not.

Use tabular figures for numeric columns so digits align across rows.

Size columns by content. Give the identifying column the space it needs and truncate long secondary values with a way to see the full value. Do not truncate the column users came to read.

## Density and structure

Use the compact control size and compact row height. Tables are where density earns its keep.

Prefer horizontal row dividers over full grid lines and zebra striping. Vertical rules and alternating fills add visual noise that alignment already handles.

Keep row height uniform. A row that grows because one cell wrapped destroys the scanning rhythm that makes a table readable.

Keep the header row visually distinct and sticky when the table scrolls, so column meaning survives scrolling.

## Sorting

Show which column is sorted and in which direction, at all times, including the default. A table with an invisible default sort is a table whose order looks arbitrary.

Sort the whole dataset, not the current page. Page-scoped sorting is almost always a bug from the user's point of view.

Preserve sort state across navigation into a record and back, and reflect it in the URL alongside filters and pagination.

## Selection

Use checkboxes in a leading column. The header checkbox selects the current page and says so; selecting everything across pages is a separate, explicit action with an explicit count.

Show the selection count and the available bulk actions in a persistent region near the table rather than in a bar that appears and shifts the layout.

Preserve selection while paging where the product supports acting across pages, and clear it explicitly and visibly when filters change enough that the selection would be misleading.

Bulk destructive actions state their scope before executing. Never make the bulk action easier to trigger than the single-row equivalent.

## Row actions

Put the one or two most common row actions inline and the rest in a menu at the end of the row. Keep the action column's position and width fixed so it does not move between rows.

Do not reveal row actions on hover only. They must be reachable by keyboard and on touch.

Making the whole row a link and also placing controls inside it is a conflict. If the row navigates, keep the interactive cells small, explicit, and non-overlapping.

## Paging and loading

Prefer pagination over infinite scroll for tables: it gives a stable position, a knowable total, and a linkable page. Keep page size and page number in the URL.

While loading, keep the header and page structure and use skeleton rows that match the real row height so nothing shifts when data arrives. During a refresh of already-visible data, keep the rows in place rather than blanking the table.

If the underlying data changes while the user is working, do not reorder rows underneath them. Offer to refresh instead.

## Empty and error states

Render the empty state in the table body, keeping the header, search, and filters visible so the user can see what produced the result.

Distinguish an empty collection from a filtered result with no matches, and give the filtered case a direct way to loosen the constraints. Do not present a load failure as an empty table.

## Responsive behavior

A table stays a table. Let it scroll horizontally inside its own container with the identifying column pinned, rather than reflowing columns into stacked labels that break comparison.

If comparison genuinely does not survive the narrow viewport, switch to a list of records showing the two or three fields that matter, with the full record one tap away. Choose one of these approaches per table and apply it consistently.

## Accessibility

Use real table semantics with header cells associated to their columns. Expose sort state on the column header, and give every row checkbox and icon-only row action an accessible name that identifies its record.

Announce the result count when filtering or paging changes it, without announcing on every keystroke.

## Avoid

- Sorting or filtering only the current page.
- A default sort order that is not shown.
- Row actions that appear only on hover.
- Row heights that vary with content.
- Zebra striping and full grid lines instead of alignment and row dividers.
- Centered or proportionally-spaced numeric columns.
- A select-all checkbox whose scope is ambiguous.
- Losing sort, filters, pagination, or scroll position when returning from a record.
- Reordering rows under the user during a background refresh.
- Reflowing a comparison table into stacked cards on narrow viewports.
- Presenting a failed request as an empty table.
