import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY } from "../supabaseConfig";
import { db, audit, rateLimitAllowed, rateLimitRecord } from "./db";
import { serverEnv } from "./env";
import { signSessionToken, verifySessionToken, hashIp } from "./crypto";
import { HttpError, getCookie, clientIp, sessionCookie, clearCookie } from "./http";

export const ADMIN_COOKIE = "cb_admin";
export const ADMIN_SESSION_HOURS = 12;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export interface AdminSession { sessionId: string; userId: string; email: string; }

/**
 * Sign in with a Supabase Auth email + password. Only users listed in the
 * admin_users table are accepted. Failed attempts are rate-limited per IP
 * and per email address.
 */
export async function adminLogin(req: Request, emailRaw: unknown, passwordRaw: unknown): Promise<{ cookie: string; email: string }> {
  const env = serverEnv();
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof passwordRaw === "string" ? passwordRaw.slice(0, 200) : "";
  if (!email || !password) throw new HttpError(400, "Enter your email and password.");

  const ipHash = hashIp(clientIp(req), env.sessionSecret);
  const ipBucket = `admin-login:ip:${ipHash}`;
  const emailBucket = `admin-login:email:${email}`;
  const [ipOk, emailOk] = await Promise.all([
    rateLimitAllowed(ipBucket, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS),
    rateLimitAllowed(emailBucket, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS),
  ]);
  if (!ipOk || !emailOk) throw new HttpError(429, "Too many failed attempts. Please wait 15 minutes and try again.");

  const fail = async (reason: string) => {
    await Promise.all([rateLimitRecord(ipBucket), rateLimitRecord(emailBucket)]);
    await audit({ actor: email, action: "admin.login_failed", entityType: "admin", meta: { reason, ip: ipHash } });
    return new HttpError(401, "Incorrect email or password.");
  };

  // Verify the password with Supabase Auth (a throwaway client; no session is kept).
  const authClient = createClient(env.supabaseUrl, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw await fail("bad_credentials");

  const { data: adminRow } = await db().from("admin_users").select("user_id, email").eq("user_id", data.user.id).maybeSingle();
  if (!adminRow) throw await fail("not_an_admin");

  const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000);
  const { data: session, error: sErr } = await db().from("admin_sessions").insert({
    user_id: data.user.id, email, expires_at: expiresAt.toISOString(), ip_hash: ipHash,
    user_agent: (req.headers.get("user-agent") || "").slice(0, 200),
  }).select("id").single();
  if (sErr || !session) throw new HttpError(500, "Could not start a session.");

  await authClient.auth.signOut().catch(() => undefined);
  await audit({ actor: email, action: "admin.login", entityType: "admin", entityId: data.user.id, meta: { session: session.id } });
  const token = signSessionToken("admin", session.id, expiresAt, env.sessionSecret);
  return { cookie: sessionCookie(ADMIN_COOKIE, token, ADMIN_SESSION_HOURS * 3600), email };
}

/** Returns the signed-in admin, or null. Checks signature, expiry, revocation and admin list. */
export async function getAdmin(req: Request): Promise<AdminSession | null> {
  const env = serverEnv();
  const parsed = verifySessionToken(getCookie(req, ADMIN_COOKIE), "admin", env.sessionSecret);
  if (!parsed) return null;
  const { data } = await db().from("admin_sessions")
    .select("id, user_id, email, expires_at, revoked_at").eq("id", parsed.sessionId).maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  const { data: stillAdmin } = await db().from("admin_users").select("user_id").eq("user_id", data.user_id).maybeSingle();
  if (!stillAdmin) return null;
  return { sessionId: data.id, userId: data.user_id, email: data.email };
}

export async function requireAdmin(req: Request): Promise<AdminSession> {
  const admin = await getAdmin(req);
  if (!admin) throw new HttpError(401, "Please sign in again.", "UNAUTHENTICATED");
  return admin;
}

export async function adminLogout(req: Request): Promise<string> {
  const admin = await getAdmin(req).catch(() => null);
  if (admin) {
    await db().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", admin.sessionId);
    await audit({ actor: admin.email, action: "admin.logout", entityType: "admin", entityId: admin.userId });
  }
  return clearCookie(ADMIN_COOKIE);
}
