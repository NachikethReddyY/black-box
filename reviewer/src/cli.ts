import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { configFromEnv, parseDotEnv } from './config.js';
import { buildContext } from './context.js';
import { captureSnapshot } from './snapshot.js';
import { FakeProvider, OPENAI_ROUTE, ResponsesProvider, TOKENROUTER_ROUTE } from './provider.js';
import { runReview } from './pipeline.js';
import { ReviewStore } from './store.js';
import { writeReports } from './report.js';
import { changedRightLines, GitHubApi, type PullRequestRef } from './github.js';
import { buildReviewPreview } from './publisher.js';
import { listenStatusServer } from './status-server.js';
import type { SnapshotMode } from './types.js';

loadDotEnv();
const cliArgs = process.argv.slice(2).filter((argument) => argument !== '--');
const command = cliArgs[0] ?? 'help';

if (command === 'doctor') doctor();
else if (command === 'review') await review();
else if (command === 'pr-preview') await prPreview();
else if (command === 'pr-review') await prReview();
else if (command === 'status') status();
else if (command === 'backup') backup();
else if (command === 'restore') restore();
else if (command === 'export') exportReview();
else if (command === 'serve') await serve();
else if (command === 'help') printHelp();
else { console.error(`unknown command: ${command}`); process.exitCode = 2; }

function loadDotEnv(): void {
  const candidates = process.env.REVIEWER_ENV_FILE ? [process.env.REVIEWER_ENV_FILE] : [`${process.cwd()}/.env`, `${process.cwd()}/../.env`];
  const path = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!path) return;
  const parsed = parseDotEnv(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) if (process.env[key] === undefined) process.env[key] = value;
}

function doctor(): void {
  const config = configFromEnv();
  console.log(JSON.stringify({ root: config.root, dataDir: config.dataDir, profile: config.profile, maxAttempts: config.maxAttempts, cloudBudgetUsd: config.cloudBudgetUsd, cloudKeyConfigured: Boolean(config.openAiApiKey || config.tokenRouterApiKey), publication: 'PR COMMENT only via pr-review' }, null, 2));
}

function status(): void {
  const config = configFromEnv();
  const store = new ReviewStore(config);
  console.log(JSON.stringify({ dataDir: config.dataDir, database: store.dbPath, integrity: store.integrityCheck(), reviews: store.listReviews() }, null, 2));
  store.close();
}

