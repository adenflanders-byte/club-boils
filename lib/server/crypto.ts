import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// ── Signed session tokens ────────────────────────────────────────────────
// Format: base64url(payload).base64url(HMAC-SHA256(payload)). The payload is
// "<kind>|<session id>|<expiry unix seconds>". The database is still checked
// on every API call, so a session can be revoked before it expires.
export type TokenKind = "admin" | "event";

export function signSessionToken(kind: TokenKind, sessionId: string, expiresAt: Date, secret: string): string {
  const payload = `${kind}|${sessionId}|${Math.floor(expiresAt.getTime() / 1000)}`;
  const body = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null, kind: TokenKind, secret: string, now = Date.now()):
  { sessionId: string; expiresAt: Date } | null {
  if (!token || token.length > 512) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  let given: Buffer;
  try { given = Buffer.from(sig, "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const parts = Buffer.from(body, "base64url").toString().split("|");
  if (parts.length !== 3 || parts[0] !== kind) return null;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  if (!/^[0-9a-f-]{36}$/i.test(parts[1])) return null;
  return { sessionId: parts[1], expiresAt: new Date(exp * 1000) };
}

// ── Event access codes (scrypt, salted) ──────────────────────────────────
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEYLEN = 32;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) =>
      err ? reject(err) : resolve(key)));
}

export const ACCESS_CODE_RULES = { min: 6, max: 64 };

export function accessCodeProblem(code: unknown): string | null {
  if (typeof code !== "string") return "Enter an access code.";
  const c = code.trim();
  if (c.length < ACCESS_CODE_RULES.min) return `Access codes must be at least ${ACCESS_CODE_RULES.min} characters.`;
  if (c.length > ACCESS_CODE_RULES.max) return `Access codes must be at most ${ACCESS_CODE_RULES.max} characters.`;
  return null;
}

/** Codes are compared case-insensitively and without surrounding spaces. */
const canonicalCode = (code: string) => code.trim().toUpperCase();

export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(canonicalCode(code), salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyAccessCode(code: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || typeof code !== "string" || code.length > ACCESS_CODE_RULES.max * 4) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  if (Number(n) !== SCRYPT_N || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scrypt(canonicalCode(code), Buffer.from(saltB64, "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ── Misc ─────────────────────────────────────────────────────────────────
/** One-way hash of an IP address for rate limiting and logs (never stored raw). */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`ip:${ip}`).digest("base64url").slice(0, 22);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
