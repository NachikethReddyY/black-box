const signaturePattern = /^sha256=([0-9a-f]{64})$/i;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function verifyGitHubSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (signature === null || secret.length === 0) return false;
  const match = signaturePattern.exec(signature.trim());
  if (match === null) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return equalBytes(expected, new Uint8Array(match[1].match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? []));
}

export async function githubSignatureForTests(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${hex(new Uint8Array(digest))}`;
}
