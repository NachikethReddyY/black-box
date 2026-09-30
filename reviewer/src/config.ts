import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { ReviewConfig, ReviewProfile } from './types.js';

const profiles = new Set<ReviewProfile>(['static_only', 'economy_cloud_luna_v1', 'economy_cloud_tokenrouter_luna_v1']);

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
  const profile = (env.REVIEWER_PROFILE ?? (env.REVIEWER_LOCAL_ONLY === 'true' ? 'static_only' : env.LUNA_API_KEY?.trim() ? 'economy_cloud_luna_v1' : 'static_only')) as ReviewProfile;
  if (!profiles.has(profile)) throw new Error(`unsupported REVIEWER_PROFILE: ${profile}`);
  const root = resolve(env.REVIEWER_ROOT ?? discoverRepositoryRoot(cwd));
  const dataDir = resolve(env.REVIEWER_DATA_DIR ?? `${root}/reviewer/data`);
  const maxAttempts = integer(env.REVIEWER_MAX_ATTEMPTS, 4);
  if (maxAttempts < 1 || maxAttempts > 4) throw new Error('REVIEWER_MAX_ATTEMPTS must be between 1 and 4');
  const cloudBudgetUsd = number(env.REVIEWER_CLOUD_BUDGET_USD, profile === 'static_only' ? 0 : 0.10);
  if (cloudBudgetUsd < 0) throw new Error('REVIEWER_CLOUD_BUDGET_USD cannot be negative');
  if (profile !== 'static_only' && cloudBudgetUsd <= 0 && !env.REVIEWER_ALLOW_UNBUDGETED_TEST) throw new Error('cloud review requires a positive budget');
  if (cloudBudgetUsd > 0.10 && !env.REVIEWER_ALLOW_LARGER_BUDGET) throw new Error('review budget is capped at $0.10 per PR');
  return {
    root, dataDir, profile, maxAttempts,
    maxInputTokens: integer(env.REVIEWER_MAX_INPUT_TOKENS, 32_768),
    maxOutputTokens: integer(env.REVIEWER_MAX_OUTPUT_TOKENS, 4_096),
    maxPacketBytes: integer(env.REVIEWER_MAX_PACKET_BYTES, 128 * 1024),
    maxInlineFindings: integer(env.REVIEWER_MAX_INLINE_FINDINGS, 5),
    cloudBudgetUsd,
    openAiApiKey: env.LUNA_API_KEY?.trim() || undefined,
    tokenRouterApiKey: env.TOKENROUTER_API_KEY?.trim() || undefined,
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
  };
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
