import { configFromEnv } from './config';
import { D1RequestStore } from './db';
import { createGitHubApi, exactSha, object } from './github';
import { retryRequest, tick } from './orchestrator';
import { verifyGitHubSignature } from './signature';
import type { DispatchRequest, WorkerEnv } from './types';
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const login = (value: unknown) => typeof value === 'string' ? value.toLowerCase() : '';
async function bodyText(request: Request) {
  const reader = request.body?.getReader(); if (!reader) return '';
  const decoder = new TextDecoder(); let result = '', size = 0;
  while (true) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if (size > 1_048_576) { await reader.cancel(); throw new Error('payload_too_large'); } result += decoder.decode(value,{stream:true}); }
  return result + decoder.decode();
}
export async function handleWebhook(request: Request, env: WorkerEnv, store = new D1RequestStore(env.DB)): Promise<Response> {
  if (request.method !== 'POST') return json({error:'method_not_allowed'},405);
  let raw: string;
  try { raw = await bodyText(request); } catch { return json({error:'payload_too_large'},413); }
  if (!(await verifyGitHubSignature(raw,request.headers.get('x-hub-signature-256'),env.WEBHOOK_SECRET))) return json({error:'invalid_signature'},401);
  const eventId = request.headers.get('x-github-delivery');
  if (!eventId || !/^[\w-]{1,100}$/.test(eventId)) return json({error:'invalid_delivery_id'},400);
  let body: Record<string,unknown> | null;
  try { body = object(JSON.parse(raw)); } catch { return json({error:'invalid_json'},400); }
  if (!body) return json({error:'invalid_payload'},400);
  const config = configFromEnv(env), event = request.headers.get('x-github-event');
  // Completion is a hint; Cron verifies the stored run ID via GitHub's API.
  if (event === 'workflow_run') {
    if (!config.trustedRepositories.has(login(object(body.repository)?.full_name))) return json({error:'repository_not_allowed'},403);
    return json({status:'reconciliation_scheduled'},202);
  }
  if (event !== 'pull_request' && event !== 'push') return json({status:'ignored'},202);
  const actor = login(object(body.sender)?.login);
  if (!config.trustedActors.has(actor)) return json({error:'actor_not_allowed'},403);
  const common = { requestId: crypto.randomUUID(), eventId, actor, workflowFile: config.workflowFile, workflowRef: config.workflowRef, runner: 'waiting' as const };
  let queued: DispatchRequest;
  if (event === 'pull_request') {
    if (!['opened','reopened','synchronize','ready_for_review','edited'].includes(String(body.action))) return json({status:'ignored'},202);
    const pull = object(body.pull_request), head = object(pull?.head), base = object(pull?.base);
    const repository = login(object(base?.repo)?.full_name);
    if (!config.trustedRepositories.has(repository) || login(object(head?.repo)?.full_name) !== repository) return json({error:'fork_or_repository_not_allowed'},403);
    const headSha = exactSha(head?.sha), baseSha = exactSha(base?.sha), number = pull?.number;
    if (!headSha || !baseSha || typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) return json({error:'invalid_revision'},400);
    queued = { ...common, repository, sourceEvent:'pull_request', sourceRef:`refs/pull/${number}/merge`, prNumber:String(number), headSha, baseSha, commitSha:headSha, mergeReady:false };
  } else {
    const repository = login(object(body.repository)?.full_name);
    if (!config.trustedRepositories.has(repository)) return json({error:'repository_not_allowed'},403);
    if (body.ref !== `refs/heads/${config.workflowRef}` || body.deleted === true) return json({status:'ignored'},202);
    const sha = exactSha(body.after); if (!sha || /^0+$/.test(sha)) return json({error:'invalid_revision'},400);
    queued = { ...common, repository, sourceEvent:'push', sourceRef:String(body.ref), prNumber:'', headSha:sha, baseSha:sha, commitSha:sha, mergeReady:true };
  }
  // No outbound GitHub calls before this durable acknowledgement.
  try {
    const state = await store.insertPending(queued,Date.now());
    const saved = state === 'duplicate' ? await store.findByEvent(eventId) : queued;
    return json({status:state,request_id:saved?.requestId},202);
  } catch { return json({error:'storage_unavailable_redeliver_event'},503); }
}
export async function scheduled(cron: string, time: number, env: WorkerEnv) {
  const config = configFromEnv(env), store = new D1RequestStore(env.DB), github = createGitHubApi(env,config);
  if (cron === '23 4 * * 1') {
    for (const repository of config.trustedRepositories) {
      const eventId = `weekly:${repository}:${new Date(time).toISOString().slice(0,10)}`;
      if (await store.findByEvent(eventId)) continue;
      const sha = await github.getBranchSha(repository,config.workflowRef);
      await store.insertPending({requestId:crypto.randomUUID(),eventId,repository,actor:'scheduler',sourceEvent:'schedule',sourceRef:`refs/heads/${config.workflowRef}`,prNumber:'',headSha:sha,baseSha:sha,commitSha:sha,mergeReady:true,runner:'waiting',workflowFile:config.workflowFile,workflowRef:config.workflowRef},Date.now());
    }
    await store.retain(Date.now());
  }
  await tick({store,github,config,now:Date.now});
}
const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    if (path === '/webhook') return handleWebhook(request,env);
    if (!env.OPERATOR_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.OPERATOR_TOKEN}`) return json({error:'not_found'},404);
    const match = /^\/requests\/([0-9a-f-]{36})(\/retry)?$/.exec(path);
    if (!match) return json({error:'not_found'},404);
    const store = new D1RequestStore(env.DB);
    if (request.method === 'GET' && !match[2]) { const row = await store.find(match[1]); return json(row ? {request:row} : {error:'not_found'},row ? 200 : 404); }
    if (request.method === 'POST' && match[2]) {
      let confirmedNoRun = false;
      try { const body = object(await request.json()); confirmedNoRun = body?.confirmed_no_run === true; } catch { /* empty body is not confirmation */ }
      try { const config = configFromEnv(env); return json({request_id:await retryRequest(match[1],{store,github:createGitHubApi(env,config),config,now:Date.now},confirmedNoRun)},202); }
      catch { return json({error:'retry_refused_inspect_original_run'},409); }
    }
    return json({error:'method_not_allowed'},405);
  },
  async scheduled(event,env) { await scheduled(event.cron,event.scheduledTime,env); },
};
export default worker;
