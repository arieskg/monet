---
title: "Make the whole product feel like one product"
order: 7
updated_at: "2026-09-02T00:00:00.000Z"
---

# Make the whole product feel like one product

Reuse established terminology, components, interactions, spacing, and visual treatments so knowledge transfers across the interface.

**Why it matters.** Consistency is compounding: every screen that behaves like the last one makes the next one free to learn. It is also what makes a design system worth having — the value is not that each screen is good, it is that they are the same kind of good. Local optimizations that break the shared language usually cost more elsewhere than they gain where they were made.

**How to apply.**

- Resolve conflicts in Monet's authority order: Principles, then resolved Foundations, then explicit component preferences, then Patterns, then source inspiration.
- Use semantic tokens rather than raw values. A hard-coded hex or pixel value is a decision that cannot be themed or corrected system-wide.
- Reuse the same word for the same concept everywhere — in labels, headings, empty states, errors, and documentation.
- Keep repeated multi-component structures as patterns. If a layout appears on three screens, it is a pattern, not three layouts.
- Adapt a source inspiration to Monet, never the reverse. Sources inform anatomy, behavior, and character; they do not override foundations.

**Avoid.**

- Screen-specific spacing, widths, or radii that redefine the shared page geometry.
- Two components that do the same job with different names or different interaction models.
- Mixing several source systems' visual languages inside one surface.
- Introducing a new value when an existing token is close enough to serve.
