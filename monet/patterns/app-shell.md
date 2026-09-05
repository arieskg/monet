---
title: "App shell"
summary: "One persistent frame — navigation, page header, and content region — that every primary page inherits instead of defining its own geometry."
status: "selected"
tags: ["layout","navigation","structure"]
order: 7
updated_at: "2026-09-03T00:00:00.000Z"
components: ["sidebar","navigation-menu","breadcrumb","container","button","search-input","avatar","banner"]
foundations: ["layout","spacing","breakpoints","layering","interaction","elevation"]
---

# App shell

The app shell is the frame every primary page sits inside: persistent navigation, an optional global bar, a page header, and the content region. It is a product-level contract, not a per-page layout choice.

## The contract

Primary pages do not define their own outer margins, gutters, or maximum width. They receive the shell's page container and place content inside it.

The page eyebrow, title, description, header actions, any divider, and the primary content region share one horizontal origin. A page whose header starts at a different offset than its content is the most visible sign the shell has been bypassed.

Content width varies inside the shell; page geometry does not. Use the narrow content width for prose, forms, and settings, the default width for most pages, and the wide width for dashboards and dense tables. Changing content width must never change the page's outer alignment.

## Regions

Primary navigation is persistent and identifies where the user is in the product. Keep its width stable — a navigation region that resizes as the user moves between sections makes the whole workspace feel unstable.

The page header carries the page's identity and its page-level primary action. Section- and item-level actions belong to the region or panel they affect, not to the page header.

A product-wide Banner belongs to the shell rather than to a page: it renders once, beneath the global bar and above the content region, and every route inherits it. Reserve its space so content does not jump when it appears, and show at most one — a stack of banners is a noticeboard nobody reads.

The content region owns its own scrolling. When the shell has a sticky header or toolbar, it uses the sticky layer, and only genuinely persistent controls go there. Sticky regions must not consume so much height that the content area stops being usable.

A shell has at most one persistent secondary navigation region. If a section needs more structure than that, it needs tabs or a master-detail workspace inside the content region, not a third rail.

## Responsive behavior

Design the shell mobile-first and change it at page-level breakpoints, not per component.

Below the large breakpoint, collapse persistent navigation to a temporary surface — a drawer or a menu — with an obvious trigger. Collapse or replace secondary navigation before squeezing the main content region below a usable width.

Below the medium breakpoint, the shell is single-column: navigation is temporary, the page header stacks, and header actions collapse into an overflow control while the single most important action stays visible.

Never hide primary navigation without leaving a persistent, labeled way to open it. Never make the shell horizontally scrollable; let individual dense regions scroll instead.

Preserve the collapsed or expanded navigation state across navigations within a session.

## Navigation state and continuity

The shell reflects the current location: the active navigation item, the breadcrumb trail, and the page title agree with each other and with the URL.

Navigating between pages replaces the content region, not the shell. Navigation, global search, and account controls stay mounted and interactive while a page loads.

Global feedback such as toasts uses the toast layer and is positioned by the shell, not by individual pages.

## Avoid

- Pages that center their own content with a different maximum width than the shell.
- A page header and content region that start at different horizontal origins.
- Navigation whose width changes between sections.
- Re-rendering or blanking the whole shell during in-app navigation.
- Sticky headers and toolbars that stack until the content region is a narrow strip.
- Hiding primary navigation on narrow viewports with no persistent way to reopen it.
- A third persistent navigation rail instead of tabs or a master-detail workspace.
- Page-level primary actions placed inside a region they do not control.
