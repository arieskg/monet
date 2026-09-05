import { beforeAll, describe, expect, it } from "vitest";
import { loadWorkspace } from "../server/fileStore.js";
import type { ContextNoticeKind, DesignContext, RetrievalCoverage, ThemeMode } from "./model.js";
import { createMonetService, type MonetService } from "./service.js";

/**
 * A regression suite of natural UI-building requests, phrased the way someone actually asks rather
 * than in Monet's own vocabulary. Cases assert that the right records are present and that specific
 * wrong ones are absent; they never pin the exact result set, so retrieval can keep improving
 * without the suite fighting it. The point is generalisation: most of these prompts share no alias
 * or vocabulary entry with each other.
 */

type Bucket = "foundations" | "patterns" | "components" | "references";

interface Case {
  /** What the user types. */
  query: string;
  /** Records that must be present for the answer to be useful. */
  expect?: Partial<Record<Bucket, string[]>>;
  /** Records whose presence would be a real false positive, not merely surplus. */
  forbid?: Partial<Record<Bucket, string[]>>;
  /** The record that must rank first, used where the useful assertion is ordering rather than membership. */
  leads?: Partial<Record<Bucket, string>>;
  coverage?: RetrievalCoverage;
  /** Notice kinds the result must carry, such as an unsupported capability. */
  notices?: ContextNoticeKind[];
  /** Notice kinds that would be wrong here, such as calling a supported capability unsupported. */
  forbidNotices?: ContextNoticeKind[];
  /** The mode the result must be resolved in, where the query implies one. */
  mode?: ThemeMode;
}

