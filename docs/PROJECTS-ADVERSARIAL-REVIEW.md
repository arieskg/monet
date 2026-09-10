# Independent adversarial review: Surfaces V1.1

Reviewed 2026-09-10. Branch: `monet-surfaces-v1-1`; implementation: `090bc53`;
comparison base: `main`, merge base `294f31ad53ca4d25b428f64f184df4c7ec9fc09b`.
The worktree was clean at the start. This review examined the diff and traced the surrounding
Profile, Surface, Gap, API, provider, and write-lock code independently. Existing tests were
supporting regression coverage, not evidence that the new boundaries were correct.

**The original implementation is DO NOT MERGE.** It leaked HTTP requests through redirects and
sent WebRTC UDP packets outside the selected application port. The fixes described below are in
the working tree, not in `090bc53`. No merge or commit was made.

## 1. Findings and fixes

No P0 was found. The following findings concern the original implementation unless identified
as a remaining limitation.

| Severity | Finding | Independent evidence | Resolution |
| --- | --- | --- | --- |
| P1 | Capture egress was not constrained to the application. | A local app returned a 302 to a separate HTTP listener. That listener received `/redirect-leak` despite the route guard. A separate UDP listener received three 20-byte STUN packets initiated by the page. Direct fetches were blocked, demonstrating the bypass rather than a disabled guard. Allowing any loopback address on the same port also admitted a different IPv6 service. | Added a disposable HTTP proxy which validates every hop and connects only to the selected literal loopback endpoint. Disabled implicit loopback proxy bypass, non-proxied WebRTC UDP and QUIC. Denied WebSockets and CONNECT tunnels. Kept routing and DNS denial as secondary defenses. |
| P1 | Filesystem links bypassed the discovery/static boundary. | A symlinked `vite.config.ts` changed discovered port to an outside file's `45678`. An internal `alias.txt → .env` returned HTTP 200 with hidden content. Hard links were ordinary files in the original implementation and could expose outside content. | Added shared bounded regular-file reads, component symlink checks, `O_NOFOLLOW`, `O_NONBLOCK`, descriptor verification and rejection of multiply linked files. Static serving excludes hidden/generated dependency paths and unknown asset extensions. |
| P1 | Suggested terminal commands used JSON quoting as shell quoting. | Source inspection showed `JSON.stringify(root)` inside `cd … && npm run dev`. Dollar/backtick substitutions remain active inside double quotes. The new shell round-trip probe uses a real directory containing an apostrophe, `$()` and backticks. | Switched to POSIX single-quote escaping. The probe resolves the exact literal directory without interpreting its name. Monet still never executes the suggested command. |
| P2 | A connected project could become a symlink into Profile storage before capture. | The root overlap check ran on connection only; static capture subsequently canonicalized the stored root again. A new probe replaces the project root with a Profile symlink and checks refusal before browser execution. | Recheck canonical identity and Profile/library overlap before rescan/capture. |
| P2 | Redirect provenance named the requested route, not the captured route. | A controlled capture returning `/login` produced provenance `/`. | Record the browser-observed final path/query, refuse navigation during serialization, and report selection/destination differences. Keep deterministic selection labels separate from AI labels. |
| P2 | Capture IDs could be redeemed concurrently more than once. | Two simultaneous `saveSurface` calls both fulfilled and created records from one capture ID. | Recheck the ledger inside the workspace write lock before writing; consumption remains after the successful durable save. Expiry is also rechecked there. |
| P2 | Surface/Gap project references could disagree with otherwise valid provenance. | The original Gap handoff validated Surface hashes and a separately supplied Project binding independently. A new probe copies real provenance but substitutes another valid Project in the same Profile. | Require the Gap Project to match the saved run. On Surface reads, require capture and run Project bindings to agree with the registry. |
| P2 | Computed evidence was described as authored declarations and explicitly as “not computed styles.” | `compile` applied the manual-import scope text to computed captures. The new computed capture probe checks the returned review scope. | Distinguish manual declarations, live CSSOM declarations and computed values in review scope and UI. Explain browser defaults, inheritance, substitutions and lack of token/role/source-intent attestation. |
| P2 | Computed capture dropped meaningful zero/default resets. | Rendering a sanitized computed capture of `body{margin:0}` produced `8px`; `font-style:normal` was also discarded below an italic parent. | Preserve zero and normal/auto reset values. The rendered regression now checks zero margin and normal text. |
| P2 | Stylesheet serialization could change appearance without adequate reporting. | Layer flattening loses layer precedence; external stylesheet `media` conditions were omitted; SVG/canvas/media replacements were absent from capture warnings. | Retain stylesheet media conditions, flag layer loss, prefer computed capture for layers when available, and report placeholders. Forced stylesheet capture remains explicitly approximate. |
| P2 | Directory limits did not bound directory enumeration memory. | Discovery and folder browsing read/sorted a complete directory before enforcing their display/entry budget. | Use bounded `opendir` iteration. Keep scan truncation visible. |
| P2 | Dynamically assigned Monet API ports were not reserved against capture. | `MONET_PORT=0` caused the reserved-port set to contain zero rather than the actual listener. | Register the actual listening port; HTTP regression refuses both self-probing and self-capture. |
| P2 | Some discovered/AI-selected screens were unusable in the UI. | A static folder with HTML but no root index had no usable static root. AI matches absent from deterministic keyword results were never rendered. Out-of-range discovered ports could also make stored inventory invalid. | Permit the static root when HTML exists, include validated AI matches in the visible selection, and bound discovered ports. |

