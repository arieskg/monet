# Surfaces V1.1: Local Project Connection

Local Project Connection lets someone who does not know which HTML, CSS, JavaScript or component
files make up a screen go from a Profile to a saved Surface:

**Select Profile → Connect Local Project → choose directory → discover screens → choose screen →
capture → existing Surfaces workflow**

It adds a Project record bound to one Profile, bounded deterministic discovery of a project's
screens, an isolated capture browser, and a server-attested handoff into the unchanged Surface
import. It does not redesign an application, infer component semantics, replace components,
learn canonical decisions, run project scripts, or change project files.

## Workflow

1. Select the Profile you want to evaluate against, then open **Build with it → Projects**
   (or **Surfaces → Capture from a local project**).
2. **Connect a local project**: type or browse to the project folder and connect. Monet scans the
   folder and lists what it found: the framework, the screens with their routes and source files,
   any built copy (`dist/`, `build/`, `out/`, …), the command that starts the app, and notices
   about what it could not establish.
3. **Choose a screen.** Filter by words from the screen (route, name, visible text). With an AI
   provider configured you can also *Ask AI to find it* in your own words or *Suggest friendlier
   screen names*; both are optional and validated against the deterministic inventory. Dynamic
   routes (`/exercise/:exerciseId`) need a real value: enter the exact path.
4. **Say where the screen runs.** For framework projects, start the app yourself with the shown
   command and check the connection to its loopback URL. Static sites and built copies are served
   by Monet from the folder for the duration of the capture; no project code runs in Node.
5. **Capture** at a viewport preset, light or dark, with automatic style strategy. The result shows
   what was captured, which outside requests were blocked, what fell outside the static boundary,
   and a screenshot.
6. **Open in Surfaces.** The captured document arrives as an ordinary sanitized Surface preview
   with editable title/context and a provenance panel. Approve mappings, preview, save, revise and
   report evidence to Gaps exactly as in [Surfaces V1](SURFACES.md).

## Data model

- **Project binding** (`library.json`, from Profiles V1): `{ id, name, profileId, bindingRevision }`.
  Created at revision 1 when a project is connected; reassignment stays refused. This is the
  authority on which Profile a Project evaluates against.
- **Project record** (`<profile>/projects/<id>.json`, editor-only, `profile_id`/`scope_version: 2`):
  name, canonical root path, `binding_revision`, the deterministic `inventory` (framework, dev
  command, default port, static builds, screens, notices, scan bounds, fingerprint, optional AI
  interpretation status) and capture defaults. Reading a record checks Profile ownership *and* the
  library binding: a record copied into another Profile is refused.
- **Screen**: `{ id, label, route, source, kind, parameters, hints, ai_label?, ai_summary? }`. Ids
  are content hashes of kind/route/source, stable across rescans. Hints are bounded visible-text
  strings from a source prefix, never code. AI labels are display text only.
- **Capture ledger** (memory only): at most four captures per service, fifteen minutes each,
  scoped to the capturing Profile. The editor holds only a capture id.
- **Surface record**: unchanged snapshot/run shape plus optional `capture` provenance
  `{ project_id, binding_revision, project_name, screen_id, screen_label, route, source, strategy,
  captured_at, width, height, mode, browser, blocked, warnings }`, validated on every read. Runs of
  a captured Surface always carry `project` evidence from that provenance; a client cannot supply a
  different one, so revising or switching Profiles never changes the evaluation target.

`monet/projects/` is ignored by Git in the starter workspace, like `monet/surfaces/`.

## Deterministic versus AI responsibilities

Deterministic (always, no provider): directory walk with entry/depth budgets that never follows
symlinks; `package.json` dependency detection (Next.js, Astro, SvelteKit, Nuxt, Vite, other Node,
or static); dev command from scripts and lockfile; default port from config or script flags;
route derivation by file convention (`app/**/page.*`, `pages/**`, `src/pages/**`, `src/routes/**/+page.*`,
`pages/**/*.vue`, `*.html`) and by React/Vue Router route literals with one-hop component
resolution; text hints; keyword ranking over route, label, source name and hints; strategy
selection; every limit and every security boundary.

