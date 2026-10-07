// Small helpers for route handlers. Uses only web-standard Request/Response.
import { ConfigError } from "./env";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", ...NO_STORE });
  if (extraHeaders) new Headers(extraHeaders).forEach((v, k) => headers.append(k, v));
  return new Response(JSON.stringify(data), { status, headers });
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** Wraps a handler: turns HttpError into JSON, hides internal errors. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
      if (err instanceof ConfigError) {
        console.error("[config]", err.message);
        return json({ error: "The server is not fully configured yet. Please contact The Club Boils." }, 503);
      }
      console.error("[api] unexpected error", err instanceof Error ? err.message : "unknown");
      return json({ error: "Something went wrong. Please try again or WhatsApp 868-293-0570." }, 500);
    }
  };
}

/**
 * Reject cross-site writes (CSRF). Browsers always send Origin on POST/PATCH;
 * it must match this site.
 */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) throw new HttpError(403, "Request blocked.");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { throw new HttpError(403, "Request blocked."); }
  if (!host || originHost !== host) throw new HttpError(403, "Request blocked.");
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64_000): Promise<T> {
  assertSameOrigin(req);
  const type = req.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new HttpError(415, "Expected JSON.");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large.");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as T;
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

export function sessionCookie(name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
export const clearCookie = (name: string) => sessionCookie(name, "", 0);

/** Client IP as seen by Vercel (first entry of x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
