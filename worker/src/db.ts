import type { DispatchRequest, RequestRecord, RequestState, WorkflowRunner } from './types';
interface Row {
 request_id: string; event_id: string; repository: string; actor: string; source_event: DispatchRequest['sourceEvent']; workflow_file: string; workflow_ref: string; source_ref: string; pr_number: string; commit_sha: string; head_sha: string; base_sha: string; merge_ready: number; runner: DispatchRequest['runner']; state: RequestState; attempt_count: number; workflow_run_id: number | null; workflow_run_attempt: number | null; checks_json: string; conclusion: string | null; last_error: string | null; next_attempt_at: number; created_at: number; updated_at: number; expires_at: number;
}
function record(row: Row): RequestRecord {
 const parsed: unknown = JSON.parse(row.checks_json);
 const checks: Record<string, number> = {};
 if (!parsed || typeof parsed !== 'object') throw new Error('invalid_stored_checks');
 for (const [name, id] of Object.entries(parsed)) { if (!Number.isSafeInteger(id) || typeof id !== 'number') throw new Error('invalid_stored_check_id'); checks[name] = id; }
 return { requestId: row.request_id, eventId: row.event_id, repository: row.repository, actor: row.actor, sourceEvent: row.source_event, workflowFile: row.workflow_file, workflowRef: row.workflow_ref, sourceRef: row.source_ref, prNumber: row.pr_number, commitSha: row.commit_sha, headSha: row.head_sha, baseSha: row.base_sha, mergeReady: row.merge_ready === 1, runner: row.runner, state: row.state, attemptCount: row.attempt_count, workflowRunId: row.workflow_run_id ?? undefined, workflowRunAttempt: row.workflow_run_attempt ?? undefined, checks, conclusion: row.conclusion ?? undefined, lastError: row.last_error ?? undefined, nextAttemptAt: row.next_attempt_at, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at };
}
export class D1RequestStore {
 constructor(private readonly db: D1Database) {}
 async insertPending(r: DispatchRequest, now: number, attemptCount = 0): Promise<'created' | 'duplicate'> {
   const result = await this.db.prepare("INSERT INTO requests (request_id,event_id,repository,actor,source_event,workflow_file,workflow_ref,source_ref,pr_number,commit_sha,head_sha,base_sha,merge_ready,runner,state,attempt_count,next_attempt_at,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING").bind(r.requestId,r.eventId,r.repository,r.actor,r.sourceEvent,r.workflowFile,r.workflowRef,r.sourceRef,r.prNumber,r.commitSha,r.headSha,r.baseSha,Number(r.mergeReady),r.runner,attemptCount,now,now,now,now + 7*86400_000).run();
   return result.meta.changes === 1 ? 'created' : 'duplicate';
 }
 async find(id: string) { const row = await this.db.prepare('SELECT * FROM requests WHERE request_id=?').bind(id).first<Row>(); return row ? record(row) : null; }
 async findByEvent(id: string) { const row = await this.db.prepare('SELECT * FROM requests WHERE event_id=?').bind(id).first<Row>(); return row ? record(row) : null; }
 async findByWorkflowRun(id: number) { const row = await this.db.prepare('SELECT * FROM requests WHERE workflow_run_id=?').bind(id).first<Row>(); return row ? record(row) : null; }
 async listDue(now: number, limit = 1) { const rows = await this.db.prepare("SELECT * FROM requests WHERE state IN ('pending','claimed','ambiguous','dispatched') AND next_attempt_at<=? AND lease_until<=? ORDER BY next_attempt_at,created_at LIMIT ?").bind(now,now,limit).all<Row>(); return rows.results.map(record); }
 async takeLease(id: string, now: number) { const result = await this.db.prepare("UPDATE requests SET lease_until=? WHERE request_id=? AND lease_until<=?").bind(now+120_000,id,now).run(); return result.meta.changes === 1; }
 async release(id: string, now: number, message: string | null = null) { await this.db.prepare('UPDATE requests SET lease_until=0,next_attempt_at=?,updated_at=?,last_error=? WHERE request_id=?').bind(now+60_000,now,message,id).run(); }
 async saveCheck(id: string, checks: Readonly<Record<string,number>>) { await this.db.prepare('UPDATE requests SET checks_json=? WHERE request_id=?').bind(JSON.stringify(checks),id).run(); }
 async setMergeRevision(id: string, commit: string, base: string) { await this.db.prepare("UPDATE requests SET commit_sha=?,base_sha=?,merge_ready=1 WHERE request_id=? AND state='pending'").bind(commit,base,id).run(); }
 async claimPending(id: string, runner: WorkflowRunner, now: number) { const result = await this.db.prepare("UPDATE requests SET state='claimed',runner=?,attempt_count=attempt_count+1,updated_at=? WHERE request_id=? AND state='pending'").bind(runner,now,id).run(); return result.meta.changes === 1; }
 async markDispatched(id: string, runId: number, attempt: number, now: number) { await this.db.prepare("UPDATE requests SET state='dispatched',workflow_run_id=?,workflow_run_attempt=?,updated_at=? WHERE request_id=? AND state IN ('claimed','ambiguous','dispatched')").bind(runId,attempt,now,id).run(); }
 async markAmbiguous(id: string, now: number) { await this.db.prepare("UPDATE requests SET state='ambiguous',updated_at=? WHERE request_id=? AND state='claimed'").bind(now,id).run(); }
 async finish(id: string, state: 'completed' | 'superseded', conclusion: string, now: number) { await this.db.prepare('UPDATE requests SET state=?,conclusion=?,updated_at=? WHERE request_id=?').bind(state,conclusion,now,id).run(); }
 async retain(now: number) { await this.db.prepare("DELETE FROM requests WHERE state IN ('completed','superseded') AND updated_at<?").bind(now-30*86400_000).run(); }
}