AI (optional, explicit, validated): natural-language screen finding and friendlier screen names.
The prompt labels every route, file name and hint as untrusted data, forbids browsing and code
execution, and the provider may only return `screen_id` values from the supplied inventory with
bounded labels/reasons. Unknown ids, duplicates or malformed output fail closed with the
deterministic result intact. AI never sees project files beyond the inventory, never chooses the
capture URL, and never touches provenance.

## Capture architecture

```
project directory ──(bounded scan, no execution)──▶ inventory
user-started dev server ─┐
Monet static file server ┴─(loopback URL)──▶ isolated headless Chromium (project JS runs here only)
   ▶ in-page serializer → { html, css, assets } ──▶ shape validation ──▶ Surface sanitizer
   ▶ capture ledger (id, provenance) ──▶ POST /api/surface-previews | /api/surfaces { capture_id }
   ▶ existing sandboxed Surface preview (CSP + empty sandbox, no scripts)
```

- `server/projectDiscovery.ts`: bounded scan. `server/projectStatic.ts`: throwaway loopback file
  server for static/built projects (regular files under one directory, clean URLs, history
  fallback for extension-less paths, no listing, no traversal or symlink escape).
- `server/projectCapture.ts` + `server/projectCaptureScript.ts`: Playwright over an installed
  Chrome (`channel: chrome`), a Playwright Chromium, or `MONET_CAPTURE_BROWSER`. Fresh context per
  capture; the page script prunes hidden/active content and serializes two variants.
- **Stylesheet strategy** keeps authored CSS (from `document.styleSheets`, flattening `@layer` and
  true `@supports`), so custom properties remain mappable. **Computed strategy** inlines a curated
  set of computed declarations per element for framework/utility CSS the sanitizer cannot keep.
  **Auto** uses stylesheets unless more than 35% of style rules would be removed or the document
  exceeds the 300 KB limits, or cascade layers require flattening, then falls back to computed and says so.
  Live CSSOM declarations may themselves be script-generated; they do not attest source authorship.
  Forced stylesheet capture warns that flattening layers can change precedence. Stylesheet media
  conditions are retained; computed capture retains zero values and inherited-value resets.
  Computed declarations include browser defaults and inheritance at one viewport and appearance;
  they do not attest authored intent, token usage, semantic roles or rendered conformance. Every
  strategy is sanitized afterward. The screenshot records appearance separately from the static
  approximation, and SVG/canvas/media replacements are reported.
- `server/projectStore.ts`: records, binding, finder, connection probe, capture pipeline.
  `server/captureLedger.ts`: capture ids. `server/surfaceStore.ts` accepts `capture_id` beside
  `input` and stores attested provenance.

## Security boundaries

Preserved from V1: the same sanitizer, CSP, empty-sandbox frames, JSON-only routes, loopback Host
and editor-origin checks, body limits and Profile scoping. Added:

- **No project execution in Monet.** Discovery reads bounded prefixes; nothing is installed or
  run; the project is never written. The dev server is started by the user. Static serving reads
  regular files only.
- **Capture isolation.** Headless browser with a throwaway profile, no storage state, service
  workers blocked, downloads refused, popups closed, dialogs dismissed, reduced motion, fixed
  viewport, 60-second deadline including browser launch (plus bounded browser cleanup), one capture
  at a time. A temporary HTTP forwarding proxy checks the exact selected hostname and port on every
  hop, including redirects; it connects only to a literal loopback address. `localhost` is pinned
  to IPv4 loopback; use `[::1]` for an IPv6-only app. Chromium's implicit loopback proxy bypass is
  disabled. WebRTC non-proxied UDP and QUIC are disabled; WebSockets and CONNECT tunnels are refused
  (including HMR). DNS denial and Playwright request interception are additional defenses, not the
  network boundary. Blocked HTTP destinations are counted and shown. Only plain `http://` loopback
  URLs without credentials are accepted, never Monet's own actual listening or editor ports.
- **Untrusted page output.** The page's scripts can tamper with DOM APIs; the serializer's result is
  shape-validated (sizes, counts, asset names) and then fully sanitized like a pasted capture.
  Password, hidden and file inputs are dropped in-page and again by the sanitizer. Page-controlled
  exception text never reaches the editor.
