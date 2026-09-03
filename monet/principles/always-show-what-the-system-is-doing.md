---
title: "Always show what the system is doing"
order: 3
updated_at: "2026-09-02T00:00:00.000Z"
---

# Always show what the system is doing

Loading, saving, errors, selections, changes, and system state must have visible, honest feedback. If the system knows something that changes what a user should do next, the interface says so.

**Why it matters.** Uncertainty produces the worst user behavior: duplicate submissions, abandoned tasks, and mistrust of data that is actually correct. Feedback is also the cheapest form of error prevention — a visible pending state prevents the second click that creates the duplicate record.

**How to apply.**

- Acknowledge every action that is not instantaneous, close to the control that started it, and prevent repeat activation while a non-idempotent request is in flight.
- Keep loading, empty, error, and unavailable states distinct. They mean different things and lead to different next steps.
- Report the outcome the system actually observed. If a result is unknown, say it is unknown rather than guessing success or failure.
- Make current state visible without interaction: which row is selected, which filters are applied, which tab is active, whether content is stale.
- Never communicate state through color, motion, or position alone. Pair the visual signal with text or accessible semantics.

**Avoid.**

- Silent success, silent failure, or a spinner that outlives the request that started it.
- Fabricated progress percentages for work that cannot report progress.
- Optimistic UI that shows a result the system has not accepted, with no correction path.
- Important, actionable information delivered only through a message that disappears.
