# Monet product proof: a red-team evaluation of the thesis

**Status:** research and evaluation only. No application code, design-system record, MCP
surface, retrieval behaviour, theme, reference, or dependency was modified by this work. The
only repository file created is this one.

**Date:** 2026-09-04. **Subject:** Monet at `1f2a5be` (branch `monet-design-md-research`),
served from the bundled starter workspace at `monet/`.

**The question under test.** Not "is Monet well engineered" but: *does Monet cause an AI
coding agent to make materially better design decisions than simpler alternatives?*

---

## 1. Executive verdict

Monet's thesis survives in a narrower and more specific form than it is currently stated, and
the weakest link is not the domain model — it is **retrieval**.

Three findings carry the verdict.

1. **The design-decision corpus is real and is genuinely better than what a static file
   carries.** Monet's Foundation guidance and Pattern bodies contain specific, non-obvious,
   behaviourally-checkable rules that no generic agent produces on its own. Monet's *own*
   committed static export throws most of that away (§6.4), so "just export a document" is
   not currently a substitute — it is a downgrade.

2. **Retrieval is the thesis's load-bearing claim and it is the part that fails.** Monet's
   headline capability — deterministic task retrieval — misses the obviously-correct workflow
   record on roughly a third of canonical product-UI tasks, and its behaviour swings by 4–10×
   on paraphrases of the *same* intent. The word "form" is doing an enormous amount of work
   that the user never knows they have to say (§5.2). A persistent design-decision layer whose
   answer depends on synonym choice is not yet persistent in the sense the thesis claims.

3. **Several advertised differentiators do not reach the agent at all.** Primitives are
   structurally unreachable over MCP. Contrast validation produces nothing an agent can see.
   `search_references` returns zero results for the example in Monet's own documentation.
   These are not "small in this sample" — they are *architecturally absent* (§7).

The honest positioning that the evidence supports is **not** "persistent design taste for
coding agents" and **not** "design memory". It is closer to:

> **A curated, human-approved corpus of UI design decisions, with an honest report of what it
> does and does not have an opinion about, delivered to coding agents as scoped context.**

The corpus and the honesty are demonstrated. The *persistence*, the *taste*, and the
*selectivity* are the parts the evidence does not yet support, because retrieval is not
reliable enough to make them true.

**Recommended next phase: fix retrieval, and make the honesty machinery trustworthy.** Not
DESIGN.md export, not more content, not conformance review. Those all sit downstream of a
retrieval layer that currently decides, on the basis of one word, whether Monet answers at all.

---

## 2. Evaluation methodology

Two halves, deliberately separated because they have very different evidential strength.

### 2.1 Direct instrumentation (complete, high confidence)

A scratch harness outside the repository drove the **real** MCP server in-process, using the
same `@modelcontextprotocol/client` + `InMemoryTransport` pairing as `mcp/server.test.ts`, over
`createMonetService({ loadWorkspace })` against the bundled workspace. Everything reported in
§5–§7 is measured from live tool and resource responses, not simulated or recalled. No Monet
code was modified to obtain it.

This half is reproducible from the numbers alone and does not depend on any model's judgement.

### 2.2 Controlled agent benchmark (partially completed — see §2.4)

A pre-registered task set with rubrics written **before** any output existed, then generation
under matched conditions across context treatments, then blind rubric scoring.

### 2.3 Controls applied

- **One-file rule.** Every generating agent was instructed to read exactly one context file
  and forbidden from touching the repository. Transcript audit of the running agents found
  **23 Read calls, all inside the scratch directory, zero repository accesses.**
- **Provenance scrubbing.** Plans were scrubbed of provenance strings (`monet://`, "Monet",
  "DESIGN.md", "the brief", "the design system says", coverage labels) before scoring. Design
  *content* — token names, component names, library names — was deliberately left intact,
  because that content is the treatment effect being measured, not a label to be hidden.
- **Read-truncation check.** All treatment files are under the 2,000-line Read limit, and a
  4,992-character line inside a compact brief was verified to return intact, so no treatment
  was silently starved of content.
- **Query-length handling.** `get_design_context` hard-rejects queries over 500 characters.
  Two of 38 task prompts exceeded it, so a deterministic condensation (title + first sentence,
  capped at 500) was applied to those two and recorded.

### 2.4 What could not be completed, and why

The benchmark was designed as **38 tasks × 6 treatments = 228 generations**, plus a
smaller-model arm (32), a prose-format control (8), and 56 subsystem ablations, followed by
blind scoring of every cell.

**The session hit its usage limit partway through generation.** Of 268 primary-arm agents, 35
completed and 233 failed with `You've hit your session limit`; of 56 ablation agents, 26
completed and 30 failed. The smaller-model arm and the prose-format control returned **zero**
results and were not run at all.

The study was therefore **re-scoped to a 12-task benchmark** built around the cells that had
already completed, plus edge coverage. This is a real reduction in statistical power and is
reported as such throughout. Specifically:

- **Not run:** the smaller-model arm (does context matter more for weaker agents?), and the
  prose-vs-JSON format control (is any E-vs-D difference a formatting artefact?). Both remain
  open questions and are listed in §20.
- **Reduced:** 12 tasks instead of 38; ablations on 3 complete task rows plus one partial
  instead of 8.
- **Unchanged:** the task set and rubrics were authored and frozen *before* any generation,
  and were not edited afterwards to fit the results.

No result in this report is extrapolated to the cells that did not run.

---

## 3. Treatments compared

| | Treatment | Content | Mean context |
| --- | --- | --- | --- |
| **A** | No design context | task only | ~7 tok |
| **B** | Generic framework | shadcn/ui + Tailwind + Radix conventions and default theme tokens | ~285 tok |
| **C** | Monet's own static export | `monet/DESIGN_SYSTEM.md`, committed, 166 KB | ~41,700 tok |
| **D** | DESIGN.md snapshot | spec-conformant file generated in scratch from the same records; 107 KB, 214 KB with the dark variant | ~32,400 tok |
| **E** | Monet compact brief | the real `get_design_context` response for the task | ~15,300 tok |
| **F** | Brief + deep reads | E plus the full text of every pattern it cited, every record it matched directly, and every record it reported undecided | ~21,600 tok |
| **H** | Workspace + AGENTS.md | the raw workspace directory; the agent does its own retrieval, guided by `monet/AGENTS.md` | agent-determined |

**Treatment D was built to be strong, not a strawman.** It carries the full semantic colour
palette (45 roles), assembled typography composites, radius and spacing scales, a derived
`components` block, condensed Foundation guidance, per-pattern rules, per-component
preferences/behaviour/notes/use/avoid, and a principle-derived Do/Don't section. At 107 KB it
is larger than every file in the `awesome-design-md` corpus (median 28.5 KB) and larger than
Atlassian's 81 KB first-party file.

**Treatment H was added mid-study** and is the sharpest competitor to the retrieval layer:
`monet/AGENTS.md` is a 4.2 KB instruction file that already tells any file-reading agent how to
navigate the workspace, in what order, with an explicit authority hierarchy and an explicit
"if undecided, surface the choice" rule. It is Monet's existing, shipped, non-MCP path, and it
tests directly whether Monet's scorer beats an agent's own file navigation.

---

## 4. Task set and scoring methodology

### 4.1 Construction

38 tasks were authored across eight domain clusters by agents that first read the relevant
canonical records and produced a grounded digest, then wrote tasks and rubrics from it. Task
prompts are ordinary engineering requests — they carry no Monet vocabulary and do not
telegraph their rubric. 364 rubric items were produced, each with a dimension, a behavioural
criterion, explicit 0/1/2 anchors, a citation to a canonical record, an anti-pattern flag, and
a "discriminating" flag.

