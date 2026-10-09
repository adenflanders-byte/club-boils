import { db, rateLimitAllowed, rateLimitRecord } from "./db";
import { serverEnv } from "./env";
import { signSessionToken, verifySessionToken, verifyAccessCode, hashIp } from "./crypto";
import { HttpError, getCookie, clientIp, sessionCookie } from "./http";
import { EVENT_SLUG_RE, type SchoolEventRow } from "../events";
export { EVENT_SLUG_RE, type SchoolEventRow };

export const eventCookieName = (slug: string) => `cb_evt_${slug}`;

const ACCESS_MAX_FAILURES_PER_IP = 8;
const ACCESS_MAX_FAILURES_PER_EVENT = 200;
const ACCESS_WINDOW_SECONDS = 15 * 60;

export async function loadEvent(slug: string): Promise<SchoolEventRow | null> {
  if (!EVENT_SLUG_RE.test(slug) || slug.length > 80) return null;
  const { data } = await db().from("school_events").select("*").eq("slug", slug).maybeSingle();
  return (data as SchoolEventRow | null) ?? null;
}

/** Events visible to students: open or closed (drafts and archived events 404). */
export async function loadVisibleEvent(slug: string): Promise<SchoolEventRow> {
  const ev = await loadEvent(slug);
  if (!ev || ev.status === "draft" || ev.status === "archived") throw new HttpError(404, "This ordering page is not available.");
  return ev;
}

export function isOrderingOpen(ev: Pick<SchoolEventRow, "status" | "order_cutoff_at">, now = new Date()): boolean {
  return ev.status === "open" && now.getTime() < new Date(ev.order_cutoff_at).getTime();
}

/** Information shown before the access code is entered. */
export function publicEventInfo(ev: SchoolEventRow) {
  return {
    slug: ev.slug,
    schoolName: ev.school_name,
    shortName: ev.short_name || ev.school_name,
    eventDate: ev.event_date,
    orderCutoffAt: ev.order_cutoff_at,
    collectionStartAt: ev.collection_start_at,
    collectionEndAt: ev.collection_end_at,
    orderingOpen: isOrderingOpen(ev),
  };
}

/** Full details for a student who has entered the code. */
export function eventDetails(ev: SchoolEventRow) {
  return {
    ...publicEventInfo(ev),
    collectionLocation: ev.collection_location,
    collectionInstructions: ev.collection_instructions,
    paymentMethods: ev.allowed_payment_methods,
    eventFee: Number(ev.event_fee),
    studentIdRequired: ev.student_id_required,
    policyVersion: ev.policy_version,
    policyText: ev.policy_text,
  };
}

/** Check an access code. On success returns a Set-Cookie header value. */
export async function grantEventAccess(req: Request, ev: SchoolEventRow, code: unknown): Promise<string> {
  const env = serverEnv();
  const ipHash = hashIp(clientIp(req), env.sessionSecret);
  const ipBucket = `event-access:${ev.id}:${ipHash}`;
  const eventBucket = `event-access:${ev.id}:all`;
  const [ipOk, eventOk] = await Promise.all([
    rateLimitAllowed(ipBucket, ACCESS_MAX_FAILURES_PER_IP, ACCESS_WINDOW_SECONDS),
    rateLimitAllowed(eventBucket, ACCESS_MAX_FAILURES_PER_EVENT, ACCESS_WINDOW_SECONDS),
  ]);
  if (!ipOk || !eventOk) throw new HttpError(429, "Too many incorrect attempts. Please wait 15 minutes and try again.");

  const ok = typeof code === "string" && ev.access_code_hash !== null && await verifyAccessCode(code, ev.access_code_hash);
  await db().from("event_access_attempts").insert({ event_id: ev.id, success: ok, ip_hash: ipHash });
  if (!ok) {
    await Promise.all([rateLimitRecord(ipBucket), rateLimitRecord(eventBucket)]);
    throw new HttpError(401, "That access code is not correct.");
  }

  const ttlMs = ev.session_ttl_minutes * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const { data, error } = await db().from("event_sessions").insert({
    event_id: ev.id, code_version: ev.access_code_version, expires_at: expiresAt.toISOString(), ip_hash: ipHash,
  }).select("id").single();
  if (error || !data) throw new HttpError(500, "Could not open the ordering page. Please try again.");
  const token = signSessionToken("event", data.id, expiresAt, env.sessionSecret);
  return sessionCookie(eventCookieName(ev.slug), token, ttlMs / 1000);
}

/** True if the request carries a valid, unrevoked session for this event. */
export async function hasEventSession(req: Request, ev: SchoolEventRow): Promise<boolean> {
  const env = serverEnv();
  const parsed = verifySessionToken(getCookie(req, eventCookieName(ev.slug)), "event", env.sessionSecret);
  if (!parsed) return false;
  const { data } = await db().from("event_sessions")
    .select("event_id, code_version, expires_at, revoked_at").eq("id", parsed.sessionId).maybeSingle();
  return !!data
    && data.event_id === ev.id
    && !data.revoked_at
    && data.code_version === ev.access_code_version
    && ev.access_code_hash !== null
    && new Date(data.expires_at).getTime() > Date.now();
}

export async function requireEventSession(req: Request, ev: SchoolEventRow) {
  if (!(await hasEventSession(req, ev))) throw new HttpError(401, "Please enter the access code again.", "EVENT_ACCESS_REQUIRED");
}
