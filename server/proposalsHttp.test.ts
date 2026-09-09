import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
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

it("drives a proposal from diagnosis to approval over HTTP without touching canonical files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "monet-proposal-http-"));
  await cp(BUNDLED_WORKSPACE, directory, { recursive: true, filter: (source) => !/\/(gaps|proposals)(\/|$)/.test(source) });
  const script = path.join(directory, "provider.mjs");
  const wrapper = path.join(directory, "provider.sh");
  await writeFile(script, PROVIDER_SCRIPT);
  await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  await chmod(wrapper, 0o755);
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, MONET_ROOT: directory, MONET_PORT: "0", MONET_AI_COMMAND: wrapper, MONET_CODEX_EXECUTABLE: "", MONET_AI_IMAGES: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("File service startup timed out")), 10000);
      let output = "";
      let stderr = "";
      child.stderr.on("data", (data) => { stderr += String(data); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", () => { clearTimeout(timeout); reject(new Error(`File service exited before startup: ${stderr}`)); });
      child.stdout.on("data", (data) => {
        output += String(data);
        const match = /Monet file service: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (match) { clearTimeout(timeout); resolve(match[1]!); }
      });
    });
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

    expect((await fetch(`${url}/api/proposal-approvals/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 1, hash: drafted.revisions[0]!.hash }) })).status).toBe(409);
    const approved = await fetch(`${url}/api/proposal-approvals/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ revision: 2, hash: edited.revisions[1]!.hash, note: "Reviewed." }) });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ status: "approved", approval: { revision: 2 } });
    expect(await (await fetch(`${url}/api/proposals?gap=${gap.id}`)).json()).toEqual([expect.objectContaining({ id: proposal.id, status: "approved", approved_revision: 2 })]);
    expect((await fetch(`${url}/api/proposals/does-not-exist`)).status).toBe(404);
    expect((await fetch(`${url}/api/proposal-revisions/${proposal.id}`, { method: "POST", headers: json, body: JSON.stringify({ summary: "", changes: [] }) })).status).toBe(400);

    expect(await readFile(path.join(directory, "components", "decisions.json"))).toEqual(decisionsBefore);
    expect(await readFile(path.join(directory, "DESIGN_SYSTEM.md"))).toEqual(exportBefore);
    expect((await (await fetch(`${url}/api/workspace`)).text())).not.toContain("Secondary means visibly a button");
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