### 4.2 Pre-registration and citation verification

Rubrics were frozen before generation. Rather than rely on an LLM audit (which ran long and
was stopped), citations were verified **deterministically**: every quoted span of ≥25
characters in a `canonical_source` was normalised and matched against the concatenated text of
every file under `monet/`.

| | |
| --- | --- |
| Rubric items citing a Monet record | 337 |
| Quote verified verbatim in `monet/` | **329 (98%)** |
| Quote not found (paraphrase or drift) | 8 |
| Items declaring Monet silent (`NONE-MONET-IS-SILENT`) | 27 |

### 4.3 Known weaknesses of the rubric set

Reported because they bound how much the scores can be trusted:

- **Discrimination is probably inflated.** 256 of 364 items (70%) are flagged as
  discriminating — that is, a generalist agent would plausibly get them wrong. That fraction is
  implausibly high. The LLM audit intended to correct it did not complete.
- **`expects_composition` is uninformative:** 37 of 38 tasks claim it, so it cannot segment.
- **No task is labelled `monet_opinion: none`** (22 strong, 16 partial), although 27 rubric
  items and 28 `fallback-honesty` criteria do test silence, and one task's retrieval returns
  `coverage: none` in practice.
- **Blinding is partial.** Provenance strings were removed, but token-name specificity is
  itself a signature of the token-carrying treatments. Blinding cannot remove the effect being
  measured; scorers were simply not told how many treatments existed or what they were.

---

## 5. Direct instrumentation findings

Everything in this section is measured from the live MCP server. These are the strongest
results in the study because they do not depend on any model's judgement.

### 5.1 Pattern recall on canonical tasks

22 canonical product-UI tasks, each with its expected workflow pattern written down first:

| | |
| --- | --- |
| Full recall (every expected pattern returned) | **12 / 22** |
| Partial | 3 / 22 |
| **Complete miss** | **7 / 22** |
| Patterns returned in total | 30, of which **12 were not the expected one** |

The misses are not exotic. They are: sign-in, account creation, multi-step onboarding, profile
editing, billing, a site-wide banner, and a dense admin user list. Three of those returned
`coverage: none` — Monet reporting that it has no task-specific guidance while a directly
applicable Pattern sits in the workspace.

### 5.2 Retrieval is keyed on the literal record title

This is the single most consequential finding in the study.

```
"build a login form"     → coverage task_specific, Forms pattern + 11 components, 58.5 KB
"build a login page"     → coverage task_specific, no pattern, 1 component,       29.9 KB
"build a login screen"   → coverage task_specific, no pattern, 1 component,       29.9 KB
"build a sign-in view"   → coverage task_specific, no pattern, 1 component,       30.8 KB
"add authentication UI"  → coverage none,          nothing,                        6.0 KB
```

Monet's own README advertises exactly this query: *"any compatible client can ask 'how do I
build a login form' and get your answer."* It works — **because the user happened to say
"form"**.

The mechanism is visible in `shared/retrieval.ts`. The Forms pattern's retrieval aliases are
`["settings form", "data entry", "authentication form", "login form", "signup form"]` — all
`<noun> form` compounds. Monet's documented alias rule requires the phrase or *every* one of
its tokens to match before it counts as identity. "Login page" supplies `login` but not `form`,
so the alias only half-matches and falls below the floor. Patterns are, in effect, reachable
almost exclusively by naming their own title word.

The same table explains a spurious result measured elsewhere: `onboarding → ["stepper", "step",
"sequence", "empty"]` is why "build an onboarding signup flow" returns the **Empty States**
pattern.

### 5.3 Phrasing robustness

Six intents, six natural phrasings each, 36 requests:

| Intent | Distinct pattern sets | Coverage values seen | Brief size range |
| --- | --- | --- | --- |
| log in | 2 / 6 | task_specific, none | 6.0–58.5 KB (9.7×) |
| create account | 3 / 6 | task_specific, partial, none | 6.0–58.5 KB (9.7×) |
| edit profile | 3 / 6 | task_specific, partial, none | 6.0–52.2 KB (8.6×) |
| billing | 3 / 6 | task_specific, partial, none | 6.0–52.2 KB (8.6×) |
| list users | 3 / 6 | task_specific, partial | 13.0–51.6 KB (4.0×) |
| notifications | 5 / 6 | task_specific, partial, none | 6.0–60.5 KB (10.0×) |

**6 of 6 intents change their retrieved pattern set with phrasing. 10 of 36 phrasings (28%)
return `coverage: none`. 23 of 36 (64%) return no pattern at all.**

A static document has, by construction, zero phrasing sensitivity. On the 28% of phrasings
where Monet returns nothing, a static document strictly dominates it — the Forms rules are
still in the file.

### 5.4 False confidence: `task_specific` is too easy to reach

`shared/service.ts:465` computes coverage as:

```js
const decisive = taskMatches.some((match) => match.strength !== "weak");
const coverage = !taskMatches.length ? "none" : decisive ? "task_specific" : "partial";
```

A single **medium**-strength match is enough. Measured consequences:

- `"build a kanban board with drag and drop columns"` → matches **`file-upload`**
  (`direct_name_match`, medium) → `coverage: task_specific`, no notice.
- `"build a marketing landing page hero with a headline and signup"` → matches
  **`password-input`** (medium, 83) → `coverage: task_specific`, no notice, 30 KB of context.
- `"build a dense admin screen listing every user account"` → returns `master-detail`, not
  `data-tables` → `coverage: task_specific`.

This matters more than an ordinary precision bug, because *honesty is Monet's stated
differentiator*. The `no_opinion` notice — the mechanism that tells an agent to fall back to
familiar accessible judgement — is suppressed exactly when a single spurious medium match
lands. Monet is most confident precisely where it is most wrong.

Where the honesty machinery does fire, it fires well: `"make this screen feel more polished"`
→ `coverage: none` + `no_opinion`, 6 KB. `"add a bar chart"` → `undecided_guidance` naming
`chart` and `sparkline`. `"build a rich text editor toolbar"` → `partial` + `no_opinion`, zero
tokens. That behaviour is genuinely good and genuinely differentiating. The problem is that its
trigger condition is unreliable.

### 5.5 Dark-mode detection

`shared/service.ts:146`:

```js
/(dark|night)[ -](mode|theme|ui|palette|scheme|interface|variant)|\bdark[ -]?mode\b/
```

A seven-word bigram whitelist. Across the 8 benchmark tasks where dark appearance is explicitly
part of the request, **1 of 8 resolved in dark mode.** All eight prompts contain the words
"dark" and "light"; seven phrase it as "dark **appearance**" or "both light and dark", which
the regex does not match. `docs/ARCHITECTURE.md` itself defines a mode as "an **appearance** the
same theme can be resolved in" — Monet's own word for the concept is absent from its own
detector.

Partial mitigation, and it is real: `mode_values` ships in the light brief too, so 7 of the 8
still received both light and dark values for the 25–32 tokens that move. The exception is
`delivery-ops-overview`, which retrieved no Color foundation and therefore got `mode_values: 0`
— no dark information at all. The `unsupported_capability` notice also never fires, because it
is downstream of the same failed detection.

### 5.6 Component retrieval precision

Four canonical tasks, with the components a competent engineer would actually place written
down first:

| Task | Returned | Relevant | Missing | Off-target |
| --- | --- | --- | --- | --- |
| login form | 11 | 6/7 | `link` | textarea, radio, switch, select, fieldset (11.5 KB) |
| orders table + bulk archive | 10 | 8/10 | `button`, `toolbar` | link, tag (4.1 KB) |
| notification settings | 8 | 5/8 | checkbox, label, card | text-input, select, alert (8.1 KB) |
| delete account confirmation | 6 | 4/6 | **`text-input`**, `alert` | **pagination, tag** (4.3 KB) |

