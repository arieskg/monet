---
title: "Navigation"
summary: "Choose the navigation control that matches the relationship between destinations, and keep location, URL, and active state in agreement."
status: "selected"
tags: ["navigation","structure","wayfinding"]
order: 8
updated_at: "2026-09-02T00:00:00.000Z"
components: ["sidebar","navigation-menu","tabs","breadcrumb","menubar","link","dropdown-menu","command-palette"]
foundations: ["interaction","color","typography","spacing","layout"]
---

# Navigation

Navigation answers three questions at once: where am I, where else can I go, and how do I get back. Choose the control by the relationship between destinations, not by how much space is available.

## Choosing the control

Use **Sidebar or Navigation Menu** for the product's top-level sections. These are peers that persist across the whole application and rarely change.

Use **Tabs** to switch between peer views of the same subject, where the surrounding page identity does not change. Tabs are not a page-level router and not a sequence — a task with an order needs a Stepper.

Use **Breadcrumb** to express containment in a hierarchy that is genuinely nested and more than two levels deep. A breadcrumb for a flat structure is decoration.

Use a **Dropdown Menu** for a set of actions or for destinations that are too numerous or too infrequent to show. Use a **Menubar** only for application-style products with many grouped commands.

Use a **Command Palette** as an accelerator layered on top of real navigation, never as a replacement for it.

Prefer showing common destinations directly over collapsing them into a menu when the space exists. A menu costs a click and a memory lookup every time.

## Hierarchy and depth

Keep primary navigation to one level of nesting. A third level means the information architecture, not the control, needs work — move the extra depth into the section's own page as tabs or a master-detail workspace.

Group navigation items only when the groups mean something to users. Unlabeled groups separated by spacing are usually better than labeled groups that restate the obvious.

Order items by frequency of use, not alphabetically, unless the list is long enough that alphabetical scanning is genuinely faster.

## Active state

Exactly one item is active at each level. When a nested item is active, its parent shows an ancestor treatment that is visibly weaker than the active item itself.

Active state is persistent selection: use the selected surface with a second non-color signal, keep it distinguishable from hover, and keep it while the pointer is elsewhere.

The active item, the breadcrumb, the page title, and the URL always agree. If they can disagree, the route is the source of truth.

## Links and behavior

Every destination is a real link with a real URL. Middle-click, copy link, open in new tab, and browser back all work. Do not implement navigation as a click handler on a button.

Use Link for navigation and Button for actions. A control that changes the address is a link, whatever it looks like.

Preserve scroll position and view state when navigating back to a collection. Do not reset filters, search, or pagination because the user visited an item.

Never trap a user: every destination reachable by navigation has a way back that does not require the browser's back button.

## Responsive behavior

Collapse navigation at the shell's breakpoints, not per control. Tabs that overflow scroll horizontally or move the overflow into a menu; they do not wrap into a second row that changes the page's height.

An icon-only collapsed navigation still needs accessible names and a tooltip on hover and focus. Do not rely on the icon alone to identify a destination.

## Accessibility

Mark the current item with `aria-current` in addition to its visual treatment. Give each navigation region a distinct accessible name when a page has more than one.

Tabs follow the standard keyboard model: arrow keys move between tabs, and the tab key moves into the panel. Do not reimplement this with click handlers only.

Provide a skip link to the main content region when persistent navigation precedes it in the DOM.

## Avoid

- Tabs used as top-level page routing, or as a sequence of steps.
- Breadcrumbs on a flat or two-level structure.
- More than one level of nesting inside primary navigation.
- Navigation implemented as buttons, so links cannot be opened, copied, or restored.
- Active state that is indistinguishable from hover, or communicated by color alone.
- Multiple items appearing active at the same level.
- Losing scroll position, filters, or pagination when returning to a collection.
- Icon-only navigation without accessible names.
- Treating a command palette as a substitute for discoverable navigation.