Additional hardening: page-controlled oversize text no longer becomes the server's error message;
blocked-destination bookkeeping is bounded; the overall deadline accounts for browser launch;
HTTP error pages are identified; duplicate AI interpretation IDs fail closed. None of these changes
adds canonical writes, provider execution of project commands, remote capture, or a new Apply path.

Relevant implementation: `server/captureProxy.ts`, `server/projectFiles.ts`,
`server/projectCapture.ts`, `server/projectCaptureScript.ts`, `server/projectDiscovery.ts`,
`server/projectStatic.ts`, `server/projectStore.ts`, `server/surfaceStore.ts`, and
`server/fileStore.ts`.

## 2. Independent probes

All network attack destinations used controlled local listeners. No real external endpoint was
used to receive test data. Chromium's own attempted background traffic was refused by the proxy.

- `tests/surfaces/projectIsolation.browser.ts`: actual HTTP/UDP listener observations, 302 and 307
  redirects, POST redirect data, integer IPv4, trailing-dot localhost, credentials, HTTPS,
  WebSockets, service workers and popups; separate IPv4/IPv6 services on the same port; successful
  explicit IPv6 capture; layer/media/dark capture; SVG warnings; sanitized computed rendering;
  genuinely hung renderer, concurrent capture rejection, deadline and slot release.
- `server/projectAdversarial.test.ts`: configuration symlinks, hard-linked source, internal hidden
  file aliases, generated dependency files, malformed percent/NUL paths and literal shell quoting.
- New cases in `server/projects.test.ts`: duplicate concurrent capture redemption; final route;
  delayed AI and capture across two immutable Profile scopes; foreign capture save; Gap creation,
  forged Project substitution, foreign Gap read and retained Gap history after Surface deletion;
  replacement of a project root by a Profile symlink.
- `server/projectsHttp.test.ts`: new actual-port self-capture/self-probe checks, plus existing
  explicit Profile, origin, JSON, directory and source-selection boundaries.
- Existing browser tests exercise the full connect → discover → capture → Surfaces → mapping →
  save flow and manual import, saved preview script/network/parent isolation, Profile switching,
  late responses and Gap handoff. Existing tests additionally cover ledger expiry/eviction,
  copied Project records, invalid provider IDs, unsupported selectors, oversized captures,
  revision integrity, Safe Apply recovery, exports, MCP and Theme-free Profiles.

Before fixes, the independently observed failures were the redirect and UDP leaks, symlink reads,
hidden-file alias, duplicate redemption, wrong final route and incorrect computed rendering.
Other findings above came from code-path analysis and received targeted post-fix checks where
listed; they should not be mistaken for separately executed pre-fix exploits.

Probe/test mistakes were distinguished from product defects:

- The first local-listener attempt failed with sandbox `EPERM` before the product ran; it was
  rerun with approved local-listener/browser access.
- The first WebRTC mitigation used only the old headless switch. UDP still escaped. Adding the
  Chrome switch was necessary, and the same UDP listener then observed zero packets. The proxy
  alone had already stopped the redirect leak. Both Chromium policy switches are retained for
  the supported launch choices; this result must be rechecked when browser versions change.
- A new deferred test helper initially used an ES2024 library API while this repository targets
  ES2023. It was replaced with ordinary Promises rather than changing the product's target.
- An existing browser assertion pinned the entire blocked-host list to `evil.test`. The new
  proxy also refuses and reports browser background traffic. The assertion now checks hostile
  requests without assuming an exhaustive host list; listener-based isolation assertions remain.
- The general workflow fixture no longer uses a cascade layer so it still exercises stylesheet
  custom-property mapping. Dedicated adversarial coverage checks layers separately.