**Overall precision 66% (23/35), with 28 KB of off-target component payload.** The
destructive-deletion brief returning `pagination` and `tag` while omitting `text-input` — the
control a type-to-confirm flow depends on — is the clearest single illustration.

### 5.7 Information budget of the "compact" brief

Composition across eight representative tasks (mean brief 45.9 KB):

| Section | Share | Mean bytes |
| --- | --- | --- |
| Foundations (description + guidance) | **34.3%** | 15,733 |
| Components | **30.6%** | 14,043 |
| Principles (unconditional on every request) | 11.9% | 5,460 |
| Tokens | 9.2% | 4,225 |
| Retrieval provenance | 4.6% | 2,089 |
| Patterns | 4.5% | 2,074 |
| `mode_values` | 3.9% | 1,784 |
| Notices | 0.2% | 89 |
| References | 0.2% | 96 |

And by provenance:

| | |
| --- | --- |
| Foundations that arrived only by expansion | **55 of 56 (98%)**, 32.1% of the brief |
| Components that arrived only by expansion | **44 of 62 (71%)**, 23.3% of the brief |
| Tokens referenced anywhere else in the brief | **390 of 1,232 (32%)** |
| Principles, shipped regardless of the query | 11.2% |

**Roughly 71% of the compact brief is material the query never matched** (expansion
foundations 32.1% + expansion components 23.3% + unconditional principles 11.2% + provenance
4.5%). The directly-matched records are under 30% of it. The *values* — the tokens — are 9%.

On the 12 realistic multi-sentence benchmark prompts the briefs are larger still: median
70.5 KB (~17.6k tokens), max 76.4 KB, with 25 of 38 briefs hitting the 12-component cap.

Caveat: "referenced anywhere else in the brief" measures internal coherence, not necessity — a
token can be needed without being named in prose. The ablation in §11 is the causal test.

### 5.8 Cost of following the brief's own advice

| Task | Brief | All cited URIs | Brief + URIs | `detail: full` | Pattern bodies only |
| --- | --- | --- | --- | --- | --- |
| login form | 58.5 KB | 121.4 KB | 179.9 KB | 150.7 KB | 5.9 KB |
| delete account | 46.1 KB | 101.4 KB | 147.5 KB | 126.1 KB | 11.1 KB |
| orders table | 56.4 KB | 122.6 KB | 179.1 KB | 153.0 KB | 11.2 KB |
| dark dashboard | 55.7 KB | 121.9 KB | 177.6 KB | 153.0 KB | 11.2 KB |
| settings | 47.6 KB | 104.0 KB | 151.6 KB | 130.7 KB | 5.3 KB |
| failed save | 38.5 KB | 97.6 KB | 136.1 KB | 123.8 KB | 12.0 KB |

Two observations. `detail: "full"` is **cheaper** than brief-plus-all-URIs while carrying
Foundation rationale and whole Pattern bodies. And the **pattern bodies — the highest-value
content the brief deliberately withholds — are only 5–12 KB, about 5–10% of the follow-up
cost**. The brief spends 32% of itself on unmatched Foundation guidance while withholding the
one thing worth a second round trip.

---

## 6. What is architecturally absent, and what the static exports contain

### 6.1 Primitives never reach an agent

Monet maintains 21 primitive taxonomy entries, 21 primitive decisions, a UI page, merge logic
that rewires relationships, and validation. Measured against the live server:

- The MCP catalog has six keys — principles, foundations, patterns, components, themes,
  references. **No primitives.**
- There are eight resource templates. **None is `monet://primitives/{id}`**; the URI returns
  `Resource not found`.
- `CompactDesignContext` has no primitives field, and `compactComponent()` drops the
  `primitives` array from every component.
- `detail: "full"` *does* emit `primitives` on component decisions — **44 of 80 decided
  components name primitives** — producing dangling identifiers an agent has no way to resolve.
- Five primitive ids collide with component ids (`stack`, `flex`, `grid`, `container`,
  `aspect-ratio`), so `monet://components/grid` silently resolves in the component namespace.

This is not "unused in a 30-task sample". It is unreachable by construction.

### 6.2 Validation is invisible to generation

`shared/contrast.ts` encodes contrast contracts, a derived-role safety margin, text roles,
tinted surfaces, and per-theme-per-mode verification, and `validate` enforces them. None of it
reaches an agent:

- The compact brief has no contrast, ratio, WCAG or pairing field. The word "contrast" appears
  4 times, 3 of them inside Foundation prose.
- The resolved-token resource exposes 15 fields per token — `resolved_value`, `source`,
  `override_dependencies`, and so on — **and no contrast field**.
- There is no machine-readable fill→foreground pairing; the 8 `color.on.*` tokens ship as
  values, and the rule that binds them lives only in prose.

Validation is a **maintenance guarantee, not a generation input**. Its value is real but
indirect: the hexes handed over are known-good. An agent would produce the same plan if they
were not.

### 6.3 `search_references` and the reference corpus

The bundled workspace holds **one** reference. `search_references({query: "command palette"})`
— the example in Monet's own `docs/MCP.md` — returns **0**. So does `"data table"`. References
are 0.2% of brief bytes, and the one record fires spuriously on a sign-in query via a weak tag
match. The subsystem is not wrong; it is empty, and its documented demo does not work.

Sources are similarly invisible: 9 sources with **744 upstream mappings** are unreachable as
resources; only the source *name* leaks through `source_inspiration` ("polaris", "primer").

`monet://themes/default` returns 98 bytes: `{"id":"default","name":"Default","overrides":{},...}`.
In a single-theme workspace it is a resource that always carries zero design information.

### 6.4 Monet's own static export is weaker than the DESIGN.md it could emit

`monet/DESIGN_SYSTEM.md` is 166 KB. Its composition:

| Section | Share |
| --- | --- |
| Component decisions | **71.9%** |
| Tokens (with dark values inline) | 14.3% |
| Principles | 7.7% |
| Primitive decisions | 2.8% |
| **Patterns** | **1.2%** — thirteen one-line summaries |
| **Foundations** | **1.1%** — descriptions only |

Verbatim checks: the Color foundation's guidance ("Use semantic color roles in product code…")
appears **0 times**. The Forms pattern's rule "Placeholder text is not a label" appears **0
times**. Both appear in the DESIGN.md snapshot generated in scratch.

Of 1,386 substantive statements the compact brief hands an agent across six tasks:

| Statement kind | n | Present in C (`DESIGN_SYSTEM.md`) | Present in D (DESIGN.md) |
| --- | --- | --- | --- |
| Principle text | 240 | 240 (100%) | 240 (100%) |
| **Foundation guidance** | 646 | **0 (0%)** | 328 (51%) |
| Pattern intent/avoid | 97 | 2 (2%) | 7 (7%) |
| Component notes/use/avoid | 403 | 403 (100%) | 247 (61%) |
| **Total** | 1,386 | **645 (47%)** | **822 (59%)** |

(The pattern row understates both: each document extracts pattern rules differently, so
verbatim matching fails on semantically equivalent content. The Foundation row is exact — C
genuinely omits guidance.)

**Monet ships a static export that discards exactly the two things it claims as
differentiators: Foundation guidance and Pattern content.** A DESIGN.md generated from the same
records carries more of both. That is a strong, independent argument for the export
recommendation in the earlier `design-md-assessment.md`, arrived at from the opposite direction.

### 6.5 What the mode axis genuinely delivers

Not everything is negative here. In a dark-resolved brief, 131 of 163 tokens are identical
across modes and the brief names the 32 that move, with both values:

