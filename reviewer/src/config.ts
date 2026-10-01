import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { RepositoryRef, ReviewConfig, ReviewProfile } from './types.js';

export function parseDotEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) values[key] = value;
  }
  return values;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): ReviewConfig {
  const tokenRouterApiKey = env.TOKENROUTER_API_KEY?.trim() || env.LUNA_API_KEY?.trim() || undefined;
  const profile = parseProfile(env.REVIEWER_LOCAL_ONLY === 'true' ? 'static_only' : env.REVIEWER_PROFILE ?? (tokenRouterApiKey ? 'economy_cloud_tokenrouter_luna_v1' : 'static_only'));
  const root = resolve(env.REVIEWER_ROOT ?? discoverRepositoryRoot(cwd));
  const dataDir = resolve(env.REVIEWER_DATA_DIR ?? `${root}/reviewer/data`);
  const maxAttempts = integer(env.REVIEWER_MAX_ATTEMPTS, 4);
  if (maxAttempts < 1 || maxAttempts > 4) throw new Error('REVIEWER_MAX_ATTEMPTS must be between 1 and 4');
  const cloudBudgetUsd = number(env.REVIEWER_CLOUD_BUDGET_USD, profile === 'static_only' ? 0 : 0.10);
  if (cloudBudgetUsd < 0) throw new Error('REVIEWER_CLOUD_BUDGET_USD cannot be negative');
  if (profile !== 'static_only' && cloudBudgetUsd <= 0 && !env.REVIEWER_ALLOW_UNBUDGETED_TEST) throw new Error('cloud review requires a positive budget');
  if (cloudBudgetUsd > 0.10 && !env.REVIEWER_ALLOW_LARGER_BUDGET) throw new Error('review budget is capped at $0.10 per PR');
  if (profile !== 'static_only' && maxAttempts < 3) throw new Error('cloud review requires at least three attempts for two specialists and a verifier');
  const githubAppId = env.GITHUB_APP_ID?.trim() || undefined;
  const githubAppInstallationId = env.GITHUB_APP_INSTALLATION_ID?.trim() || undefined;
  const githubAppPrivateKeyFile = env.GITHUB_APP_PRIVATE_KEY_FILE?.trim() || undefined;
  const githubAppPrivateKey = env.GITHUB_APP_PRIVATE_KEY?.trim() || undefined;
  const appCredentialCount = [githubAppId, githubAppInstallationId, githubAppPrivateKeyFile ?? githubAppPrivateKey].filter(Boolean).length;
  if (appCredentialCount !== 0 && appCredentialCount !== 3) throw new Error('GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and one private-key source must be configured together');
  const githubRepositories = parseRepositories(env.REVIEWER_GITHUB_REPOSITORIES);
  const pollIntervalMs = integer(env.REVIEWER_POLL_INTERVAL_SECONDS, 60) * 1000;
  if (pollIntervalMs < 15_000) throw new Error('REVIEWER_POLL_INTERVAL_SECONDS must be at least 15');
  const maxAutomaticReviewsPerPoll = integer(env.REVIEWER_MAX_AUTOMATIC_REVIEWS_PER_POLL, 1);
  if (maxAutomaticReviewsPerPoll < 1 || maxAutomaticReviewsPerPoll > 10) throw new Error('REVIEWER_MAX_AUTOMATIC_REVIEWS_PER_POLL must be between 1 and 10');
  const requiredCiChecks = parseChecks(env.REVIEWER_REQUIRED_CI_CHECKS, ['reviewer']);
  const automaticPullRequestNumber = env.REVIEWER_PR_NUMBER === undefined ? undefined : integer(env.REVIEWER_PR_NUMBER, 0);
  if (automaticPullRequestNumber !== undefined && automaticPullRequestNumber < 1) throw new Error('REVIEWER_PR_NUMBER must be a positive integer');
  return {
    root, dataDir, profile, maxAttempts,
    // The reviewer sends a bounded whole-change packet so large PRs do not
    // silently become partial reviews. Four reserved attempts remain below
    // the application's $0.10 per-PR cloud cap at the configured route.
    maxInputTokens: integer(env.REVIEWER_MAX_INPUT_TOKENS, 131_072),
    maxOutputTokens: integer(env.REVIEWER_MAX_OUTPUT_TOKENS, 4_096),
    maxPacketBytes: integer(env.REVIEWER_MAX_PACKET_BYTES, 600 * 1024),
    maxInlineFindings: integer(env.REVIEWER_MAX_INLINE_FINDINGS, 5),
    cloudBudgetUsd,
    openAiApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    tokenRouterApiKey,
    tokenRouterBaseUrl: env.TOKENROUTER_BASE_URL ? parseBaseUrl(env.TOKENROUTER_BASE_URL.trim()) : undefined,
    tokenRouterModelId: env.TOKENROUTER_MODEL_ID?.trim() || undefined,
    githubAppId,
    githubAppInstallationId,
    githubAppPrivateKeyFile,
    githubAppPrivateKey,
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
    githubRepositories,
    pollIntervalMs,
    includeDrafts: env.REVIEWER_INCLUDE_DRAFTS === 'true',
    maxAutomaticReviewsPerPoll, requiredCiChecks, automaticPullRequestNumber,
    updatePullRequestDescription: env.REVIEWER_UPDATE_PR_DESCRIPTION === 'true',
    autoMerge: env.REVIEWER_AUTO_MERGE === 'true',
  };
}

function parseChecks(value: string | undefined, fallback: readonly string[]): readonly string[] {
  const checks = (value === undefined ? fallback : value.split(',')).map((check) => check.trim()).filter(Boolean);
  if (checks.length === 0 || checks.some((check) => check.length > 100)) throw new Error('REVIEWER_REQUIRED_CI_CHECKS must contain at least one short check name');
  return [...new Set(checks)];
}

function parseRepositories(value: string | undefined): readonly RepositoryRef[] {
  if (!value?.trim()) return [];
  return value.split(',').map((entry) => {
    const [owner, repo, ...extra] = entry.trim().split('/');
    if (!owner || !repo || extra.length > 0 || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error(`invalid REVIEWER_GITHUB_REPOSITORIES entry: ${entry}`);
    return { owner, repo };
  });
}

function parseProfile(value: string): ReviewProfile {
  if (value === 'static_only' || value === 'economy_cloud_luna_v1' || value === 'economy_cloud_tokenrouter_luna_v1') return value;
  throw new Error(`unsupported REVIEWER_PROFILE: ${value}`);
}

function parseBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('TOKENROUTER_BASE_URL must be an HTTPS URL without credentials, query, or fragment');
  return url.toString().replace(/\/$/, '');
}

function discoverRepositoryRoot(cwd: string): string {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    }).trim() || cwd;
  } catch {
    return cwd;
  }
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid integer configuration: ${value}`);
  return parsed;
}

function number(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid number configuration: ${value}`);
  return parsed;
}