const CASES: Case[] = [
  // Authentication
  {
    query: "build a login form",
    expect: { patterns: ["forms"], components: ["text-input", "password-input", "button", "field", "label"] },
    forbid: { components: ["slider", "rating", "clipboard", "data-table"], patterns: ["settings", "dashboard"] },
    coverage: "task_specific",
  },
  {
    query: "sign up page with email and password",
    expect: { components: ["password-input", "text-input"] },
    forbid: { components: ["slider", "rating"] },
  },
  // Destructive confirmation
  {
    query: "add a confirmation modal before deleting a project",
    expect: { patterns: ["destructive-actions", "overlays"], components: ["alert-dialog"] },
    forbid: { components: ["slider", "statistic"] },
    coverage: "task_specific",
  },
  {
    query: "warn the user before they permanently remove their account",
    expect: { patterns: ["destructive-actions"] },
  },
  // Overlays
  {
    query: "show a popup with a small filter form attached to a button",
    expect: { components: ["popover"], patterns: ["overlays"] },
    forbid: { components: ["statistic", "avatar"] },
  },
  {
    // Nothing here names Drawer, but its own record does: an edge-anchored panel, for inspecting or
    // editing a record beside its collection. Several fields answering different parts of the
    // request is decisive evidence, so this is an answer rather than a shortlist.
    query: "slide a panel in from the right to edit a record",
    expect: { components: ["drawer"] },
    leads: { components: "drawer" },
    coverage: "task_specific",
  },
  // Tables and CRUD
  {
    query: "table with inline editing and bulk actions",
    expect: { patterns: ["data-tables"], components: ["data-table", "checkbox"] },
    forbid: { components: ["statistic", "avatar", "rating"] },
    coverage: "task_specific",
  },
  {
    query: "paginated list of users I can sort and filter",
    expect: { components: ["data-table", "pagination"] },
    forbid: { components: ["rating", "clipboard"] },
  },
  {
    query: "crud screen for managing invoices",
    expect: { components: ["data-table"] },
  },
  // Settings
  {
    query: "build a settings page",
    expect: { patterns: ["settings"], components: ["switch", "field"] },
    forbid: { components: ["data-table", "statistic"] },
    coverage: "task_specific",
  },
  {
    query: "account preferences with toggles that save immediately",
    expect: { components: ["switch"], patterns: ["settings"] },
  },
  // Search and filtering
  {
    query: "add a search box that filters the list as you type",
    expect: { components: ["search-input"], patterns: ["filtering"] },
    forbid: { components: ["statistic", "avatar"] },
  },
  {
    query: "build a command palette / search experience",
    expect: { components: ["command-palette", "search-input", "dialog"] },
    forbid: { components: ["data-table", "statistic"] },
  },
  // Navigation
  {
    query: "left hand navigation for a workspace app",
    expect: { components: ["sidebar"], patterns: ["navigation"] },
    forbid: { components: ["data-table", "rating"] },
  },
  {
    query: "show the user where they are in a nested hierarchy",
    expect: { components: ["breadcrumb"] },
  },
  {
    query: "switch between overview and activity views of one record",
    expect: { components: ["tabs"] },
    forbid: { components: ["stepper"] },
  },
  // Application layout
  {
    query: "page chrome with a header and a persistent nav",
    expect: { patterns: ["app-shell"] },
  },
  {
    query: "inbox layout with a list on the left and details on the right",
    expect: { patterns: ["master-detail"], components: ["list"] },
    forbid: { components: ["sidebar"] },
  },
  // Dashboard
  {
    query: "build a data-heavy dashboard",
    expect: { patterns: ["dashboard"], components: ["statistic", "data-table"] },
    forbid: { patterns: ["forms"], components: ["command-palette", "password-input"] },
    coverage: "task_specific",
  },
  {
    query: "show key metrics at the top of the page",
    expect: { components: ["statistic"] },
    forbid: { components: ["password-input"] },
  },
  // Empty, loading and error states
  {
    query: "what should I show when a collection has no items yet",
    expect: { patterns: ["empty-states"], components: ["empty-state"] },
  },
  {
    query: "show progress while a long import is running",
    expect: { patterns: ["loading"], components: ["progress"] },
    forbid: { components: ["statistic"] },
  },
  {
    query: "handle a failed save without losing what the user typed",
    expect: { patterns: ["error-handling"] },
  },
  // Files, cards and references
  {
    query: "let people drag and drop a file to attach it",
    expect: { components: ["file-upload"] },
    forbidNotices: ["undecided_guidance"],
  },
  {
    query: "make a card grid of documents like Linear docs",
    expect: { components: ["card"], references: ["linear-doc-pages"] },
    forbid: { components: ["password-input", "statistic"] },
  },
  // Responsive and mobile
  {
    query: "make this work on a phone",
    expect: { foundations: ["breakpoints"] },
  },
  {
    query: "bottom sheet for actions on a small screen",
    expect: { components: ["sheet"] },
    forbid: { components: ["data-table"] },
  },
  // Onboarding — catalogued but undecided, which the result must say out loud
  {
    query: "build an onboarding wizard",
    expect: { components: ["stepper"] },
    notices: ["undecided_guidance"],
  },
  // A dark-mode task resolves in dark mode, so the capability is supplied rather than declared missing
  {
    query: "build a dark mode dashboard",
    expect: { patterns: ["dashboard"] },
    forbidNotices: ["unsupported_capability"],
    mode: "dark",
  },
  // Tasks Monet has no opinion on
  {
    query: "pricing page",
    coverage: "none",
    notices: ["no_opinion"],
    forbid: { components: ["card", "statistic"], patterns: ["dashboard"] },
  },
  {
    query: "kanban board",
    coverage: "none",
    notices: ["no_opinion"],
    forbid: { components: ["card", "data-table"] },
  },
  // Half-matched compound aliases. Each of these used to claim identity from its distinctive
  // half — "product layout", "pin-input", "file-input", "range-input", "toggle-group" — and pull
  // an unrelated record in as a strong match.
  {
    query: "faceted filters for a product catalog",
    expect: { patterns: ["filtering"] },
    forbid: { patterns: ["app-shell"], components: ["sidebar", "navigation-menu", "breadcrumb"] },
  },
  {
    // Monet has nothing for maps. A weak candidate on "location" is fine; claiming OTP Input is not.
    query: "map with location pins",
    forbid: { components: ["otp-input", "text-input"], foundations: ["color", "spacing", "typography"] },
    coverage: "partial",
    notices: ["no_opinion"],
  },
  {
    query: "context menu on right click of a file",
    expect: { components: ["context-menu"] },
    forbid: { components: ["file-upload"] },
  },
  {
    query: "usage report with a date range selector",
    expect: { components: ["date-range-picker"] },
    forbid: { components: ["slider", "number-input"] },
  },
  {
    query: "night mode toggle",
    expect: { components: ["switch"] },
    forbid: { components: ["segmented-control", "tabs", "radio"] },
  },
  // Accidental word overlap. Each returns its weak candidates without dressing them up as an
  // answer, so coverage stays partial and no Foundations are expanded behind them.
  {
    query: "let users pick which columns to show",
    coverage: "partial",
    notices: ["no_opinion"],
    forbid: { foundations: ["color", "typography", "spacing", "elevation", "layering"] },
  },
  {
    query: "the thing at the top that shows where you are",
    coverage: "partial",
    notices: ["no_opinion"],
    forbid: { foundations: ["typography", "color", "spacing", "layout"] },
  },
  {
    query: "rich text editor toolbar",
    coverage: "partial",
    notices: ["no_opinion"],
    forbid: { foundations: ["color", "typography", "spacing", "radius", "borders"] },
  },
  {
    query: "data",
    coverage: "partial",
    notices: ["no_opinion"],
    forbid: { foundations: ["typography", "spacing", "borders", "color", "interaction", "layout"] },
  },
  // Opinion Wave 2. These are the decisions the second pass added, asked for the way a task asks
  // for them rather than in Monet's vocabulary: the request names the value, the affordance, or
  // the job, and never the record. Nothing here shares an alias or a synonym entry with the case
  // above it, so passing them together is a claim about the mechanism and not about the phrasing.
  {
    query: "quantity field with plus and minus",
    expect: { components: ["number-input"] },
    forbid: { components: ["otp-input", "date-picker", "statistic"] },
    coverage: "task_specific",
  },
  {
    query: "page size selector with a numeric stepper",
    expect: { components: ["number-input"] },
    forbid: { components: ["otp-input", "date-picker"] },
  },
  {
    query: "copy the API key",
    expect: { components: ["clipboard"] },
    forbid: { components: ["password-input", "keyboard-shortcut", "text-input"] },
    coverage: "task_specific",
  },
  {
    query: "copy a share link to the clipboard",
    expect: { components: ["clipboard"] },
    forbid: { components: ["file-upload", "search-input"] },
  },
  {
    query: "suggest email addresses while typing",
    expect: { components: ["autocomplete"] },
    forbid: { components: ["password-input", "number-input", "text-input"] },
    coverage: "task_specific",
  },
  {
    query: "autocomplete the city name as they type",
    expect: { components: ["autocomplete", "combobox"] },
    forbid: { components: ["date-picker", "number-input"] },
  },
  {
    query: "profile photo with initials fallback",
    expect: { components: ["avatar"] },
    forbid: { components: ["file-upload", "card", "skeleton"] },
    coverage: "task_specific",
  },
  {
    query: "show the author next to each comment",
    expect: { components: ["avatar"] },
    forbid: { components: ["file-upload", "card"] },
    coverage: "task_specific",
  },
  {
    query: "pick several tags for a post",
    expect: { components: ["multi-select", "tag"] },
    forbid: { components: ["radio", "date-picker"] },
    coverage: "task_specific",
  },
  {
    // "Several" is the only word here that reaches Multi-select, and reaching it weakly would
    // report a shortlist for a concept Monet has actually decided.
    query: "assign several owners to an issue",
    expect: { components: ["multi-select"] },
    forbid: { components: ["radio", "avatar"] },
    coverage: "task_specific",
  },
  {
    query: "space out a column of cards",
    expect: { components: ["stack", "card"] },
    forbid: { components: ["data-table", "table", "divider"] },
    coverage: "task_specific",
  },
  {
    query: "one consistent gap between the fields in a form",
    expect: { components: ["stack"] },
    forbid: { components: ["data-table", "divider"] },
  },
  {
    query: "scrollable panel inside a dialog",
    expect: { components: ["scroll-area", "dialog"] },
    forbid: { components: ["carousel", "sheet"] },
    coverage: "task_specific",
  },
  {
    query: "long option list that scrolls inside a popover",
    expect: { components: ["scroll-area", "popover"] },
    forbid: { components: ["carousel", "data-table"] },
  },
  // The rest of Wave 2, asked for the same way.
  {
    query: "collapsible FAQ sections",
    expect: { components: ["accordion"] },
    leads: { components: "accordion" },
    forbid: { components: ["stepper", "carousel"] },
  },
  {
    query: "separate groups of commands inside a menu",
    expect: { components: ["divider"] },
    forbid: { components: ["tabs", "breadcrumb"] },
  },
  {
    query: "one item should grow while the others keep their size",
    expect: { components: ["flex"] },
    leads: { components: "flex" },
    forbid: { components: ["data-table", "table"] },
  },
  {
    query: "responsive tiles that reflow on narrow screens",
    expect: { components: ["grid"] },
    leads: { components: "grid" },
    forbid: { components: ["data-table", "carousel"] },
  },
  {
    query: "toggle between list view and grid view",
    expect: { components: ["segmented-control"] },
    forbid: { components: ["carousel", "data-table"] },
  },
  {
    query: "site-wide maintenance notice across the top of every page",
    expect: { components: ["banner"] },
    forbid: { components: ["toast", "tooltip"] },
  },
  {
    query: "let people drag to set a rough value between two ends",
    expect: { components: ["slider"] },
    leads: { components: "slider" },
    forbid: { components: ["carousel", "file-upload"] },
  },
  {
    query: "schedule a post for a specific date and time",
    expect: { components: ["date-time-picker", "date-input"] },
    forbid: { components: ["slider", "number-input"] },
  },
  {
    query: "choose a meeting time",
    expect: { components: ["time-picker"] },
    leads: { components: "time-picker" },
    forbid: { components: ["calendar", "date-range-picker"] },
  },
  {
    query: "let people type a date straight into the field",
    expect: { components: ["date-input"] },
    forbid: { components: ["calendar", "time-picker"] },
  },
  {
    query: "right click a row for more actions",
    expect: { components: ["context-menu"] },
    forbid: { components: ["file-upload", "data-table"] },
  },
  // Vocabulary and folding that Wave 2 relies on, checked where the answer was already decided:
  // "sortable" must reach Sort, "removable" must reach Remove, without either word being an alias.
  {
    query: "sortable columns in a table",
    expect: { components: ["data-table"] },
    forbid: { components: ["scroll-area", "slider"] },
  },
  {
    query: "removable chips on a filter bar",
    expect: { components: ["tag"] },
    forbid: { components: ["clipboard", "file-upload"] },
  },
  // A review workflow, which is about Foundations rather than components
  {
    query: "review an existing UI against my Monet design system",
    expect: { foundations: ["color", "spacing", "typography", "layout"] },
    forbid: { components: ["data-table", "password-input"] },
  },
];