- **Attested provenance.** The editor never posts captured HTML or provenance; it posts a capture
  id that resolves only within the capturing Profile and is consumed on save under the write lock.
  Expiry and consumption are rechecked there. The final URL path/query is recorded; a redirect
  notice explains when it differs from the selection. Screen labels are deterministic selection
  labels, not provider attestations about destination content. Contradictory `project` evidence
  is refused in Surface revisions and Gap handoffs; stored provenance is re-validated on read.
- **Profile binding.** Project roots may not contain or live inside a Profile or the library, nor
  be the home directory or filesystem root. Roots are rechecked before rescan and capture, including
  replacement by a symlink. Records outside their binding are refused. Configuration/source reads
  and static serving reject symlinks in every component and multiply linked files, use bounded
  regular-file descriptors, and exclude hidden/generated dependency paths. Static serving permits
  only its supported web-asset extensions and never lists directories.
- **Privacy.** The capture shows whatever the app displays, including real data; the UI says so.
  Folder browsing lists directory names only. Neither project paths, inventories nor captures
  enter `Workspace`, retrieval, exports or MCP.

Limits: 6,000 scanned entries, 12 levels, 200 screens, 400 route source files at 96 KB each,
12 hints of 80 characters, 3,500 elements per capture, the V1 Surface limits for the serialized
document, four ledger entries for fifteen minutes.

## Configuration

- `MONET_CAPTURE_BROWSER`: a Chromium channel (`chrome`, `chromium`, `msedge`) or executable path.
  Default: installed Google Chrome, then a Playwright Chromium (`pnpm exec playwright install chromium`).
- `MONET_PROJECT_MODEL`, `MONET_PROJECT_REASONING_EFFORT`, `MONET_PROJECT_TIMEOUT_SECONDS`: optional
  provider settings for the finder and interpretation, alongside `MONET_AI_COMMAND`.

## Verification

`pnpm check` covers discovery fixtures (static, Next.js, Astro, SvelteKit, Nuxt, Vite + React
Router), scan bounds, static-server traversal/symlink/listing refusals, ledger scoping and expiry,
Profile-bound records and library bindings, provider validation, capture pipeline behaviour with a
fake browser step, strategy selection, oversize refusal and HTTP boundary checks.
`pnpm test:surfaces:browser` captures a hostile static project in the real isolated browser
(exfiltration, sockets, workers, popups, hidden secrets, DOM-serialization tampering) and drives the
full editor workflow from connection to a saved Surface.

Representative local projects (ConvoGym: Vite + React Router; kg_blog: Astro with a built copy)
were connected and captured during development; see the V1.1 delivery notes in the pull request or
commit message for measured results. AriesKG was not available locally.

## Limitations and follow-ups

- Route discovery is convention- and literal-based. Programmatic or deeply nested routes, guarded
  screens, modals and states behind interaction are not discovered; capture the exact path instead.
- One visible state per capture, no interaction playback or authentication flows. A screen that
  needs data from a backend shows whatever the dev server renders without it.
- The static boundary is unchanged: fonts, keyframes, container queries, `:where`/`:is`/`:has`
  selectors, generated content and shadow DOM are outside it; computed strategy trades mappable
  custom properties for fidelity.
- Hidden-content pruning removes `display:none` subtrees and password/hidden/file inputs. It is not
  a general secrets scrubber: offscreen, transparent or `visibility:hidden` DOM text may remain
  in a saved snapshot. Use test data and inspect the sanitized document, not only the screenshot.
- Captures are not persisted before save; a service restart drops unsaved captures.
- The capture browser is a local process boundary, not a sandbox against a hostile local machine.
- The operator-selected dev server is trusted: Monet cannot prove that an arbitrary local port
  serves the connected directory, prevent that server from proxying elsewhere, or hide non-hidden
  application data deliberately served there. Static roots should contain only material intended
  for the application; JSON/text assets are not automatically classified for secrets. Hostile local
  processes racing filesystem replacement, browser exploits and OS-level memory exhaustion are
  outside this boundary. Browser flags must be regression-tested when changing Chromium versions.
- Network counters include browser background requests and are observations from HTTP interception/proxy handling, not a packet audit.
  Switching Profiles leaves submitted work running in its original Profile; there is no user
  cancellation endpoint. A hung capture is terminated by the deadline.
- Deferred: Profile inheritance, presets, `DESIGN.md` importing, semantic redesign, automatic
  component replacement, Theme removal, capture of authenticated states, and additional browser engines.
