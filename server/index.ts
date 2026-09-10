import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { analyzeReferences, analyzeSavedReference, deleteMarkdown, deleteReference, deleteSource, deleteTheme, duplicateTheme, initializeStore, loadWorkspace, mergePrimitive, readReferenceAsset, refreshSourceMappings, saveComponents, saveFoundation, saveMarkdown, savePrinciple, savePrimitive, savePrimitiveTaxonomy, saveReference, saveReferenceAnalysis, saveSource, saveTheme, setDefaultTheme, type ReferenceSaveInput } from "./fileStore.js";
import type { ComponentDecision, Foundation, MarkdownDocument, Principle, PrimitiveDecision, ReferenceCollectionAnalysis, Source, TaxonomyCategory, Theme, ThemeMode } from "./model.js";
import { THEME_MODES } from "../shared/model.js";
import { isBundledWorkspace, resolveWorkspaceRoot, setWorkspaceRoot } from "./workspace.js";
import { AI_COMMAND_VARIABLE, providerConfigured } from "./aiProvider.js";
import { createMonetService } from "../shared/service.js";
import { createGap, deleteGap, diagnoseSavedGap, getGap, listGaps, readGapImage, saveGapReview } from "./fileStore.js";
import { providerSupportsImages } from "./aiProvider.js";
import { approveProposal, createProposal, draftProposalWithAi, gapProposalOverview, getProposal, listProposals, rebaseProposal, rejectProposal, saveProposalRevision, supersedeProposal } from "./proposalStore.js";
import { ApplyError, applyProposal, getApplication, listApplications, planApplication, recoverApplications } from "./applicationStore.js";
import { WorkspaceUnavailableError } from "./writeLock.js";
import { ZodError } from "zod";

// Resolve the workspace before the first read so `--root` and MONET_ROOT take effect.
const workspaceDirectory = resolveWorkspaceRoot();
setWorkspaceRoot(workspaceDirectory);

const PORT = Number(process.env.MONET_PORT ?? 43141);
const MAX_BODY = 512 * 1024;
const monet = createMonetService({ loadWorkspace });

function respond(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  response.end(body);
}

function allowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === "127.0.0.1" || url.hostname === "localhost") && (url.protocol === "http:" || url.protocol === "https:");
  } catch { return false; }
}

async function body(request: IncomingMessage, maxSize = MAX_BODY): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += next.length;
    if (size > maxSize) throw new Error("Request body is too large.");
    chunks.push(next);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function match(pathname: string, prefix: string): string | null {
  return pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length)) : null;
}

