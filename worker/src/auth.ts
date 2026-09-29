import type { WorkerEnv } from "./types";

const textEncoder = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function bytes(value: string): ArrayBuffer {
  const normalized = value.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(normalized);
  const raw = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return copy.buffer;
}

export async function createAppJwt(env: Pick<WorkerEnv, "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY">, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = base64url(textEncoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(textEncoder.encode(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: env.GITHUB_APP_ID })));
  const key = await crypto.subtle.importKey("pkcs8", bytes(env.GITHUB_APP_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, textEncoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

export async function createInstallationToken(env: Pick<WorkerEnv, "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY" | "GITHUB_APP_INSTALLATION_ID">, apiBaseUrl: string, fetcher: typeof fetch = fetch): Promise<string> {
  const jwt = await createAppJwt(env);
  const response = await fetcher(`${apiBaseUrl.replace(/\/$/, "")}/app/installations/${encodeURIComponent(env.GITHUB_APP_INSTALLATION_ID)}/access_tokens`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub installation token failed with status ${response.status}`);
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("token" in payload) || typeof payload.token !== "string") throw new Error("GitHub installation token response was invalid");
  return payload.token;
}
