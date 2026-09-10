import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { ApplicationReceipt, ApplyPlan, ApplyResult } from "../shared/proposals.js";
import { BUNDLED_WORKSPACE } from "./workspace.js";

/**
 * The fixture provider answers whichever schema it is handed: an eligible diagnosis for Gap
 * diagnosis, a typed draft for Proposal drafting. It exercises the transport, not model quality.
 */
const PROVIDER_SCRIPT = `
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const schema = readFileSync(args[args.indexOf("--output-schema") + 1], "utf8");
const out = args[args.indexOf("-o") + 1];
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const diagnosis = { conclusion: "Card actions lack guidance.", image_inspected: false, measured_errors: "not_assessed", findings: [
    { classification: "weak_guidance", conclusion: "Button guidance does not cover cards.", reasoning: "The report shows ambiguity.", evidence_ids: ["problem"], record_keys: ["component:button"], uncertainty: [], next_action: "Extend use_when." },
  ] };
  const draft = { summary: "Cover card actions", rationale: "Buttons inside cards need to read as actions.", changes: [
    { target: "component:button", operation: "amend", field: "notes", value: "Inside a card, keep one primary action and style the rest as secondary buttons.", note: "" },
  ] };
  writeFileSync(out, JSON.stringify(schema.includes("measured_errors") ? diagnosis : draft));
});
`;

/** Byte-exact comparison via Buffer.equals: vitest's toEqual walks every byte of these large files as an object key and takes seconds on CI. */
async function expectBytesUnchanged(file: string, before: Buffer): Promise<void> {
  const current = await readFile(file);
  if (current.equals(before)) return;
  expect(current.toString("utf8"), `${file} changed`).toBe(before.toString("utf8"));
  expect.fail(`${file} changed in bytes that do not show as text`);
}

async function startService(directory: string, wrapper: string): Promise<{ child: ChildProcess; url: string; output: () => string }> {
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, MONET_ROOT: directory, MONET_PORT: "0", MONET_AI_COMMAND: wrapper, MONET_CODEX_EXECUTABLE: "", MONET_AI_IMAGES: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("File service startup timed out")), 10000);
    let stderr = "";
    child.stderr!.on("data", (data) => { stderr += String(data); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("exit", () => { clearTimeout(timeout); reject(new Error(`File service exited before startup: ${stderr}`)); });
    child.stdout!.on("data", (data) => {
      output += String(data);
      const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) { clearTimeout(timeout); resolve(match[1]!); }
    });
  });
  return { child, url, output: () => output };
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
}

