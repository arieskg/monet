---
title: "Error handling"
summary: "State what failed, preserve user work, and provide the clearest available path to recovery."
status: "selected"
tags: ["feedback","recovery"]
order: 5
updated_at: "2026-09-01T21:55:52.368Z"
components: ["alert","toast","button"]
foundations: ["color","typography"]
---

# Error handling

Use error feedback when an operation fails, user input cannot be accepted, required data cannot be retrieved, or the system cannot complete the requested task.

## Explain what failed

State the problem in clear language that relates to the action the user was trying to complete. Prefer specific messages such as `Project couldn't be saved` or `We couldn't load the latest results` over generic messages such as `Something went wrong` when the system knows what failed.

Do not expose stack traces, provider responses, internal service names, database errors, HTTP details, or other implementation information unless the interface is explicitly intended for technical diagnostics.

When the precise cause is unknown, acknowledge the failure without inventing an explanation.

## Preserve user work

Do not clear entered values, selections, filters, uploaded-file references, or other recoverable user state because an operation failed.

When submission fails, keep the user's work intact and allow correction or retry from the current context whenever possible.

Do not navigate users away from their work merely to display an error.

## Provide recovery

When a safe recovery action exists, place it close to the error. Use specific actions such as `Retry`, `Reconnect`, `Reload`, `Update payment method`, or `Review fields` rather than generic actions such as `OK`.

Offer Retry only when repeating the operation is safe. Prevent duplicate or conflicting work when the original operation may have partially succeeded or its completion state is uncertain.

If users cannot resolve the problem themselves, explain what they can do next without presenting controls that cannot actually help.

## Place errors near their source

Show field-level validation next to the field that needs correction. Show region-level errors inside or immediately adjacent to the affected collection, panel, or content area. Use page-level alerts when the problem affects the page broadly.

Use transient Toast feedback for failures only when the message does not require prolonged attention and the recovery path remains obvious elsewhere. Do not place important or actionable errors exclusively in a disappearing toast.

Avoid replacing unaffected content with a full-page error state when only one region failed.

## Validation errors

Explain what needs to change rather than merely stating that a value is invalid. Preserve the entered value so users can correct it.

When several form fields contain errors, make each error visible near its field and provide broader guidance when users would otherwise have difficulty locating the problems.

Do not rely on red color alone to communicate invalid state. Combine semantic color with text and appropriate structural or iconographic cues.

## Loading and request failures

Stop loading indicators when the system knows an operation has failed. Replace them with error feedback and a recovery action when one exists.

If a background refresh fails, preserve previously loaded usable content when appropriate and distinguish it from newly retrieved data if freshness matters.

Do not convert a failed request into an empty state. Empty, loading, and error states communicate different conditions and should remain distinct.

## Partial failures

When part of an operation succeeds and part fails, communicate the actual outcome instead of describing the entire operation as either successful or failed.

Preserve completed work when safe and identify what still requires attention. Avoid automatically repeating successful operations as part of a retry when doing so could create duplicates or unintended effects.

## Destructive and uncertain outcomes

For destructive, financial, or otherwise high-impact operations, do not tell users an action failed if the system cannot determine whether it completed. Communicate the uncertainty and provide a safe way to verify the resulting state before encouraging another attempt.

Never encourage blind retry when duplicate execution could create harm or inconsistent data.

## Error copy

Keep messages concise, specific, and actionable. Describe the user's problem rather than blaming the user or exposing implementation terminology.

A useful error message should answer as many of these questions as relevant:

1. What failed?
2. What happened to my work?
3. What can I do next?

Do not add technical explanations unless they help the intended user recover.

## Accessibility

Ensure errors are programmatically associated with the controls or regions they describe. Move or direct focus when necessary for users to discover blocking errors, while avoiding unexpected focus changes for minor background failures.

Do not communicate failure through color, icons, animation, or toast placement alone. Important error information must remain available long enough to understand and act on it.

## Avoid

- Generic `Something went wrong` messages when the failed operation is known.
- Clearing user input after submission or validation failures.
- Raw stack traces, HTTP errors, provider messages, or internal implementation details.
- Important actionable errors shown only in transient toasts.
- Full-page error states for failures isolated to one component or region.
- Showing an empty state when content actually failed to load.
- Leaving loading indicators running after failure is known.
- Retry actions when repeating the operation could create duplicates or harm.
- Claiming an operation failed when its final state is actually unknown.
- Error messages that identify a problem without offering an available recovery path.
