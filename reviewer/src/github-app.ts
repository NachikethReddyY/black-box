import { createPrivateKey, createSign } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { ReviewConfig } from './types.js';

export interface GitHubAppCredentials {
  readonly appId: string;
  readonly installationId: string;
  readonly privateKeyFile?: string;
  readonly privateKeyPem?: string;
}

export interface GitHubAppTokenResponse {
  readonly token: string;
  readonly expiresAt?: string;
}

/** Return complete App credentials, or undefined when publication is not configured. */
export function githubAppCredentials(config: Pick<ReviewConfig, 'githubAppId' | 'githubAppInstallationId' | 'githubAppPrivateKeyFile'> & Partial<Pick<ReviewConfig, 'githubAppPrivateKey'>>): GitHubAppCredentials | undefined {
  const values = [config.githubAppId, config.githubAppInstallationId, config.githubAppPrivateKeyFile ?? config.githubAppPrivateKey];
  if (values.every((value) => value === undefined)) return undefined;
  if (values.some((value) => !value)) throw new Error('GitHub App publication requires GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and a private key source');
  return { appId: config.githubAppId as string, installationId: config.githubAppInstallationId as string, ...(config.githubAppPrivateKeyFile ? { privateKeyFile: config.githubAppPrivateKeyFile } : { privateKeyPem: config.githubAppPrivateKey as string }) };
}

export function createGitHubAppJwt(credentials: GitHubAppCredentials, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!/^\d+$/.test(credentials.appId)) throw new Error('GITHUB_APP_ID must be a numeric GitHub App ID');
  if (!credentials.installationId || !/^\d+$/.test(credentials.installationId)) throw new Error('GITHUB_APP_INSTALLATION_ID must be numeric');
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: credentials.appId }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(createPrivateKey(privateKeyPem)).toString('base64url')}`;
}

export async function createGitHubInstallationToken(
  credentials: GitHubAppCredentials,
  fetcher: typeof fetch = fetch,
  nowSeconds?: number,
  apiBaseUrl = 'https://api.github.com',
): Promise<GitHubAppTokenResponse> {
  const privateKey = credentials.privateKeyPem ?? readProtectedPrivateKey(credentials.privateKeyFile as string);
  const jwt = createGitHubAppJwt(credentials, privateKey, nowSeconds);
  const response = await fetcher(`${apiBaseUrl.replace(/\/$/, '')}/app/installations/${encodeURIComponent(credentials.installationId)}/access_tokens`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
      'user-agent': 'Black-Box-Reviewer',
      'x-github-api-version': '2022-11-28',
    },
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(`GitHub App installation token request returned HTTP ${response.status}`);
  if (typeof value !== 'object' || value === null || Array.isArray(value) || typeof (value as { token?: unknown }).token !== 'string') throw new Error('GitHub App installation token response did not contain a token');
  const row = value as { token: string; expires_at?: unknown };
  return { token: row.token, expiresAt: typeof row.expires_at === 'string' ? row.expires_at : undefined };
}

function readProtectedPrivateKey(path: string): string {
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`GitHub App private key must not be group/world accessible: ${path}`);
  return readFileSync(path, 'utf8');
}

export async function createConfiguredGitHubInstallationToken(config: ReviewConfig, fetcher: typeof fetch = fetch): Promise<GitHubAppTokenResponse> {
  const credentials = githubAppCredentials(config);
  if (!credentials) throw new Error('pr-review requires GitHub App credentials; set GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY_FILE or GITHUB_APP_PRIVATE_KEY. Personal GITHUB_TOKEN is not accepted for publication.');
  return createGitHubInstallationToken(credentials, fetcher);
}

function base64Url(value: string): string { return Buffer.from(value, 'utf8').toString('base64url'); }
