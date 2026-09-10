/**
 * One process-wide mutex for canonical workspace writes.
 *
 * Every save in `server/fileStore.ts` is a read-modify-write over files, and a Proposal apply is a
 * multi-file transaction with a journal. Node interleaves their awaits freely, so without a lock an
 * ordinary save could land between an apply's journal and its writes, and a rollback would then
 * restore bytes over it. Writers queue here in arrival order; readers never wait.
 */

let chain: Promise<unknown> = Promise.resolve();

export function withWorkspaceWrite<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
}