it("drives a proposal from diagnosis through approval and Apply over HTTP, and recovers an interrupted Apply at startup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-proposal-http-"));
  await cp(BUNDLED_WORKSPACE, directory, { recursive: true, filter: (source) => !/\/(gaps|proposals|applications)(\/|$)/.test(source) });
  const script = path.join(directory, "provider.mjs");
  const wrapper = path.join(directory, "provider.sh");
  await writeFile(script, PROVIDER_SCRIPT);
  await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  await chmod(wrapper, 0o755);
  let service = await startService(directory, wrapper);
  try {
    const { url } = service;
    const json = { "content-type": "application/json" };
    const decisionsBefore = await readFile(path.join(directory, "components", "decisions.json"));
    const exportBefore = await readFile(path.join(directory, "DESIGN_SYSTEM.md"));

    const gap = await (await fetch(`${url}/api/gaps`, { method: "POST", headers: json, body: JSON.stringify({ problem: "Card actions read as text" }) })).json() as { id: string };
    expect((await (await fetch(`${url}/api/gap-proposals/${gap.id}`)).json() as { eligibility: { eligible: boolean } }).eligibility.eligible).toBe(false);
    expect((await fetch(`${url}/api/proposals`, { method: "POST", headers: json, body: JSON.stringify({ gap_id: gap.id }) })).status).toBe(409);
    const diagnosed = await (await fetch(`${url}/api/gap-diagnoses/${gap.id}`, { method: "POST" })).json() as { diagnosis: { ai: { status: string } } };
    expect(diagnosed.diagnosis.ai.status).toBe("complete");
    expect((await (await fetch(`${url}/api/gap-proposals/${gap.id}`)).json() as { eligibility: { eligible: boolean } }).eligibility.eligible).toBe(true);

    expect((await fetch(`${url}/api/proposals`, { method: "POST", headers: { ...json, origin: "https://example.com" }, body: JSON.stringify({ gap_id: gap.id }) })).status).toBe(403);
    const created = await fetch(`${url}/api/proposals`, { method: "POST", headers: json, body: JSON.stringify({ gap_id: gap.id }) });
    expect(created.status).toBe(201);
    const proposal = await created.json() as { id: string; ai_available: boolean; revisions: unknown[] };
    expect(proposal.ai_available).toBe(true);

    const drafted = await (await fetch(`${url}/api/proposal-drafts/${proposal.id}`, { method: "POST" })).json() as { draft_failed?: string; revisions: { number: number; author: string; hash: string; changes: { author: string; field: string; after: string }[] }[] };
    expect(drafted.draft_failed).toBeUndefined();
    expect(drafted.revisions[0]).toMatchObject({ number: 1, author: "ai", changes: [{ author: "ai", field: "notes" }] });

    const edited = await (await fetch(`${url}/api/proposal-revisions/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ summary: "Cover card actions", rationale: "Edited by a person.", changes: [
      { target: "component:button", field: "notes", after: `${drafted.revisions[0]!.changes[0]!.after} Secondary means visibly a button, not a text link.` },
    ] }) })).json() as { revisions: { number: number; hash: string; checks: { ok: boolean }; changes: { author: string }[] }[] };
    expect(edited.revisions[1]).toMatchObject({ number: 2, checks: { ok: true }, changes: [{ author: "human" }] });

    // Nothing can be applied before approval, and the plan says so.
    const unapproved = await (await fetch(`${url}/api/proposal-applications/${proposal.id}`)).json() as ApplyPlan;
    expect(unapproved).toMatchObject({ ready: false, blockers: [{ kind: "state" }] });
    const early = await fetch(`${url}/api/proposal-applications/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 2, hash: edited.revisions[1]!.hash }) });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ kind: "state", receipt: null });

    expect((await fetch(`${url}/api/proposal-approvals/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 1, hash: drafted.revisions[0]!.hash }) })).status).toBe(409);
    const approved = await fetch(`${url}/api/proposal-approvals/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 2, hash: edited.revisions[1]!.hash, note: "Reviewed." }) });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ status: "approved", approval: { revision: 2 } });
    expect(await (await fetch(`${url}/api/proposals?gap=${gap.id}`)).json()).toEqual([expect.objectContaining({ id: proposal.id, status: "approved", approved_revision: 2, application_id: null })]);
    expect((await fetch(`${url}/api/proposals/does-not-exist`)).status).toBe(404);
    expect((await fetch(`${url}/api/proposal-revisions/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ summary: "", changes: [] }) })).status).toBe(400);

    await expectBytesUnchanged(path.join(directory, "components", "decisions.json"), decisionsBefore);
    await expectBytesUnchanged(path.join(directory, "DESIGN_SYSTEM.md"), exportBefore);
    expect((await (await fetch(`${url}/api/workspace`)).text())).not.toContain("Secondary means visibly a button");

    // Apply: the plan, a refused wrong hash, the write, the receipt, and idempotency.
    const plan = await (await fetch(`${url}/api/proposal-applications/${proposal.id}`)).json() as ApplyPlan;
    expect(plan).toMatchObject({ ready: true, blockers: [], unsupported: [], revision: 2, records: [{ key: "component:button", operation: "amend", fields: ["notes"], route: "/components/button" }], files: [{ path: "components/decisions.json", action: "update" }, { action: "create" }], checks: { ok: true } });
    const wrongHash = await fetch(`${url}/api/proposal-applications/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 2, hash: "a".repeat(64) }) });
    expect(wrongHash.status).toBe(409);
    expect(await wrongHash.json()).toMatchObject({ kind: "state", error: expect.stringContaining("approved revision 2") });
    await expectBytesUnchanged(path.join(directory, "components", "decisions.json"), decisionsBefore);

    const applied = await fetch(`${url}/api/proposal-applications/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 2, hash: edited.revisions[1]!.hash }) });
    expect(applied.status).toBe(200);
    const result = await applied.json() as ApplyResult;
    expect(result.outcome).toBe("applied");
    expect(result.receipt).toMatchObject({ outcome: "applied", proposal_id: proposal.id, revision: 2, hash: edited.revisions[1]!.hash, restored: true, validation: { ok: true } });
    expect(result.proposal).toMatchObject({ status: "applied", application: { id: result.receipt!.id } });
    expect(await readFile(path.join(directory, "components", "decisions.json"), "utf8")).toContain("Secondary means visibly a button");

    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).toContain("Secondary means visibly a button");
    expect((await (await fetch(`${url}/api/workspace`)).text())).toContain("Secondary means visibly a button");
    expect(await (await fetch(`${url}/api/applications`)).json()).toEqual([expect.objectContaining({ id: result.receipt!.id, outcome: "applied" })]);
    expect(await (await fetch(`${url}/api/applications/${result.receipt!.id}`)).json()).toEqual(result.receipt);
    expect(await (await fetch(`${url}/api/proposals?gap=${gap.id}`)).json()).toEqual([expect.objectContaining({ id: proposal.id, status: "applied", application_id: result.receipt!.id })]);
    const again = await (await fetch(`${url}/api/proposal-applications/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 2, hash: edited.revisions[1]!.hash }) })).json() as ApplyResult;
    expect(again).toMatchObject({ outcome: "already_applied", receipt: { id: result.receipt!.id } });
    expect((await fetch(`${url}/api/proposal-revisions/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ summary: "x", changes: [{ target: "component:button", field: "notes", after: "y" }] }) })).status).toBe(409);
    expect((await readdir(path.join(directory, "applications"))).filter((name) => name.endsWith(".journal.json"))).toEqual([]);
    const decisionEntries = (await readdir(path.join(directory, "decisions"))).filter((name) => name.includes("-proposal-"));
    expect(decisionEntries.length).toBe(1);
    // Private Gap evidence stays out of the canonical records and exports the Apply just rewrote.
    for (const file of ["components/decisions.json", "DESIGN_SYSTEM.md", "design-system.json", `decisions/${decisionEntries[0]!}`]) expect(await readFile(path.join(directory, file), "utf8")).not.toContain("Card actions read as text");

    // Interrupt: stop the service, leave a journal and a half-written record behind, and start again.
    await stop(service.child);
    const principleFile = path.join(directory, "principles", "keep-primary-actions-obvious.md");
    const original = await readFile(principleFile);
    const applicationId = "22222222-3333-4444-8555-666666666666";
    await writeFile(path.join(directory, "applications", `${applicationId}.journal.json`), JSON.stringify({ version: 1, application_id: applicationId, proposal_id: "interrupted-recovery", gap_id: gap.id, revision: 2, hash: edited.revisions[1]!.hash, started_at: "2026-09-09T12:00:00.000Z",
      records: [], files: [{ path: "principles/keep-primary-actions-obvious.md", action: "update", before: original.toString("base64"), before_hash: createHash("sha256").update(original).digest("hex") }], derived: [], baseline_errors: [], knowledge_fingerprint_before: "f" }));
    await writeFile(principleFile, "---\ntitle: \"Half written\"\norder: 0\nupdated_at: \"\"\n---\n\nGARBAGE FROM A CRASH\n");
    service = await startService(directory, wrapper);
    expect(service.output()).toContain(`Recovered application ${applicationId} for proposal interrupted-recovery: rolled back, every record restored`);
    await expectBytesUnchanged(principleFile, original);
    expect((await readdir(path.join(directory, "applications"))).filter((name) => name.endsWith(".journal.json"))).toEqual([]);
    const recovered = await (await fetch(`${service.url}/api/applications/${applicationId}`)).json() as ApplicationReceipt;
    expect(recovered).toMatchObject({ outcome: "rolled_back", recovered: true, restored: true });
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"), "utf8")).not.toContain("GARBAGE");
    // The applied proposal is untouched by the unrelated recovery, and its record still carries the change.
    expect(await (await fetch(`${service.url}/api/proposals/${proposal.id}`)).json()).toMatchObject({ status: "applied" });
    expect(await readFile(path.join(directory, "components", "decisions.json"), "utf8")).toContain("Secondary means visibly a button");

    // An unresolved journal makes live HTTP reads and all ordinary saves explicitly unavailable.
    const committedDecisions = await readFile(path.join(directory, "components", "decisions.json"));
    await writeFile(path.join(directory, "applications", `${applicationId}.journal.json`), "{}");
    const unavailable = await fetch(`${service.url}/api/workspace`);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ kind: "state", error: expect.stringContaining("recovery") });
    expect((await fetch(`${service.url}/api/components/button`, { method: "PUT", headers: json, body: JSON.stringify({ notes: "Blocked save" }) })).status).toBe(503);
    expect((await fetch(`${service.url}/api/proposal-rejections/${proposal.id}`, { method: "POST", headers: json, body: "{}" })).status).toBe(503);
    await expectBytesUnchanged(path.join(directory, "components", "decisions.json"), committedDecisions);
  } finally {
    await stop(service.child);
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);

it("refuses to listen when startup recovery cannot regenerate exports", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-startup-recovery-"));
  let child: ChildProcess | undefined;
  try {
    await cp(BUNDLED_WORKSPACE, directory, { recursive: true, filter: (file) => !/\/(gaps|proposals|applications)(\/|$)/.test(file) });
    await mkdir(path.join(directory, "applications"), { recursive: true });
    const relative = "principles/keep-primary-actions-obvious.md";
    const original = await readFile(path.join(directory, relative));
    const applicationId = "33333333-4444-4555-8666-777777777777";
    const journal = path.join(directory, "applications", `${applicationId}.journal.json`);
    await writeFile(journal, JSON.stringify({ version: 1, application_id: applicationId, proposal_id: "interrupted", gap_id: "gap", revision: 1, hash: "a".repeat(64), started_at: "2026-09-09T12:00:00.000Z", records: [], files: [{ path: relative, action: "update", before: original.toString("base64"), before_hash: createHash("sha256").update(original).digest("hex") }], derived: [], baseline_errors: [], knowledge_fingerprint_before: "before" }));
    await writeFile(path.join(directory, relative), "Uncommitted bytes.\n");
    await rm(path.join(directory, "DESIGN_SYSTEM.md"));
    await mkdir(path.join(directory, "DESIGN_SYSTEM.md")); // Real filesystem failure, no mocked server.
    child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: process.cwd(), env: { ...process.env, MONET_ROOT: directory, MONET_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let error = "";
    child.stdout!.on("data", (chunk) => { output += String(chunk); });
    child.stderr!.on("data", (chunk) => { error += String(chunk); });
    const [code] = await once(child, "exit");
    expect(code).not.toBe(0);
    expect(output).not.toContain("Monet file service:");
    expect(error).toContain("Recovery of");
    expect(error).toContain("could not be verified");
    expect(await readFile(journal, "utf8")).toContain(applicationId);
    expect(JSON.parse(await readFile(path.join(directory, "applications", `${applicationId}.json`), "utf8"))).toMatchObject({ outcome: "rolled_back", restored: false, recovered: true });
    await expectBytesUnchanged(path.join(directory, relative), original);
  } finally { if (child && child.exitCode === null) child.kill(); await rm(directory, { recursive: true, force: true }); }
});