const server = createServer(async (request, response) => {
  try {
    if (!allowedOrigin(request)) return respond(response, 403, { error: "Monet only accepts requests from a local browser origin." });
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/gaps") {
      if (request.method === "GET") return respond(response, 200, await listGaps());
      if (request.method === "POST") return respond(response, 201, await createGap(await body(request, 14 * 1024 * 1024)));
    }
    const gapImage = match(url.pathname, "/api/gap-images/");
    if (request.method === "GET" && gapImage) {
      const image = await readGapImage(gapImage);
      response.writeHead(200, { "content-type": image.mediaType, "content-length": image.contents.length,
        "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'" });
      response.end(image.contents);
      return;
    }
    const gapAnalysis = match(url.pathname, "/api/gap-diagnoses/");
    if (request.method === "POST" && gapAnalysis) return respond(response, 200, await diagnoseSavedGap(gapAnalysis));
    const gapReview = match(url.pathname, "/api/gap-reviews/");
    if (request.method === "POST" && gapReview) return respond(response, 200, await saveGapReview(gapReview, await body(request)));
    const gap = match(url.pathname, "/api/gaps/");
    if (request.method === "GET" && gap) return respond(response, 200, await getGap(gap));
    if (request.method === "DELETE" && gap) { await deleteGap(gap); return respond(response, 200, { ok: true }); }
    // Applications: the receipts of applied proposals, and the one route that writes canonical records from an approved revision.
    if (request.method === "GET" && url.pathname === "/api/applications") return respond(response, 200, await listApplications(url.searchParams.get("proposal") ?? undefined));
    const application = match(url.pathname, "/api/applications/");
    if (request.method === "GET" && application) return respond(response, 200, await getApplication(application));
    const proposalApplication = match(url.pathname, "/api/proposal-applications/");
    if (request.method === "GET" && proposalApplication) return respond(response, 200, await planApplication(proposalApplication));
    if (request.method === "POST" && proposalApplication) return respond(response, 200, await applyProposal(proposalApplication, request.headers["content-length"] && request.headers["content-length"] !== "0" ? await body(request) : {}));
    // Proposals: editor-only change sets derived from a Gap diagnosis. Review and approval only; no route here writes a canonical record.
    if (url.pathname === "/api/proposals") {
      if (request.method === "GET") return respond(response, 200, await listProposals(url.searchParams.get("gap") ?? undefined));
      if (request.method === "POST") return respond(response, 201, await createProposal(await body(request)));
    }
    const gapProposals = match(url.pathname, "/api/gap-proposals/");
    if (request.method === "GET" && gapProposals) return respond(response, 200, await gapProposalOverview(gapProposals));
    const proposal = match(url.pathname, "/api/proposals/");
    if (request.method === "GET" && proposal) return respond(response, 200, await getProposal(proposal));
    const proposalActions: [prefix: string, action: (id: string, value: unknown) => Promise<unknown>][] = [
      ["/api/proposal-revisions/", (id, value) => saveProposalRevision(id, value)],
      ["/api/proposal-drafts/", (id) => draftProposalWithAi(id)],
      ["/api/proposal-approvals/", (id, value) => approveProposal(id, value)],
      ["/api/proposal-rejections/", (id, value) => rejectProposal(id, value)],
      ["/api/proposal-supersessions/", (id) => supersedeProposal(id)],
      ["/api/proposal-rebases/", (id) => rebaseProposal(id)],
    ];
    for (const [prefix, action] of proposalActions) {
      const id = match(url.pathname, prefix);
      if (request.method === "POST" && id) return respond(response, 200, await action(id, request.headers["content-length"] && request.headers["content-length"] !== "0" ? await body(request) : {}));
    }
    const referenceAsset = match(url.pathname, "/api/reference-assets/");
    if (request.method === "GET" && referenceAsset) {
      const asset = await readReferenceAsset(referenceAsset);
      response.writeHead(200, {
        "content-type": asset.mediaType,
        "content-length": asset.contents.byteLength,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'",
      });
      response.end(asset.contents);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/environment") {
      // Editor-only. The workspace records themselves say nothing about where they came from or
      // whether the optional provider is configured, and the onboarding surfaces need both.
      return respond(response, 200, {
        root: workspaceDirectory,
        // Where `pnpm mcp` has to be run from, which is not the workspace when MONET_ROOT is set.
        appRoot: path.resolve(import.meta.dirname, ".."),
        bundled: isBundledWorkspace(workspaceDirectory),
        aiConfigured: providerConfigured(),
        aiVariable: AI_COMMAND_VARIABLE,
        aiImages: providerSupportsImages(),
      });
    }
    if (request.method === "GET" && url.pathname === "/api/workspace") {
      const mode = url.searchParams.get("mode");
      return respond(response, 200, await monet.getWorkspace(url.searchParams.get("theme") ?? undefined, THEME_MODES.includes(mode as ThemeMode) ? mode as ThemeMode : undefined));
    }
    if (request.method === "POST" && url.pathname === "/api/default-theme") {
      const value = await body(request) as { id?: string };
      await setDefaultTheme(value.id ?? "");
      return respond(response, 200, { ok: true });
    }
    const themeDuplicate = match(url.pathname, "/api/theme-duplicates/");
    if (request.method === "POST" && themeDuplicate) {
      const value = await body(request) as { name?: string };
      return respond(response, 200, await duplicateTheme(themeDuplicate, value.name));
    }
    if (request.method === "PUT" && url.pathname === "/api/primitive-taxonomy") { await savePrimitiveTaxonomy(await body(request) as TaxonomyCategory[]); return respond(response, 200, { ok: true }); }
    const primitiveMerge = match(url.pathname, "/api/primitive-merges/");
    if (request.method === "POST" && primitiveMerge) {
      const value = await body(request) as { target?: string };
      await mergePrimitive(primitiveMerge, value.target ?? "");
      return respond(response, 200, { ok: true });
    }
    const sourceRefresh = match(url.pathname, "/api/source-refreshes/");
    if (request.method === "POST" && sourceRefresh) return respond(response, 200, await refreshSourceMappings(sourceRefresh));
    const referenceAnalysis = match(url.pathname, "/api/reference-analyses/");
    if (request.method === "POST" && referenceAnalysis) return respond(response, 200, await analyzeSavedReference(referenceAnalysis));
    if (url.pathname === "/api/reference-collection-analysis" && request.method === "POST") return respond(response, 200, await analyzeReferences());
    if (url.pathname === "/api/reference-collection-analysis" && request.method === "PUT") return respond(response, 200, await saveReferenceAnalysis(await body(request) as ReferenceCollectionAnalysis));
    const reference = match(url.pathname, "/api/references/");
    if (reference) {
      if (request.method === "PUT") return respond(response, 200, await saveReference(reference, await body(request, 14 * 1024 * 1024) as ReferenceSaveInput));
      if (request.method === "DELETE") { await deleteReference(reference); return respond(response, 200, { ok: true }); }
    }

    const routes = [
      { prefix: "/api/principles/", save: (id: string, value: unknown) => savePrinciple(id, value as Principle), remove: (id: string) => deleteMarkdown("principles", id) },
      { prefix: "/api/patterns/", save: (id: string, value: unknown) => saveMarkdown("patterns", id, value as MarkdownDocument), remove: (id: string) => deleteMarkdown("patterns", id) },
      { prefix: "/api/foundations/", save: (id: string, value: unknown) => saveFoundation(id, value as Foundation) },
      { prefix: "/api/primitives/", save: (id: string, value: unknown) => savePrimitive(id, value as PrimitiveDecision) },
      { prefix: "/api/components/", save: (id: string, value: unknown) => saveComponents(id, value as ComponentDecision) },
      { prefix: "/api/themes/", save: (id: string, value: unknown) => saveTheme(id, value as Theme), remove: (id: string) => deleteTheme(id) },
      { prefix: "/api/sources/", save: (id: string, value: unknown) => saveSource(id, value as Source), remove: (id: string) => deleteSource(id) },
    ];
    for (const route of routes) {
      const id = match(url.pathname, route.prefix);
      if (!id) continue;
      if (request.method === "PUT") { await route.save(id, await body(request)); return respond(response, 200, { ok: true }); }
      if (request.method === "DELETE" && route.remove) { await route.remove(id); return respond(response, 200, { ok: true }); }
    }
    return respond(response, 404, { error: "Not found." });
  } catch (error) {
    if (error instanceof ZodError) return respond(response, 400, { error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
    // An Apply failure says which gate refused it, and carries the rollback receipt when writing had started.
    const detail = error instanceof ApplyError ? { kind: error.kind, receipt: error.receipt } : error instanceof WorkspaceUnavailableError ? { kind: error.kind } : {};
    respond(response, (error as NodeJS.ErrnoException)?.code === "ENOENT" ? 404 : status ?? (message === "Invalid record id." ? 400 : 500), { error: (error as NodeJS.ErrnoException)?.code === "ENOENT" ? "Record not found." : message, ...detail });
  }
});

// An application interrupted by a crash is rolled back or completed before any request can edit the workspace.
for (const recovery of await recoverApplications()) {
  console.log(`Recovered application ${recovery.application_id} for proposal ${recovery.proposal_id}: ${recovery.outcome === "completed" ? "completed" : recovery.restored ? "rolled back, every record restored" : `rolled back, restore NOT verified (${recovery.failure ?? "unknown"})`}`);
}
await initializeStore();
server.listen(PORT, "127.0.0.1", () => {
  const address = server.address();
  console.log(`Monet file service: http://127.0.0.1:${typeof address === "object" && address ? address.port : PORT}`);
  console.log(`Workspace: ${workspaceDirectory}${isBundledWorkspace(workspaceDirectory) ? " (bundled starter workspace — set MONET_ROOT to use your own)" : ""}`);
});
