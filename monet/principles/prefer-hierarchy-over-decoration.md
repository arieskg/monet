---
title: "Prefer hierarchy over decoration"
order: 4
updated_at: "2026-09-02T00:00:00.000Z"
---

# Prefer hierarchy over decoration

Establish structure with typography, spacing, position, contrast, and scale before adding containers, borders, shadows, or fills.

**Why it matters.** Decoration is the expensive way to say what layout can say for free. Borders and shadows accumulate into visual noise, they multiply the surfaces a theme has to keep coherent, and they still do not tell a user which of two adjacent things matters more. Type scale and whitespace do, and they survive density changes, responsive reflow, and theming.

**How to apply.**

- Group related content with spacing first. Add a border only when spacing cannot express the boundary, and a surface or elevation only when the content genuinely sits on a separate plane.
- Use the type scale for rank. A heading one step up communicates more reliably than the same text in a colored box.
- Reserve elevation for things that float — menus, popovers, dialogs, drag surfaces. Static cards and page sections do not need shadows.
- Keep contrast meaningful: strong foreground for content that carries the message, muted foreground for supporting metadata. Do not introduce a third intermediate value per screen.
- Use one radius family within a region and avoid nesting two rounded surfaces with nearly equal radii.

**Avoid.**

- Cards inside cards, or a border and a shadow and a background doing the same separation job.
- Color used as the primary hierarchy tool where weight or size would work.
- Section dividers between groups that spacing has already separated.
- Adding a container to make a region "look designed" when its content needs no boundary.
