import { selectRunner } from './config';
import { D1RequestStore } from './db';
import { workflowDispatchInput } from './github';
import { requiredJobs } from './types';
import type { DispatcherConfig, GitHubApi, RequestRecord, WorkflowRun } from './types';
export interface OrchestratorDependencies { readonly store: D1RequestStore; readonly github: GitHubApi; readonly config: DispatcherConfig; readonly now: () => number }
async function ensureChecks(r: RequestRecord, d: OrchestratorDependencies): Promise<RequestRecord> {
  const checks = { ...r.checks };
  for (const name of requiredJobs(r)) {
    if (checks[name]) continue;
    checks[name] = await d.github.ensureCheck(r, name);
    await d.store.saveCheck(r.requestId, checks);
  }
  return { ...r, checks };
}
async function stop(r: RequestRecord, d: OrchestratorDependencies, state: 'superseded' | 'completed', reason: string) {
  // A stale head must not create a newer duplicate check on that old head.
  for (const name of Object.keys(r.checks)) await d.github.updateCheck(r, name, 'action_required', reason);
  await d.store.finish(r.requestId, state, reason, d.now());
}
async function processPending(r: RequestRecord, d: OrchestratorDependencies): Promise<string | null> {
  if (r.prNumber) {
    const fresh = await d.github.getPullRequest(r.repository, Number(r.prNumber));
    if (!fresh.open || fresh.headSha !== r.headSha) { await stop(r,d,'superseded','PR closed or head changed; this revision was not approved.'); return 'superseded'; }
    r = await ensureChecks(r,d);
    if (fresh.mergeable === false || fresh.mergeCommitSha === null || fresh.mergeable === null) return 'waiting_for_merge_revision';
    await d.store.setMergeRevision(r.requestId,fresh.mergeCommitSha,fresh.baseSha);
    r = { ...r, commitSha: fresh.mergeCommitSha, baseSha: fresh.baseSha, mergeReady: true };
  } else if (r.sourceEvent === 'push') {
    // Turning the PC on must not run an obsolete backlog of main commits.
    const current = await d.github.getBranchSha(r.repository, r.sourceRef.replace(/^refs\/heads\//, ''));
    if (current !== r.headSha) { await stop(r,d,'superseded','Branch advanced; this queued revision was superseded.'); return 'superseded'; }
    r = await ensureChecks(r,d);
  } else {
    // Manual and diagnostic requests already carry an immutable commit. Do not
    // replace it merely because the branch advanced while the PC was offline.
    r = await ensureChecks(r,d);
  }
  if (d.now() > r.expiresAt || r.attemptCount >= d.config.maxAttempts) { await stop(r,d,'completed','Request expired or retry limit reached.'); return 'expired'; }
  const runner = selectRunner(d.config, await d.github.listAvailableRunners(r.repository));
  if (runner === 'waiting') return 'waiting_for_home';
  if (!(await d.store.claimPending(r.requestId,runner,d.now()))) return null;
  const claimed = { ...r, runner, state: 'claimed' as const };
  // Persist intent BEFORE POST. Any crash after this point is ambiguous.
  try {
    const runId = await d.github.dispatchWorkflow(workflowDispatchInput(d.config,claimed),r.repository,r.workflowFile);
    if (runId === undefined) { await d.store.markAmbiguous(r.requestId,d.now()); return 'dispatch_response_ambiguous'; }
    await d.store.markDispatched(r.requestId,runId,1,d.now());
    return null;
  } catch {
    await d.store.markAmbiguous(r.requestId,d.now());
    return 'dispatch_response_ambiguous';
  }
}
export async function completeRun(r: RequestRecord, run: WorkflowRun, d: OrchestratorDependencies) {
  if (r.prNumber) {
    const fresh = await d.github.getPullRequest(r.repository,Number(r.prNumber));
    if (!fresh.open || fresh.headSha !== r.headSha || fresh.baseSha !== r.baseSha || fresh.mergeCommitSha !== r.commitSha) { await stop(r,d,'superseded','PR revision or merge base changed; stale results cannot approve it.'); return; }
  }
  r = await ensureChecks(r,d);
  let passed = run.conclusion === 'success';
  for (const name of requiredJobs(r)) {
    const job = run.jobs[name];
    const success = job?.conclusion === 'success' && job.checkoutVerified;
    passed &&= success;
    await d.github.updateCheck(r,name,success ? 'success' : 'failure',`Tested ${r.commitSha}. Original head ${r.headSha}. Run ${run.id}, attempt ${run.attempt}. ${name}: ${job?.conclusion ?? 'missing'}.`,run.htmlUrl);
  }
  await d.store.finish(r.requestId,'completed',passed ? 'success' : 'failure',d.now());
}
async function reconcile(r: RequestRecord, d: OrchestratorDependencies): Promise<string | null> {
  const run = await d.github.findWorkflowRun(r);
  if (!run) return 'unresolved_dispatch_requires_operator';
  await d.store.markDispatched(r.requestId,run.id,run.attempt,d.now());
  if (run.status === 'completed') { await completeRun(r,run,d); return null; }
  if (d.now()-r.createdAt > 86_400_000) {
    for (const name of Object.keys(r.checks)) await d.github.updateCheck(r,name,'action_required','Run stalled. Inspect and cancel the original GitHub run before retrying.',run.htmlUrl);
    return 'stalled_run_requires_operator';
  }
  return null;
}
export async function tick(d: OrchestratorDependencies) {
  // One request per minute bounds API fan-out and Free-plan CPU. Leases also
  // serialize the weekly Cron and the regular reconciliation Cron.
  for (const candidate of await d.store.listDue(d.now(),1)) {
    if (!(await d.store.takeLease(candidate.requestId,d.now()))) continue;
    let error: string | null = null;
    try {
      const r = await d.store.find(candidate.requestId); if (!r) continue;
      if (r.state === 'pending') error = await processPending(r,d);
      else if (['claimed','ambiguous','dispatched'].includes(r.state)) {
        if (r.state === 'claimed') await d.store.markAmbiguous(r.requestId,d.now());
        error = await reconcile(r,d);
      }
    } catch { error = 'reconciliation_failed_retry_next_minute'; }
    finally { await d.store.release(candidate.requestId,d.now(),error); }
  }
}
export async function retryRequest(id: string, d: OrchestratorDependencies, confirmedNoRun = false): Promise<string> {
  if (!(await d.store.takeLease(id,d.now()))) throw new Error('request_busy_or_missing');
  try {
    const r = await d.store.find(id); if (!r) throw new Error('request_missing');
    if (r.attemptCount >= d.config.maxAttempts) throw new Error('retry_limit');
    // No blind SQL reset: unknown or active runs cannot be retried here.
    const run = await d.github.findWorkflowRun(r);
    if (!run && !(confirmedNoRun && r.state === 'ambiguous' && d.now()-r.updatedAt >= 600_000)) throw new Error('unresolved_or_active_run');
    if (run && run.status !== 'completed') throw new Error('unresolved_or_active_run');
    if (run?.conclusion === 'success') throw new Error('successful_run_does_not_need_retry');
    if (r.prNumber) { const pr = await d.github.getPullRequest(r.repository,Number(r.prNumber)); if (!pr.open || pr.headSha !== r.headSha || pr.baseSha !== r.baseSha) throw new Error('stale_revision'); }
    const nextId = crypto.randomUUID();
    const eventId = `retry:${id}:${run?.attempt ?? 0}`;
    const existing = await d.store.findByEvent(eventId); if (existing) return existing.requestId;
    await d.store.insertPending({ ...r, requestId: nextId, eventId, runner: 'waiting', mergeReady: !r.prNumber },d.now(),r.attemptCount);
    await stop(r,d,'superseded',`Operator requested retry ${nextId}; original run is completed.`);
    return nextId;
  } finally { await d.store.release(id,d.now()); }
}
