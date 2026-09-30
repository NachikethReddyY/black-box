import type { DispatchRequest, DispatcherConfig, ManualRequestInput } from './types';

const SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF = /^[A-Za-z0-9_.\/-]{1,255}$/;
const KEY = /^[A-Za-z0-9_.:-]{1,100}$/;

function text(value: unknown, field: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || value.length > 255 || value.includes('\n') || value.includes('\r') || (pattern && !pattern.test(value))) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function manualRequest(input: unknown, config: DispatcherConfig, actor: string, requestId: string, now: number): DispatchRequest {
  const body = record(input);
  if (!body) throw new Error('invalid_request');
  const repository = text(body.repository, 'repository', REPOSITORY).toLowerCase();
  if (!config.trustedRepositories.has(repository)) throw new Error('repository_not_allowed');
  const workflowFile = body.workflow_file === undefined ? config.workflowFile : text(body.workflow_file, 'workflow_file', /^[A-Za-z0-9_.-]+\.ya?ml$/i);
  if (workflowFile !== config.workflowFile) throw new Error('workflow_not_allowed');
  const workflowRef = body.workflow_ref === undefined ? config.workflowRef : text(body.workflow_ref, 'workflow_ref', REF);
  if (workflowRef !== config.workflowRef) throw new Error('workflow_ref_not_allowed');
  const sourceRef = text(body.source_ref, 'source_ref', REF);
  const commitSha = text(body.commit_sha, 'commit_sha', SHA).toLowerCase();
  const headSha = body.head_sha === undefined ? commitSha : text(body.head_sha, 'head_sha', SHA).toLowerCase();
  const baseSha = body.base_sha === undefined ? headSha : text(body.base_sha, 'base_sha', SHA).toLowerCase();
  const prNumber = body.pr_number === undefined || body.pr_number === '' ? '' : text(body.pr_number, 'pr_number', /^[0-9]{1,10}$/);
  const key = body.idempotency_key === undefined ? crypto.randomUUID() : text(body.idempotency_key, 'idempotency_key', KEY);
  return {
    requestId,
    eventId: `manual:${repository}:${key}`,
    repository,
    actor,
    sourceEvent: 'manual',
    workflowFile,
    workflowRef,
    sourceRef,
    prNumber,
    commitSha,
    headSha,
    baseSha,
    mergeReady: true,
    runner: 'waiting',
  };
}
