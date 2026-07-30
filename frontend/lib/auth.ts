/** Env tabanlı tek-kullanıcı oturumu — httpOnly cookie + HMAC. */

export const SESSION_COOKIE = "petshop_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 gün

const textEncoder = new TextEncoder();

function getSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.AUTH_PASSWORD?.trim() ||
    ""
  );
}

export function getExpectedCredentials(): {
  username: string;
  password: string;
} {
  return {
    username: process.env.AUTH_USERNAME?.trim() ?? "",
    password: process.env.AUTH_PASSWORD?.trim() ?? "",
  };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i]! ^ bBytes[i]!;
  }
  return diff === 0;
}

export function verifyCredentials(
  username: string,
  password: string
): boolean {
  const expected = getExpectedCredentials();
  if (!expected.username || !expected.password) return false;
  return (
    timingSafeEqualStr(username, expected.username) &&
    timingSafeEqualStr(password, expected.password)
  );
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return toBase64Url(sig);
}

export async function createSessionToken(username: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET veya AUTH_PASSWORD tanımlı değil");
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const payload = `${username}:${exp}`;
  const payloadB64 = toBase64Url(textEncoder.encode(payload));
  const signature = await sign(payload, secret);
  return `${payloadB64}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const secret = getSecret();
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return false;

  let payload: string;
  try {
    payload = new TextDecoder().decode(fromBase64Url(payloadB64));
  } catch {
    return false;
  }

  const expectedSig = await sign(payload, secret);
  if (!timingSafeEqualStr(signature, expectedSig)) return false;

  const colon = payload.lastIndexOf(":");
  if (colon < 0) return false;
  const exp = Number(payload.slice(colon + 1));
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  return true;
}
