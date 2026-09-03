---
title: "Start simple and reveal complexity gradually"
order: 6
updated_at: "2026-09-02T00:00:00.000Z"
---

# Start simple and reveal complexity gradually

Keep common workflows immediately accessible and introduce advanced controls only when they become relevant or the user asks for them.

**Why it matters.** Most users do the common thing most of the time. Exposing every capability at once slows them down and makes the product look harder than it is, while hiding capability behind discovery makes power users slower forever. Progressive disclosure resolves the tension: the default path stays short, and depth stays one predictable step away.

**How to apply.**

- Design the default path for the common case and make sure it can be completed without opening anything.
- Put advanced options behind a labeled, predictable disclosure — a section, an accordion, a settings surface, a menu — not behind hover or an unlabeled icon.
- Choose sensible defaults so most users never open the advanced surface. A default that must be changed is not a default.
- Keep disclosed state visible: if advanced options are set to something non-default, surface that fact where the user is working rather than only where they were configured.
- Split long processes into steps only when the steps are genuinely sequential. Otherwise show one form.

**Avoid.**

- Wizards for tasks that fit on one screen.
- Advanced settings that silently change common behavior with no indication at the point of use.
- Progressive disclosure used to hide required input.
- Two paths to the same setting that can disagree with each other.