function ids(context: DesignContext, bucket: Bucket): string[] {
  return context[bucket].map((item) => item.id);
}

describe("Monet retrieval evaluation", () => {
  let service: MonetService;
  const contexts = new Map<string, DesignContext>();

  beforeAll(async () => {
    service = createMonetService({ loadWorkspace });
    for (const testCase of CASES) contexts.set(testCase.query, await service.getDesignContext({ query: testCase.query }));
  });

  it.each(CASES.map((testCase) => [testCase.query, testCase] as const))("retrieves useful context for %s", (query, testCase) => {
    const context = contexts.get(query)!;
    for (const [bucket, expected] of Object.entries(testCase.expect ?? {})) {
      expect(ids(context, bucket as Bucket), `${query} → ${bucket}`).toEqual(expect.arrayContaining(expected));
    }
    for (const [bucket, forbidden] of Object.entries(testCase.forbid ?? {})) {
      const found = ids(context, bucket as Bucket).filter((id) => forbidden.includes(id));
      expect(found, `${query} → unrelated ${bucket}`).toEqual([]);
    }
    for (const [bucket, expected] of Object.entries(testCase.leads ?? {})) {
      expect(ids(context, bucket as Bucket)[0], `${query} → leading ${bucket}`).toBe(expected);
    }
    if (testCase.coverage) expect(context.coverage, `${query} → coverage`).toBe(testCase.coverage);
    for (const kind of testCase.notices ?? []) {
      expect(context.notices.map((notice) => notice.kind), `${query} → notices`).toContain(kind);
    }
    for (const kind of testCase.forbidNotices ?? []) {
      expect(context.notices.map((notice) => notice.kind), `${query} → wrong notice`).not.toContain(kind);
    }
    if (testCase.mode) expect(context.mode, `${query} → mode`).toBe(testCase.mode);
    expect(context.warnings).toEqual([]);
  });

  it("keeps every scoped brief bounded rather than returning the whole catalog", () => {
    const oversized = [...contexts].filter(([, context]) => context.components.length > 14 || context.patterns.length > 4 || context.foundations.length > 9);
    expect(oversized.map(([query, context]) => `${query}: ${context.components.length}c ${context.patterns.length}p ${context.foundations.length}f`)).toEqual([]);
  });

  it("explains every retrieved record with provenance the caller can audit", () => {
    for (const [query, context] of contexts) {
      const explained = new Set(context.retrieval.map((match) => `${match.entity_type}:${match.entity_id}`));
      const buckets: [Bucket, string][] = [["foundations", "foundation"], ["patterns", "pattern"], ["components", "component"], ["references", "reference"]];
      for (const [bucket, entity] of buckets) {
        const unexplained = ids(context, bucket).filter((id) => !explained.has(`${entity}:${id}`));
        expect(unexplained, `${query} → unexplained ${bucket}`).toEqual([]);
      }
    }
  });

  it("never reports task-specific coverage on global principles alone", () => {
    for (const [query, context] of contexts) {
      const taskRecords = context.foundations.length + context.patterns.length + context.components.length + context.references.length;
      if (!taskRecords) expect(context.coverage, `${query}`).toBe("none");
      if (context.coverage === "none") expect(context.notices.map((notice) => notice.kind)).toContain("no_opinion");
    }
  });
});
