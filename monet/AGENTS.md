# Design-system instructions

This workspace defines a design system. When a project adopts it, these records are
canonical for that project's UI — they are not automatically canonical for any
repository that happens to contain them.

This is the bundled **starter workspace** shipped with Monet as a worked example.
Copy it and point `MONET_ROOT` at your copy rather than editing it in place; Monet's
tests use this directory as a fixture.

Before creating or modifying UI:

1. Read `DESIGN_SYSTEM.md`, then the relevant files in `principles/` for overall design philosophy.
2. Read the relevant `foundations/` records for concept, rationale, and usage guidance.
3. Read `themes/config.json`, resolve the selected override-only theme over Base Monet, and use its provenance-aware export in `tokens/themes/`. Never copy a theme value back into a base Foundation.
4. Use the canonical token records in Foundations and the resolved exports in `tokens/` for color, spacing, typography, sizing, radius, borders, elevation, opacity, motion, breakpoints, and layering. Prefer semantic tokens over raw values when one exists.
5. Consult `taxonomy/primitives.json` and `primitives/decisions.json` for low-level composition, interaction, visual, and accessibility conventions.
6. Identify relevant canonical components in `taxonomy/components.json`. Components inherit Principles, resolved Foundations, and Patterns; apply their selection, preferences, notes, and only genuinely relevant Advanced deviations without treating empty Advanced fields as missing requirements.
   - A preference is a compact setting, not prose: one short phrase, at most 80 characters. `token:<name>` names a Monet token — resolve it in `tokens/` and use that value rather than inventing one. `density` is `compact`, `comfortable`, or `spacious`; `radius` and `elevation` always name a token, except `elevation: none`. Reasons live in the record's rationale, notes, behavior, `use_when`, and `avoid_when`.
   - A component whose status is `undecided` has no `selection`. Its `candidates` are the sources that were available, not a choice Monet made. Surface the decision instead of treating a candidate as approved.
7. Follow relevant multi-component guidance in `patterns/`.
8. Do not substitute arbitrary values or UI styles when a Monet standard exists.
9. Treat every external system in `sources/registry.json` as inspiration, not a dependency, unless the target project explicitly adopts it.
10. Adapt implementation to the target framework while preserving the documented visual, interaction, accessibility, and responsive intent.
11. If guidance is undecided, invalid, or contradictory, surface the choice instead of inventing a permanent standard.

The design hierarchy is:

`Principles → Foundations + Theme overrides → Resolved tokens → Primitives → Components → Patterns`

## Authority

When decisions conflict, resolve in this order:

**Principles → resolved Foundations (base + selected Theme) → explicit component preferences → Patterns → source inspiration**

Source inspiration never overrides Foundations or Principles. A selected source such
as Ant Design, Primer, Polaris, or shadcn is a reference for anatomy, behavior,
interaction, and general character — adapt it to this system rather than adapting
this system to it, and do not copy its styling wholesale.

Use this system's established values instead of inventing alternatives. Where it has
no decision, prefer a familiar, accessible solution consistent with the rest of it.

The individual workspace files are canonical. Generated summaries are navigation aids.
