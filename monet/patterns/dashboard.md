---
title: "Dashboard"
summary: "Answer a small number of known questions at a glance, with honest numbers, a visible time range, and a path from every metric to its detail."
status: "selected"
tags: ["data","overview","density"]
order: 12
updated_at: "2026-09-02T00:00:00.000Z"
components: ["statistic","card","chart","sparkline","data-table","badge","select","skeleton","empty-state"]
foundations: ["layout","spacing","typography","color","interaction","breakpoints"]
---

# Dashboard

A dashboard exists to answer specific questions quickly: is anything wrong, what changed, and where do I go next. It is not a place to display every metric the system can produce.

Start by naming the questions. If a tile does not help answer one of them, it does not belong — that is the entire discipline of the pattern.

## Structure

Lead with the smallest set of headline numbers that establishes status, arranged left to right in the order users scan. Below them, put the trends and breakdowns that explain those numbers, and below that, the records that need attention.

Do not wrap every tile in a card. Use spacing and typography to group first, and reserve surfaces for regions that genuinely sit on a separate plane or need their own scroll.

Use the wide content width inside the standard page shell. Keep tile heights consistent within a row so the grid does not appear ragged.

Keep the dashboard to one screen of primary content where possible. A dashboard that requires scrolling to find the alarming number has failed at its job.

## Metrics

Give every number a label that says what it measures and over what period. A number without a period is not interpretable.

Show change against a stated comparison — previous period, target, or baseline — and say which. An arrow with a percentage and no comparison basis is noise.

Do not color a delta green or red until you know which direction is good for that metric. Cost going down and revenue going down are not the same event. Pair any directional color with an arrow or a word.

Round consistently and keep units visible. Use tabular figures so numbers stay aligned as they update.

State freshness where it affects decisions: when the data was last updated, and whether the current period is partial. A partial period compared against a complete one is the most common way a dashboard misleads.

## Charts and drill-down

Use a sparkline when the shape of a trend adds context to a headline number, and a full chart when the user needs to read values off it. Do not use a chart where a single number is the answer.

Every metric leads somewhere. A tile that reports a problem must offer a way to the records behind it — a filtered table, a detail view, a log. A dashboard that cannot be drilled into is a report.

Carry the dashboard's time range and filters into the destination so the user arrives at the same slice of data they clicked on.

## Time range and filters

Put one time-range control at the top, applying to the whole dashboard, and make the active range visible without opening it. Where a tile uses a different period, label that tile explicitly.

Keep the range and filters in the URL so a dashboard state can be shared and restored. Follow the Filtering pattern for the controls themselves.

## Loading, empty, and error states

Load tiles independently and keep the grid's geometry stable while they arrive. Use skeletons matching each tile's final size so nothing shifts.

When one tile fails, show the failure in that tile and leave the rest working. Never replace a whole dashboard with a page-level error because one query timed out.

Distinguish "zero" from "no data" from "failed to load". Zero is a real answer and is displayed as a number; the other two are not.

For a genuinely new account, show what the dashboard will contain and what to do to populate it, rather than a grid of zeros.

## Refresh

If the dashboard refreshes on its own, say when it last updated and keep the interval calm. Do not shift layout, move focus, or reset a user's scroll position on refresh.

Preserve visible values during a background refresh and replace them only when new data arrives.

## Responsive behavior

Reflow tiles into fewer columns at the shell's breakpoints, preserving the scan order — status first, then explanation, then records. Charts shrink; they do not become unreadable. On narrow viewports, prefer stacking a chart under its headline number over squeezing them side by side.

## Accessibility

Every metric has a text label and a text value; do not rely on a chart or a colored delta to carry the number. Provide the underlying values for charts in an accessible form.

Do not use color alone for status. Pair it with a label, an icon, or a shape.

## Avoid

- Tiles that do not answer a question the dashboard exists to answer.
- Deltas without a stated comparison period.
- Directional color applied before deciding which direction is good.
- Comparing a partial period against a complete one without saying so.
- Metrics with no path to the records behind them.
- Per-tile time ranges with no global control, or a global range that silently does not apply everywhere.
- Cards wrapped around every number.
- A page-level error because one tile's query failed.
- Showing zeros where the real state is "no data yet".
- Auto-refresh that moves layout, focus, or scroll position.