function backup(): void {
  const config = configFromEnv();
  const destination = cliArgs[1] ?? `${config.dataDir}/backup-${new Date().toISOString().replaceAll(':', '-')}`;
  mkdirSync(destination, { recursive: true });
  const store = new ReviewStore(config);
  store.checkpoint();
  const database = `${destination}/reviewer.sqlite`;
  copyFileSync(store.dbPath, database);
  const manifest = { createdAt: new Date().toISOString(), integrity: store.integrityCheck(), databaseBytes: statSync(database).size };
  writeFileSync(`${destination}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  store.close();
  console.log(JSON.stringify({ destination, ...manifest }, null, 2));
}

function restore(): void {
  const config = configFromEnv();
  const source = cliArgs[1];
  if (!source || !existsSync(source)) throw new Error('usage: reviewer restore PATH_TO_BACKUP_DATABASE');
  mkdirSync(config.dataDir, { recursive: true });
  copyFileSync(source, `${config.dataDir}/reviewer.sqlite`);
  const store = new ReviewStore(config);
  const integrity = store.integrityCheck();
  store.close();
  if (integrity !== 'ok') throw new Error(`restored database failed integrity check: ${integrity}`);
  console.log(JSON.stringify({ restored: `${config.dataDir}/reviewer.sqlite`, integrity }, null, 2));
}

function exportReview(): void {
  const config = configFromEnv();
  const reviewId = cliArgs[1];
  if (!reviewId) throw new Error('usage: reviewer export REVIEW_ID');
  const store = new ReviewStore(config);
  const result = store.getReview(reviewId);
  store.close();
  if (!result) throw new Error('review was not found');
  const reports = writeReports(result, `${config.dataDir}/${reviewId}-export`);
  console.log(JSON.stringify({ reviewId, reports }, null, 2));
}

async function serve(): Promise<void> {
  const config = configFromEnv();
  const token = process.env.REVIEWER_STATUS_TOKEN?.trim();
  if (!token) throw new Error('REVIEWER_STATUS_TOKEN is required for the local status service');
  const port = Number(process.env.REVIEWER_STATUS_PORT ?? 8787);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('REVIEWER_STATUS_PORT must be between 1 and 65535');
  const handle = await listenStatusServer(config, token, port);
  console.log(JSON.stringify({ host: '127.0.0.1', port: handle.port, endpoints: ['/healthz', '/status'], stop: 'SIGINT or SIGTERM' }, null, 2));
  await new Promise<void>((resolve, reject) => {
    const stop = (): void => { void handle.close().then(resolve, reject); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

async function review(): Promise<void> {
  const mode = parseMode(cliArgs[1] ?? 'working_tree');
  const config = configFromEnv();
  const snapshot = captureSnapshot(config, mode, cliArgs[2]);
  const { packet } = buildContext(snapshot, config.maxPacketBytes);
  const store = new ReviewStore(config);
  const provider = providerFor(config);
  const result = await runReview(config, snapshot, packet, store, { provider, authorizeCloud: config.profile !== 'static_only' });
  const reportDir = `${config.dataDir}/${result.reviewId}`;
  const reports = writeReports(result, reportDir);
  store.close();
  console.log(JSON.stringify({ reviewId: result.reviewId, outcome: result.outcome, snapshotId: snapshot.id, changedPaths: snapshot.changedPaths, selectedPaths: result.coverage.selectedPaths, omittedPaths: result.coverage.omittedPaths, attempts: result.attempts, estimatedCostUsd: result.estimatedCostUsd, reports }, null, 2));
  if (result.outcome === 'incomplete' || result.outcome === 'unauthorized') process.exitCode = 3;
}

async function prPreview(): Promise<void> {
  const [owner, repo, numberText] = cliArgs.slice(1);
  const number = Number(numberText);
  if (!owner || !repo || !Number.isSafeInteger(number) || number < 1) throw new Error('usage: reviewer pr-preview OWNER REPO NUMBER');
  const config = configFromEnv();
  const api = new GitHubApi(githubToken(config.githubToken));
  const ref: PullRequestRef = { owner, repo, number };
  const snapshot = await api.capturePullRequestSnapshot(ref);
  const { packet } = buildContext(snapshot, config.maxPacketBytes);
  const store = new ReviewStore(config);
  const provider = providerFor(config);
  const result = await runReview(config, snapshot, packet, store, { provider, authorizeCloud: config.profile !== 'static_only' });
  const reports = writeReports(result, `${config.dataDir}/${result.reviewId}`);
  const preview = api.previewReview(ref, buildReviewPreview(result));
  store.close();
  console.log(JSON.stringify({ repository: `${owner}/${repo}`, pullRequest: number, reviewId: result.reviewId, outcome: result.outcome, snapshotId: snapshot.id, files: snapshot.files.length, changedPaths: snapshot.changedPaths, report: reports, publication: { mode: 'preview', review: preview } }, null, 2));
}

async function prReview(): Promise<void> {
  const [owner, repo, numberText] = cliArgs.slice(1);
  const number = Number(numberText);
  if (!owner || !repo || !Number.isSafeInteger(number) || number < 1) throw new Error('usage: reviewer pr-review OWNER REPO NUMBER');
  const config = configFromEnv();
  if (config.profile === 'static_only') throw new Error('pr-review requires LUNA_API_KEY; set REVIEWER_LOCAL_ONLY=true only for local static review');
  const authToken = githubToken(config.githubToken);
  if (!authToken) throw new Error('pr-review requires GITHUB_TOKEN or an authenticated gh CLI session for PR comments');
  const api = new GitHubApi(authToken);
  const ref: PullRequestRef = { owner, repo, number };
  const snapshot = await api.capturePullRequestSnapshot(ref);
  const { packet } = buildContext(snapshot, config.maxPacketBytes);
  const store = new ReviewStore(config);
  const result = await runReview(config, snapshot, packet, store, { provider: providerFor(config), authorizeCloud: true });
  const reports = writeReports(result, `${config.dataDir}/${result.reviewId}`);
  const files = await api.listPullRequestFiles(ref);
  const payload = buildReviewPreview(result, changedRightLines(files));
  let publication: { readonly reviewId: number; readonly url?: string } | undefined;
  if (result.outcome === 'completed_clean' || result.outcome === 'completed_findings') publication = await api.publishReview(ref, payload);
  store.markPublication(result.reviewId, publication ? 'published' : 'not_published');
  store.close();
  console.log(JSON.stringify({ repository: `${owner}/${repo}`, pullRequest: number, reviewId: result.reviewId, outcome: result.outcome, snapshotId: snapshot.id, files: snapshot.files.length, changedPaths: snapshot.changedPaths, report: reports, publication: publication ? { mode: 'pr_review', ...publication, comments: payload.comments.length } : { mode: 'not_published', comments: payload.comments.length } }, null, 2));
}

function providerFor(config: ReturnType<typeof configFromEnv>) {
  if (config.profile === 'static_only') return undefined;
  if (process.env.REVIEWER_FAKE_PROVIDER === 'true') return new FakeProvider();
  const route = config.profile === 'economy_cloud_tokenrouter_luna_v1' ? TOKENROUTER_ROUTE : OPENAI_ROUTE;
  const key = route.provider === 'tokenrouter' ? config.tokenRouterApiKey : config.openAiApiKey;
  if (!key) return undefined;
  return new ResponsesProvider(route, key);
}

function parseMode(value: string): SnapshotMode {
  if (value === 'working_tree' || value === 'staged' || value === 'ref') return value;
  throw new Error(`invalid snapshot mode: ${value}`);
}

function printHelp(): void {
  console.log('reviewer doctor\nreviewer review [working_tree|staged|ref] [ref]\nreviewer pr-preview OWNER REPO NUMBER\nreviewer pr-review OWNER REPO NUMBER\nreviewer status\nreviewer serve\nreviewer backup [DIRECTORY]\nreviewer restore DATABASE\nreviewer export REVIEW_ID\n\nA LUNA_API_KEY selects the bounded Luna route automatically. Each PR review is capped at $0.10. Set REVIEWER_LOCAL_ONLY=true for static-only mode.');
}

function githubToken(configured: string | undefined): string | undefined {
  if (configured) return configured;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined; } catch { return undefined; }
}