```json
"color.surface": {"dark": "#1a2530", "light": "#ffffff"}
"border.focus":  {"dark": "2px solid #dc95ff", "light": "2px solid #9b59b6"}
```

Two DESIGN.md files force an agent to diff two documents to learn that `color.primary` does not
move. Monet states it. This is a real, concrete advantage of the mode model over the format —
and it survives the detection bug in §5.5, because `mode_values` ships in light briefs too.

---

## 7. MCP usability findings

Measured against the live server. The resource surface is 122 static resources totalling
~481 KB, plus eight templates and two tools.

| Resource kind | n | Total bytes | Mean | Verdict |
| --- | --- | --- | --- | --- |
| `catalog` | 1 | 11.2 KB | 11.2 KB | Useful: the only cheap way to see the whole taxonomy |
| `principles` | 8 | 14.3 KB | 1.8 KB | Redundant — full principle text already ships in every brief |
| `foundations` | 13 | 87.3 KB | 6.7 KB | Useful only for `rationale`/`notes`, which the brief omits |
| `patterns` | 13 | 70.9 KB | 5.5 KB | **The highest-value follow-up** and the one the brief withholds |
| `components` | 83 | 146.7 KB | 1.8 KB | Marginal — the brief already carries the decision in full |
| `themes` | 3 | 147.7 KB | 49.2 KB | Token resources useful; `monet://themes/default` is 98 B of nothing |
| `references` | 1 | 3.3 KB | 3.3 KB | Empty corpus |

**Is `get_design_context` the right primary tool?** Yes in shape, no in current behaviour. A
single call returning a scoped brief with an honesty report is the right primitive. But its
answer is a step function of phrasing (§5.2–§5.3), and it hard-rejects queries over 500
characters, which means a real client must first *summarise the user's request* — inserting an
uncontrolled paraphrase in front of a retriever that is highly paraphrase-sensitive. Two of 38
realistic prompts hit that limit.

**Do resources earn their place?** Partly. The compact brief already carries principles and
component decisions in full, so those resources are near-duplicates. What the brief genuinely
withholds is Foundation `rationale`/`notes` and **whole Pattern bodies** — and pattern bodies
cost only 5–12 KB (§5.8). The resource surface would be more valuable if it were smaller and
the brief carried matched-pattern bodies directly.

**Is anything inaccessible?** Yes: primitives (§6.1), sources and their 744 mappings (§6.3),
decision history, and all validation output (§6.2).