Chromium's [WebRTC policy definition](https://chromium.googlesource.com/chromium/src/%2B/376fc41e87a058f7a7b300b0ec3a4982b4ec0960/components/policy/resources/templates/policy_definitions/Miscellaneous/WebRtcIPHandling.yaml)
and [switch implementation history](https://chromium.googlesource.com/chromium/src/%2B/3d6bf17ccb45f22a9f86ce2dfc12559ea39dac74)
informed the launch configuration; observed listener results, not the flag names, are the evidence
that the tested browser stopped sending those packets.

## 3. Isolation assessment

The original egress claim was false. After the fixes, the tested Chrome capture is trustworthy
against ordinary hostile web JavaScript within the documented local-process model: it reaches
the selected application endpoint through a checking proxy, not arbitrary loopback services or
redirect destinations. WebRTC UDP is disabled, WebSocket/tunnel traffic is denied, and disposal,
deadline and concurrency behavior are exercised. Saved previews still use the existing sanitizer,
strict CSP and empty iframe sandbox; project scripts do not survive into execution there.

This is not OS/network-namespace isolation or a browser-exploit containment guarantee. The local
dev server is operator-selected and trusted. It can itself read or proxy data; Monet cannot stop
that by restricting the browser endpoint. An arbitrary configured browser binary/provider and
hostile local filesystem races are also outside the model. These are explicit limits, not claims
established by passing tests.

## 4. Profile, Project and Surface provenance

Trustworthy as service-recorded identity and handoff history after the fixes. API binding is
immutable per document; Profile switches create a new document; server operations retain their
AsyncLocalStorage scope. Delayed work therefore finishes in its original Profile. Foreign IDs,
copied records, contradictory bindings, fabricated Surface hashes and inconsistent Gap Projects
are refused. Capture consumption is serialized. Saved revisions retain their Project; disconnect
does not destroy historical library bindings, and deleting a Surface retains already copied Gap
history.

Provenance attests the selected Project binding, capture endpoint, observed route and capture
settings. It cannot prove that a user-entered dev-server port serves the connected source tree,
that source files were unchanged since discovery, that a route contains its advertised screen,
or that page-supplied DOM/CSS is truthful. Sanitization is an execution boundary, not a truth oracle.
Free-form Gap problem statements remain user reports; valid provenance does not make them canonical
guidance. Only the existing reviewed Safe Apply path writes canonical records.

## 5. Evidence semantics

Appropriately calibrated after the wording and fidelity fixes, for a static comparison tool.
Manual declarations, live CSSOM declarations, computed declarations, sanitized output and the
browser screenshot are distinguished. Value equality remains a mapping suggestion requiring
approval, never an inferred semantic role or proof that the application uses a Monet token.
Computed observations include inherited/default values and apply to one viewport/mode. Conformance
checks sanitized declarations with substitutions; it does not establish rendered contrast,
interaction, component identity or missing guidance.

Layer fallback trades custom-property mapping for a closer static approximation. Forced
stylesheet capture warns about layer loss. Media conditions are retained and captured appearance
is frozen through the existing sanitizer. SVG/canvas/media replacements are now reported. The
automatic threshold is still a heuristic, not a fidelity score or screenshot-equivalence test.

## 6. Remaining limitations and follow-ups

1. Keep listener-based egress regressions in the browser gate and run them on every supported
   Chromium/channel/OS combination before expanding support. This review ran the installed macOS
   Chrome path; it does not certify every executable accepted by `MONET_CAPTURE_BROWSER`.
2. WebSockets, including HMR and application socket data, are now deliberately blocked. Apps that
   require them can show incomplete states; show and review the screenshot. Future socket support
   must preserve endpoint checks at the network boundary.
3. The app's trusted local server can proxy elsewhere. Static JSON/text/web assets can contain
   secrets despite valid names. No automatic semantic secret classifier exists. Source roots
   should contain only data intended for capture, and test data should be used.
4. Hidden pruning is limited: `display:none` subtrees and password/hidden/file inputs are removed,
   but offscreen, transparent or `visibility:hidden` DOM text may remain in a snapshot. A screenshot
   alone is not a privacy review. This limitation is now explicit in `docs/PROJECTS.md`.
5. Unsupported fonts, generated content, shadow DOM, container queries, nested/complex selectors,
   CSSOM mutation, transforms and layout details can still reduce fidelity. Automatic strategy
   selection and rule counts do not establish visual equivalence. Keep this as observed evidence,
   not automatic design-system extraction.
6. Directory paths and route inventories are snapshots, not source-content identity proofs. A
   directory reused for different source or a dev port serving another app needs operator review.
7. There is no explicit cancel endpoint. Switching Profiles leaves submitted work in its original
   scope; a hung browser is terminated by its deadline. CPU/memory quotas, browser exploits and
   adversarial concurrent local filesystem mutation require a stronger OS boundary.
8. Network counters include blocked browser background activity. They must not be interpreted as
   a complete packet audit or as proof that all attempts came from application code.

## 7. Verification

Final verification on the corrected code:

| Command | Result |
| --- | --- |
| `pnpm check` | PASS: TypeScript/Vite build, ESLint, 41 test files / 536 tests, workspace validation |
| `pnpm test:mcp` | PASS: 2 test files / 21 tests |
| `pnpm test:surfaces:browser` | PASS: all 10 browser tests, including the real 60-second hung-renderer probe |
| `git diff --check` | PASS |

The full-check transcript is available at `/tmp/monet-adversarial-check.log`. Tests used temporary
fixtures, including Theme-free Profiles; the bundled starter records were not changed. Browser
coverage used installed Google Chrome on macOS. No unrelated feature expansion or merge was made.

## 8. Verdict

**MERGE WITH FOLLOW-UP for the corrected working tree.** Final verification passed. No unresolved P0/P1 remains in the documented threat model from this review.
The original `090bc53` alone remains **DO NOT MERGE**. Commit and review the security fixes before
merging; this review did not merge to `main`.
