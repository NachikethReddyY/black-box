import type { WorkerEnv } from "./types";

const textEncoder = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function derLength(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length);
  const parts: number[] = [];
  for (let value = length; value > 0; value = Math.floor(value / 256)) parts.unshift(value & 0xff);
  return Uint8Array.of(0x80 | parts.length, ...parts);
}
function der(tag: number, value: Uint8Array): Uint8Array {
  return Uint8Array.of(tag, ...derLength(value.byteLength), ...value);
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algorithm = der(0x30, concat(
    der(0x06, Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01)),
    der(0x05, new Uint8Array()),
  ));
  return der(0x30, concat(der(0x02, Uint8Array.of(0)), algorithm, der(0x04, pkcs1)));
}
function bytes(value: string): ArrayBuffer {
  const isPkcs1 = value.includes("BEGIN RSA PRIVATE KEY");
  const normalized = value.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(normalized);
  const raw = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const encoded = isPkcs1 ? pkcs1ToPkcs8(raw) : raw;
  const copy = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(copy).set(encoded);
  return copy;
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