**Does an agent know when to fetch deeper?** Not measured. The URI-following probe was part of
the cut experiment; treatment F used a deterministic policy ("read every pattern cited, every
directly-matched record, everything undecided") rather than agent choice. This remains open.

---

## 8. Aggregate benchmark results

**Evidence class 1 — supported by completed blind scoring.** 11 tasks × 6 treatments (A–F),
one blind rater per plan, scored against pre-registered rubrics. Treatment F is n=10.

### 8.1 Headline

| Treatment | All criteria | Discriminating only | Anti-pattern only | n |
| --- | --- | --- | --- | --- |
| **A** no context | 72.3% | 69.0% | 65.5% | 11 |
| **B** shadcn/Tailwind | 71.8% | 69.3% | 68.4% | 11 |
| **C** `DESIGN_SYSTEM.md` | **90.1%** | 89.6% | 88.9% | 11 |
| **D** DESIGN.md | 89.4% | 88.2% | 91.4% | 11 |
| **E** compact brief | 89.0% | 88.2% | 89.3% | 11 |
| **F** brief + deep reads | **92.9%** | **93.3%** | 92.6% | 10 |

Three things follow immediately.

1. **Design context is worth a lot: +17 to +21 points over no context.** That is the single
   largest effect in the study and it validates the corpus, not the delivery mechanism.
2. **C, D and E are indistinguishable at this sample size** — 90.1 / 89.4 / 89.0, a spread of
   1.1 points across 11 tasks. On quality alone, the compact brief buys nothing over a static
   document generated from the same records.
3. **F is the best treatment.** Adding pattern bodies and directly-matched records to the brief
   is worth +3.9 over E — the largest gain available from anything Monet already holds.

### 8.2 Where the retrieval layer actually pays: cost, not quality

| Treatment | Context | Rubric | **Points per 1k tokens** |
| --- | --- | --- | --- |
| A | 7 tok | 72.3% | — (degenerate) |
| B | 285 tok | 71.8% | 251.8 |
| **E** | **15,055 tok** | 89.0% | **5.91** |
| F | 20,117 tok | 92.9% | 4.62 |
| D | 31,658 tok | 89.4% | 2.83 |
| C | 41,652 tok | 90.1% | 2.16 |

**E reaches static-document quality on 36% of C's context and 48% of D's.** F reaches the best
quality in the study on 48% of C's context. That is the defensible claim for retrieval — and it
is an efficiency claim, not a decision-quality claim.

### 8.3 Generic framework context is actively harmful

B scores *below* A on the rubric (71.8 vs 72.3) while being dramatically worse on the honesty
measures:

| Measure | A | B |
| --- | --- | --- |
| Invented decisions (lower better) | **0.91** | 3.36 |
| Framework leakage (lower better) | 1.09 | 3.45 |
| Calibration (higher better) | **4.00** | 3.18 |
| Fallback-honesty dimension | **91.7%** | 66.7% |
| Stated confidence | 11 medium, 1 low | **9 high**, 3 medium |

Telling an agent "use shadcn" makes it confidently assert house conventions it does not have.
An agent with *no* design context is the best-calibrated participant in the study. This is a
real result and it is bad news for the "just put conventions in AGENTS.md" position — the
cheap version of that idea measurably degrades calibration.

### 8.4 Per-dimension

| Dimension | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| tokens | **50.0** | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 |
| dark-mode | **50.0** | 75.0 | 75.0 | 100.0 | 100.0 | 100.0 |
| destructive | 56.2 | 58.3 | 75.0 | 85.4 | 70.8 | **87.5** |
| layout | 55.6 | 50.0 | 83.3 | 88.9 | 88.9 | 77.8 |
| anti-pattern | 62.5 | 81.2 | 78.1 | **93.8** | 84.4 | 89.3 |
| component-choice | 68.8 | 59.4 | **100.0** | 87.5 | 81.2 | **100.0** |
| hierarchy | 70.0 | 80.0 | 93.3 | 90.0 | 93.3 | 93.3 |
| interaction | 75.0 | 68.8 | **95.0** | 77.5 | 86.2 | 94.0 |
| validation | 75.0 | 50.0 | 75.0 | **100.0** | 91.7 | 87.5 |
| accessibility | 81.2 | 87.5 | 90.6 | 93.8 | 96.9 | **100.0** |
| fallback-honesty | **91.7** | 66.7 | 91.7 | 91.7 | 83.3 | 90.0 |
| loading | 97.6 | 95.2 | 100.0 | 97.6 | 100.0 | 100.0 |
| responsive | 100.0 | 75.0 | 100.0 | 100.0 | 100.0 | 100.0 |

**Token discipline is the clearest single effect of any design context** (50% → 100%). Dark
mode is second (50% → 100% for D/E/F). Loading and responsive behaviour are essentially free —
a competent agent already gets them right, so Monet's records on those topics change nothing.

### 8.5 Per-task winners

| Task | A | C | D | E | F | Winner |
| --- | --- | --- | --- | --- | --- | --- |
| admin-quick-open-overlay | 61 | 89 | 89 | **100** | 100 | E |
| analytics-reporting-period-control | 50 | 83 | 72 | 83 | **89** | F |
| bulk-csv-import-feedback | 80 | **95** | 90 | 95 | 95 | C |
| delete-account-flow | 72 | 94 | 83 | **72** | **100** | F |
| header-global-search | 60 | 85 | 90 | **95** | 95 | E |
| orders-operations-table | 65 | 90 | **95** | 85 | 85 | D |
| org-policy-inheritance-settings | 60 | **75** | 75 | 65 | 75 | C |
| projects-table-nonhappy-states | **100** | 100 | 100 | 100 | 100 | A |
| public-landing-page | 78 | 94 | 94 | **100** | 100 | E |
| sign-in-screen | 89 | 94 | **100** | 83 | — | D |
| ticket-assignee-multi-filter | 80 | 90 | 95 | **100** | 90 | E |

Wins: **E 4, C 2, D 2, F 2, A 1.** E wins more tasks than any other single treatment, and also
posts the two worst context-treatment results in the study.

---

## 9. Where Monet wins

**Evidence class 1 (scored).**

**Retrieval wins on ambiguity and on partial opinion — where filtering is the point.**

| Segment | n | A | C | D | **E** | F |
| --- | --- | --- | --- | --- | --- | --- |
| Monet has a *partial* opinion | 3 | 69.3 | 89.3 | 87.2 | **94.4** | 93.0 |
| High ambiguity | 3 | 63.9 | 88.9 | 83.3 | **91.7** | 94.4 |
| Retrieval returned ≥1 pattern | 10 | 73.5 | 91.6 | 90.9 | 91.4 | **94.9** |
| `coverage: task_specific` | 10 | 73.5 | 91.6 | 90.9 | 91.4 | **94.9** |

On the high-ambiguity tasks E beats D by **+8.4** and C by **+2.8**. On partial-opinion tasks E
beats C by **+5.1** and D by **+7.2**. The mechanism is plausible and matches the qualitative
reading: when a task is vague, a 42 KB document invites the agent to graze, while a scoped
brief plus an explicit "confirm these are the right records" notice concentrates it.

**Dark mode is a real Monet win over static-with-one-file.**

| Segment | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| dark-mode dimension | 50.0 | 75.0 | 75.0 | **100.0** | **100.0** | **100.0** |

C — which carries dark values inline as `· dark:` annotations — scores 75. D (given both light
and dark files) and E/F (given `mode_values`) score 100. The mode axis pays, and it pays
through the *paired* representation, not merely through having the values.

**Token discipline.** Every context treatment takes the tokens dimension from 50% to 100%. This
is the cheapest, most reliable effect Monet produces and it does not depend on retrieval at
all — any delivery of the token records achieves it.

**F is the strongest configuration in the study** and it is built entirely from records Monet
already has. Pattern bodies cost 5–12 KB (§5.8) and are worth +3.9 points.

---

## 10. Where Monet does not win

**Evidence class 1 (scored).** This section is the point of the exercise; none of it is hedged.

**When retrieval misses, the compact brief is barely better than nothing — while static
documents still deliver.**

| Segment | n | A | B | C | D | **E** | F |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Retrieval returned **no** pattern | 4 | 60.0 | 60.0 | **75.0** | **75.0** | **65.0** | **75.0** |
| `coverage` partial or none | 2 | 60.0 | 60.0 | 75.0 | 75.0 | **65.0** | 75.0 |

**E adds +5.0 over no context on these tasks. C, D and F add +15.0.** The static documents
contain the applicable guidance regardless of whether a retriever found it; the brief does not.
This is the benchmark confirming the instrumentation in §5.1–§5.3 — retrieval failure is not a
cosmetic problem, it removes two thirds of Monet's value on the tasks where it happens.

**On strong-opinion tasks the compact brief is the weakest context treatment.**

| Segment | n | C | D | **E** | F |
| --- | --- | --- | --- | --- | --- |
| Monet has a *strong* opinion | 8 | **90.3** | **90.3** | **86.9** | 92.9 |

Where Monet has the most to say, filtering it *loses* 3.4 points against just handing over the
whole document. Selectivity is a cost here, not a benefit.

**The three tasks where E loses badly are the three the instrumentation predicted.**

| Task | E − best static | What §5 measured about it |
| --- | --- | --- |
| delete-account-flow | **−22.2** | brief returns `pagination` and `tag`, omits `text-input` (§5.6) |
| sign-in-screen | **−16.7** | "sign-in screen" phrasing misses the Forms pattern (§5.2) |
| orders-operations-table | −10.0 | one pattern retrieved; `button` absent from the roster (§5.6) |
| org-policy-inheritance-settings | −10.0 | `coverage: none` — Monet reports no opinion (§5.4) |

This convergence between two independent methods is the strongest single result in the study.
The retrieval defects measured directly against the server show up, task for task, as score
deficits in a blind rubric evaluation.

**Some Monet content changes nothing.** Loading (97.6 → 100.0) and responsive behaviour
(100.0 at A) are already handled correctly by a competent agent with no context. One task,
`projects-table-nonhappy-states`, scores **100% in every treatment including A** — Monet's
records made no difference at all to a task squarely inside its domain.

---

## 11. Information-source contribution (ablation)

**Evidence class 3 — inconclusive because of missing scoring cells.** 26 ablation plans were
generated; only **10 were scored** before the session limit, spread thinly across two tasks.
Every cell below is n=1 or n=2. These numbers should not be used to justify removing anything.

Each ablation removed exactly one subsystem from a real compact brief and regenerated the plan.
Comparison is against **full E on the same task**:

| Ablation removed | n | Mean Δ vs full E | Per-task detail |
| --- | --- | --- | --- |
| Principles | 1 | **+27.8** | delete-account +28 |
| Patterns | 1 | +22.2 | delete-account +22 |
| Coverage/notices ("honesty") | 1 | +22.2 | delete-account +22 |
| Foundations | 2 | +11.1 | delete-account +22, sign-in +0 |
| Tokens | 2 | +11.1 | delete-account +17, sign-in +6 |
| Component decisions | 2 | +8.3 | delete-account +22, sign-in −6 |
| Tier-0/1 compression (48% of bytes) | 1 | 0.0 | sign-in +0 |

**Every ablation scored at least as well as the full brief.** That is not evidence that the
subsystems are worthless — it is almost entirely an artefact of one task. `delete-account-flow`
is the task where full-E scored 72.2% (its worst context result, −22 against C), and *any*
perturbation of that brief improved it. On `sign-in-screen` the deltas are ~0.

Two things can honestly be drawn from this:

1. **Nothing here shows a subsystem earning its bytes.** The one comparison that is close to
   clean — `tier01` on sign-in-screen, which cuts the brief to 48% of its size — produced
   **exactly the same score**. That is a single data point, and it is consistent with the
   budget analysis in §5.7, but it is one data point.
2. **A brief can actively hurt.** On delete-account-flow, removing material *helped* by up to
   28 points. Combined with §5.6 (that brief contains `pagination` and `tag` and omits
   `text-input`), the most likely reading is that off-target retrieved records cost real
   quality, not merely tokens. This is the "cost of false context" hypothesis, and it has one
   task's worth of support.

**What was not measured, and should be, before acting:** per-subsystem contribution across
enough tasks to separate signal from a single bad brief. The intended design was 8 tasks × 7
ablations = 56 scored cells; 10 were obtained.

---

## 12. Dead-weight candidates

Separated by *why* they are candidates, because the two categories deserve different responses.

### 12.1 Architecturally absent — cannot contribute at all (evidence class 1, structural)

These are not sampling artefacts. They were verified against the live server.

| Subsystem | Status | Maintained cost |
| --- | --- | --- |
| **Primitives** | No catalog key, no URI template, dropped from the brief; `full` emits 44 dangling ids | 21 taxonomy entries, 21 decisions, a UI page, merge logic, validation |
| **Contrast validation** | Zero fields reach any agent surface | `shared/contrast.ts`, contracts across every theme × mode |
| **Sources** | Unreachable as resources; only the source *name* leaks | 9 sources, **744 mappings**, AI mapping pipeline |
| **Decision history** | Explicitly stripped from MCP | history arrays on every decision |
| **`monet://themes/{id}`** | Returns 98 bytes, `overrides: {}` | — |

Primitives and Sources are the two largest. Between them they represent a substantial share of
the workspace's maintained surface and they cannot influence an agent's output through any
current path. Either expose them or stop paying for them.

### 12.2 Reaches the agent but did not change the outcome here (evidence class 1, but sample-limited)

- **Principles.** 11.9% of every brief, shipped unconditionally regardless of query, and by
  Monet's own design they cannot vote on coverage. The single ablation that removed them
  scored +27.8. Treatment A — which has no principles at all — posts the *best* calibration
  (4.00) and the best fallback-honesty (91.7) in the study. Nothing observed required them.
- **References.** 0.2% of brief bytes, one record in the corpus, `search_references` returns 0
  for its own documented example, and the single record fires spuriously on a sign-in query.
- **Retrieval provenance** (4.6% of the brief). No rubric criterion depends on it and no plan
  referenced it. It is debugging output shipped to production context.
- **Loading and responsive records.** Agents score 97.6–100% on these dimensions with no
  context at all.

### 12.3 Not dead weight

Foundation guidance and component decisions are 65% of the brief and they are the plausible
source of the +17-to-+21-point effect. Pattern bodies are the highest-value withheld content
(F beats E by +3.9 for 5–12 KB). Theme modes pay (§9). None of these should be cut.

---

## 13. Compact-brief findings and a proposed information budget

**Evidence class 2 — grounded in measured composition (§5.7) and one clean ablation.**

What the brief spends its bytes on, versus what the evidence says is load-bearing:

| Content | Share of brief | Evidence it changes the outcome |
| --- | --- | --- |
| Foundation guidance (98% arrived by expansion) | 34.3% | Indirect; part of the +17–21 effect |
| Component decisions (71% by expansion) | 30.6% | Indirect; part of the same effect |
| Principles (unconditional) | 11.9% | None observed; one ablation +27.8 |
| Tokens (68% never referenced elsewhere) | 9.2% | Strong — tokens dimension 50% → 100% |
| Retrieval provenance | 4.6% | None |
| Pattern intent/avoid only | 4.5% | Bodies are worth +3.9 (F vs E) |
| `mode_values` | 3.9% | Strong — dark-mode dimension 50% → 100% |
| Notices | 0.2% | Mixed (see §15) |

**Proposed tiering — design only, not implemented, and not validated beyond one ablation cell.**

- **Tier 0 (always, ~1 KB):** coverage, notices, theme/mode identity.
- **Tier 1 (always, ~8–12 KB):** directly-matched components with their full decisions;
  **bodies of strongly-matched patterns** (moved *in* from tier 3); the tokens those records
  actually name, plus their `mode_values`.
- **Tier 2 (on demand):** expansion-arrived components and foundations, as index entries with
  URIs rather than full guidance.
- **Tier 3 (resource reads):** Foundation rationale/notes, decision history, everything else.
- **Removed:** retrieval provenance behind a flag; principles behind a flag or reduced to
  titles plus a URI.

Estimated reduction: the measured `tier01` ablation already achieves **48% of full-brief bytes**
and scored identically on its one task. Adding matched pattern bodies back would cost 5–12 KB,
landing near 55–60% of today's size with F-level quality rather than E-level. **This is a
hypothesis with one supporting data point, not a validated result.**

---

## 14. DESIGN.md comparison

**Does a static DESIGN.md get 80–90% of Monet's value?** On this evidence: **it gets 99% of the
decision quality and costs 2.1× the context.**

| | C (`DESIGN_SYSTEM.md`) | D (DESIGN.md) | E (brief) | F (brief + reads) |
| --- | --- | --- | --- | --- |
| Rubric | 90.1% | 89.4% | 89.0% | **92.9%** |
| Context | 41,652 tok | 31,658 tok | **15,055 tok** | 20,117 tok |
| Wins (of 11) | 2 | 2 | **4** | 2 |
| Strong-opinion segment | 90.3 | 90.3 | 86.9 | **92.9** |
| High-ambiguity segment | 88.9 | 83.3 | **91.7** | 94.4 |
| When retrieval misses | **75.0** | **75.0** | 65.0 | **75.0** |
| dark-mode dimension | 75.0 | **100.0** | **100.0** | **100.0** |

**Which tasks expose DESIGN.md's limits?** Only two, and both are ambiguity-driven:
`admin-quick-open-overlay` (E 100 vs D 89) and `public-landing-page` (E 100 vs D 94). D also
loses the dark-mode dimension against C only because C annotates dark inline while D needs two
files — but D still scores 100 there, so the practical gap is with C, not D.

**Does selective retrieval meaningfully outperform giving the agent the whole static document?**
**No — not on quality.** 89.0 vs 89.4 vs 90.1 is noise at n=11. It outperforms decisively on
*cost*: 2.8× less context than C for the same result. If context budget is not scarce, the
static document is the better engineering choice today. If it is scarce — long sessions, many
UI tasks, small context windows, or a token budget — retrieval is worth roughly 2–3×.

**Does structured state (undecided / do_not_use) matter?** Partially. The `undecided_guidance`
notice fires correctly and names real gaps (`chart`, `sparkline`, four date components). But
treatment A — with no status information whatsoever — posts the *best* fallback-honesty score
(91.7 vs E's 83.3). A capable agent is already honest about what it does not know; being told
"this is undecided" did not measurably improve on that here.

**Do theme modes matter?** **Yes, and this is DESIGN.md's clearest structural deficit.** The
paired `mode_values` representation takes the dark-mode dimension from 75% (C, inline
annotations) to 100%. A DESIGN.md pair requires the agent to diff two documents to learn which
of 163 tokens actually move; Monet states the 32 that do.

**Does provenance matter?** No evidence that it does. `theme_overrides`, `source`, and
`override_dependencies` never surfaced in a plan or a rubric criterion.

**Does validation matter to generation?** **No — only to maintenance.** Nothing from
`shared/contrast.ts` reaches an agent (§6.2). Its value is that the hexes handed over are
known-good, which is real but invisible and unfalsifiable from the agent's side.

**Is MCP complexity justified?** On decision quality alone, not yet. It is justified by (a) a
2–3× context saving, (b) the mode pairing, and (c) the fact that **F — which only MCP can
assemble cheaply — is the best treatment in the study.** What would flip the answer decisively:
fixing retrieval so the "when it misses" row stops costing 10 points.

---

## 15. Failure-behaviour findings

**Evidence class 1 for the scores; class 2 for the mechanism.**

**Does Monet's honesty machinery protect the agent?** The measured answer is **no, and it may
mildly hurt.**

| Measure | A (no context) | E (brief) |
| --- | --- | --- |
| Fallback-honesty dimension | **91.7%** | 83.3% |
| Calibration | **4.00** | 3.91 |
| Invented decisions | **0.91** | 2.45 |
| Stated confidence | 11 medium, 1 low | **11 high**, 1 medium |

An agent given *no* design context is better calibrated, invents fewer house rules, and scores
higher on honest fallback than an agent given Monet's brief. Handing an agent a large,
authoritative-looking document — any of C, D, E, F — makes it more confident (all report "high"
confidence almost uniformly) and more willing to assert conventions. Monet's `notices` do not
undo that; they are 0.2% of the payload against 65% of confident-sounding record prose.

**The cost of false context is real and measurable.** On the four tasks where retrieval returned
no pattern, E adds only +5.0 over nothing while the static documents add +15.0 (§10). On
`delete-account-flow`, where the brief demonstrably retrieves the wrong components, E scored
**below** treatment A's peers and every ablation of that brief improved it (§11).

**Where the machinery does work** (instrumentation, §5.4): `coverage: none` + `no_opinion` on
"make this screen feel more polished"; `undecided_guidance` naming `chart`/`sparkline`;
`partial` + `no_opinion` on a rich-text editor. The behaviour is correct when it triggers. The
problem is the trigger: one *medium*-strength match suppresses it entirely, and medium matches
land on things like `file-upload` for a kanban board.

**Outside product UI:** `public-landing-page` is the one out-of-domain task that was scored, and
E scored **100** there — the honest reading is that the brief's Foundation/token content
transfers fine to marketing UI even though Monet's patterns do not.

---

## 16. The strongest argument against Monet

Stated as strongly as the data allows, without strawmanning.

**Monet has built a retrieval system, a domain model, an MCP server, a validation engine, a
theme resolver, a primitives taxonomy, a sources registry and a references pipeline — and the
measured result is that a single generated Markdown file matches it on decision quality.**

C scores 90.1%, E scores 89.0%. The difference is noise. C is produced by a function that
already exists in the codebase and requires no server, no protocol, no scorer, no vocabulary
table, no alias table, no coverage heuristic. Every mechanism that distinguishes Monet from
"cat a file into the prompt" is, on this evidence, a cost centre:

- **Retrieval** is the largest engineering asset and the largest liability. It misses the right
  pattern on 7 of 22 canonical tasks, changes its answer on 6 of 6 paraphrased intents, swings
  brief size 4–10×, and returns `coverage: none` on 28% of natural phrasings. When it misses,
  it costs **10 points against a static file**. Monet's own README example only works because
  the user says "form".
- **The honesty machinery** — the stated differentiator — is beaten by an agent with no context
  at all on both fallback-honesty (91.7 vs 83.3) and invented decisions (0.91 vs 2.45), and its
  trigger is suppressed by a single medium-strength false match.
- **Primitives, Sources, decision history and all of contrast validation** cannot reach an agent
  through any current path. That is 744 source mappings and an entire taxonomy maintained for
  no consumer.
- **Principles** are 11.9% of every request, cannot vote on coverage by design, and the one
  ablation that deleted them scored 28 points higher.
- **The "compact" brief is not compact.** Median 70.5 KB on realistic prompts, 71% of it
  material the query never matched, 68% of its tokens never referenced elsewhere.
- **Monet's own static export is worse than the DESIGN.md it could emit** — 0% of Foundation
  guidance, 1.2% of the file for the entire pattern library — which means the team is already
  shipping a degraded artefact while maintaining the machinery to do better.

The steelmanned alternative: **generate a good DESIGN.md, commit it, delete the server.** You
lose 0.4 points of measured quality, ~2× context efficiency and the mode pairing; you delete
the retrieval layer, the MCP adapter, the coverage heuristic and every subsystem in §12.1. For
a single-user personal design system, that trade looks favourable.

---

## 17. Evidence-based rebuttal

Four of the prosecution's claims are artefacts of this benchmark; three are not.

**Artefact 1 — "C and E tie" is measured at n=11, single-rater, on one model.** The spread is
1.1 points with no inter-rater reliability data (the second-rater pass did not run). A 1.1-point
difference across 11 tasks establishes only that the effect is *not large*, not that it is zero.

**Artefact 2 — the tie is on quality, and the study measured cost too.** E reaches the same
score on **36% of C's context**. For a tool designed to be called repeatedly across a long
coding session, a 2.8× context reduction at equal quality is the normal definition of a win. The
prosecution's framing silently assumes context is free.

**Artefact 3 — "the ablations show nothing matters" rests on 10 scored cells across two tasks,**
one of which (delete-account-flow) is the single worst-performing brief in the study. Six of the
seven ablation rows are n=1 or n=2. Nothing can be removed on that basis.

**Artefact 4 — treatment C exists only because Monet exists.** Comparing "Monet's MCP" against
"a document generated from Monet's records" is not a comparison with a world without Monet. The
honest no-Monet baselines are A (72.3%) and B (71.8%). **The corpus is worth +17 to +21 points
and nothing in this study challenges that.** The argument is about delivery, not value.

**Concede 1 — retrieval is genuinely broken and it is not a small bug.** The phrasing
sensitivity, the pattern misses, and the 10-point deficit when retrieval misses are all real,
independently confirmed by two methods, and traceable to specific code (`RETRIEVAL_ALIASES`
compounds, `decisive = strength !== "weak"`, the dark-mode bigram regex). This is the finding
that should drive the roadmap.

**Concede 2 — the honesty claim is not currently earned.** An agent with no context is better
calibrated. Monet's notices are 0.2% of a payload whose other 65% reads as authoritative. To
make honesty real, the notice would have to change how the rest of the brief is *framed*, not
sit beside it.

**Concede 3 — §12.1 is indefensible as it stands.** Primitives, Sources, decision history and
contrast validation cannot reach an agent. Either they get a path or they get cut.

**What Monet would have to demonstrate to settle the rest:** (a) that fixing retrieval moves the
"when it misses" row from 65 to ≥90, which would make E dominate C and D on both axes; (b) that
the F configuration's +3.9 holds at n≥30; (c) that the tier-0/1 budget holds quality at ~50% of
bytes across a real sample rather than one cell.

---

## 18. Product positioning

Scored against what the benchmark actually demonstrates.

| Candidate | Fraction of measured value it names | Verdict |
| --- | --- | --- |
| "Design system for AI agents" | High — the corpus is the +17–21 effect | Accurate but generic; describes C and D equally |
| "Design memory" | Low | Nothing persists across sessions; nothing is remembered. Retrieval is stateless keyword scoring over a static corpus |
| **"Design decision system"** | **High** | The decisions *are* the value, and "decision" correctly implies approval and status |
| "Design context layer" | Medium | Names the delivery, which is the part that ties with a text file |
| "Design system MCP" | Low | Names the transport, the least-differentiated component |
| "Persistent design taste for coding agents" | **Lowest** | Three claims, none demonstrated: not persistent (stateless), not taste (the corpus is competent generic practice — A already scores 72%), and the agent-facing part is what ties |

**The honest one-sentence description the data supports:**

> Monet is a curated corpus of approved UI design decisions that raises an agent's design
> quality by about 20 points over no context, and delivers it to coding agents at roughly a
> third of the context cost of handing over the whole document.

Both clauses are measured. Neither overclaims.

**Why Monet instead of…**

- **DESIGN.md** — on this evidence, only for context efficiency (2.1×) and the mode pairing. If
  you have context budget to spare, no reason. Monet should emit one regardless (§6.4).
- **AGENTS.md** — treatment H generated 12 plans but **none were scored**, so this cannot be
  answered quantitatively. Descriptively, H agents made **35.2 tool calls and read 30.1 distinct
  workspace files each** to produce the study's longest plans (7,471 chars). That is a working
  path with a high round-trip cost, and `monet/AGENTS.md` already ships it.
- **Storybook docs** — not tested. Out of scope.
- **A design-token file** — insufficient. Tokens alone are 9.2% of the brief; the tokens
  dimension is the easiest win (50→100) but component and pattern guidance carry the rest.
- **shadcn instructions** — actively worse than nothing on calibration (§8.3). Measured.
- **Screenshots in the prompt** — not tested.
- **One large system prompt** — that is treatment C, and it ties on quality at 2.8× the cost.

---

## 19. Proposed public benchmark

Designed so Monet can lose.

**Shape.** 30 tasks × 5 treatments (A, B, D, E, F) × 2 blind raters = 300 scored cells. Drop C
(it is Monet-specific and D is the fair static baseline); keep A and B as floors.

**Task selection.** Stratified and *pre-registered*: 10 where the system has a strong opinion,
10 partial, 10 none; ≥6 high-ambiguity; ≥6 dark-mode; ≥6 outside product UI. **Critically,
phrasing must be sampled, not chosen** — each task gets 3 paraphrases drawn at random, because
§5.3 shows phrasing alone moves results by 4–10×. A benchmark that lets the author pick the
wording is measuring the author.

**Rubrics.** Written before generation, citations verified verbatim against the records
(§4.2 achieved 98%), with an explicit `discriminating` flag audited *down* by an adversarial
reviewer — 70% discriminating (§4.3) is not credible.

**Reproducibility.** Publish the task set, rubrics, generated plans, scores, and the exact
`get_design_context` responses. Pin the model. Report inter-rater agreement; if mean absolute
difference exceeds 10 points, the rubric is too soft to publish.

**Cost control.** Report points-per-1k-tokens as a first-class metric, not a footnote.

**Failure criteria — declared in advance.**

1. If **E − D < 3 points** on overall rubric adherence while E uses **more than half** of D's
   context, the retrieval layer is not justified on quality *or* cost. *(Today: E − D = −0.4 at
   48% of context — passes on cost, fails on quality.)*
2. If **E ≤ A + 10** on any pre-registered segment, retrieval is actively failing there.
   *(Today: the no-pattern segment is E = A + 5.0. **Fails.**)*
3. If **E's fallback-honesty ≤ A's**, the honesty claim is not earned. *(Today: 83.3 vs 91.7.
   **Fails.**)*
4. If **removing a subsystem costs < 2 points** across ≥10 tasks, that subsystem is not paying
   for its bytes.
5. If **inter-rater mean |Δ| > 10 points**, the result is not reportable.

Thresholds are set where they are because +17–21 is the measured value of *having* design
context; a mechanism that cannot recover a third of that gap (criterion 2) or beat an empty
prompt on calibration (criterion 3) is not carrying its weight.

**Two of the five criteria fail today.** That is the honest headline.

---

## 20. Recommended next phase

**Fix retrieval. Nothing else is close.**

The evidence is unusually convergent: retrieval failure is visible in direct instrumentation
(§5.1–5.6), it predicts the exact tasks where E loses in blind scoring (§10), and it is the only
mechanism whose repair would move Monet from "ties a text file" to "dominates it on both axes".

Concretely, in rough order of measured payoff:

1. **Make patterns reachable by task language, not by their own titles.** The Forms pattern's
   aliases are `"login form"`, `"signup form"` — compounds requiring the word *form*. Add
   surface-noun vocabulary (page, screen, flow, view, UI) and intent nouns (sign-in, signup,
   profile, billing, checkout, onboarding) mapping onto pattern vocabulary. This single change
   addresses 5 of the 7 measured pattern misses.
2. **Stop `task_specific` from being reachable by one medium match.** Require either a strong
   match or ≥2 independent medium matches. This is the fix that makes the honesty machinery
   trustworthy, and honesty is the differentiator that currently loses to an empty prompt.
3. **Move strongly-matched pattern *bodies* into the brief.** Worth +3.9 (F vs E) for 5–12 KB —
   the best measured return available from records Monet already holds.
4. **Replace the dark-mode bigram regex** with something that recognises Monet's own vocabulary
   ("appearance"), or simply always ship `mode_values` and drop the detection question.
5. **Then** apply the tier-0/1 budget (§13) to pay for 3 by cutting expansion foundations,
   provenance, and unconditional principles.

**What should NOT be built next:**

- **DESIGN.md export.** It is a good idea (§6.4, and the earlier `design-md-assessment.md`
  recommends it), but it is downstream: exporting a snapshot of a corpus whose delivery layer
  ties with a text file does not change any measured outcome. Build it *after* retrieval works,
  when it becomes a genuine second channel rather than a substitute.
- **More content.** The corpus already produces +17–21. The constraint is that a third of
  natural phrasings never reach it.
- **A conformance/review loop.** It would inherit the same broken retrieval.
- **Primitives exposure.** Cheaper to delete than to wire up, unless there is a demand for it
  that this study did not test.

---

## 21. Open questions for Fable

Ordered by how much they could change the conclusions.

1. **Is the C≈D≈E tie real, or an n=11 single-rater artefact?** This is the load-bearing result
   behind every "retrieval does not pay on quality" claim. No inter-rater reliability was
   obtained. **Challenge this first.**
2. **Does the +17–21 "context is worth a lot" effect survive a harder rubric?** 70% of criteria
   were flagged discriminating, which is implausible; the audit that would have corrected it did
   not complete. If discrimination is inflated, all treatments are compressed toward the ceiling
   and the real spread between them may be larger or smaller than measured.
3. **Would a weaker model change the ranking?** The whole study ran on one strong model, which
   plausibly compresses differences — a strong agent recovers from bad context. The smaller-model
   arm was designed and **never ran**. If context matters more for weaker agents, every effect
   here is a lower bound, and the case for Monet is stronger than reported.
4. **Is E's loss to C/D a formatting artefact?** C, D and H are prose; E and F are raw JSON. The
   prose-format control (treatment G, same brief rendered as Markdown) was built and **never
   ran**. If format explains the gap, the fix is a renderer, not retrieval.
5. **Does treatment H beat E?** 12 H plans exist and none were scored. H is the sharpest
   competitor to the whole MCP thesis — an agent with `AGENTS.md` and file access made 35 tool
   calls and read 30 files per task. Scoring those 12 plans is the cheapest high-value
   experiment remaining.
6. **Is "an agent with no context is better calibrated" a real finding or a rubric artefact?**
   A scoring 91.7 on fallback-honesty against E's 83.3 is either the most interesting result in
   the study or an artefact of rubrics that reward hedging. It drives the §16 honesty critique.
7. **Is the delete-account-flow ablation result signal or noise?** Every ablation improved that
   brief by up to 28 points. If the "off-target retrieved records actively hurt" reading is
   right, retrieval *precision* matters as much as recall and §20's ordering may be wrong.
8. **Should Primitives and Sources be exposed or deleted?** 744 mappings and a 21-entry taxonomy
   currently reach no consumer. This study tested no task that needed them, so it cannot say
   whether the demand exists.
9. **Is 2–3× context efficiency worth the architecture to this user?** For a single-user personal
   design system on a large-context model, possibly not. The answer depends on session length
   and budget, which the study did not model.

---

## Appendix — what was run

| Artefact | Status |
| --- | --- |
| Direct instrumentation of the live MCP server | **Complete** — §5, §6, §7 |
| Pre-registered task set, 38 tasks / 364 rubric items | **Complete**, 98% citations verified |
| Generation, 12 tasks × 7 treatments (A–F, H) | **Complete** — 84/84, 0 errors |
| Subsystem ablations | **Partial** — 26 of 56 generated |
| Blind scoring, rater 1 | **Partial** — 75 of 110 cells; A–E complete at n=11, F n=10, **H n=0** |
| Blind scoring, rater 2 (inter-rater reliability) | **Not run** |
| Smaller-model arm | **Not run** |
| Prose-format control (treatment G) | **Not run** |
| URI-following probe (does an agent know when to fetch?) | **Not run** |

Generation and scoring were interrupted twice by session usage limits. The scope was reduced
from 38 tasks to 12 rather than re-running; no result was extrapolated to a cell that did not
execute. All scratch artefacts — harnesses, contexts, plans, scores — live outside the
repository under the session scratchpad and were deliberately not committed.
