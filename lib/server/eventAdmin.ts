import { CATALOG } from "../menu";
import { ttInstant, ttDateString, formatDateOnly, formatTTTime } from "../time";
import { cleanText } from "../validation";
import { sha256 } from "./crypto";
import { HttpError } from "./http";
import { EVENT_SLUG_RE, type SchoolEventRow } from "../events";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PAYMENT_METHODS = ["cash_on_collection", "bank_transfer"];

/** Strip secrets before sending an event to the browser. */
export function adminEventView(ev: SchoolEventRow) {
  const { access_code_hash, ...rest } = ev;
  return { ...rest, has_access_code: access_code_hash !== null };
}

export function defaultPolicyText(schoolName: string, eventDate: string, start: Date, end: Date, cutoff: Date) {
  const cutoffDate = ttDateString(cutoff);
  const cutoffHour = (cutoff.getUTCHours() + 20) % 24; // Trinidad is UTC-4
  const when = cutoffDate === eventDate
    ? (cutoffHour < 12 ? "that morning" : "that day")
    : `on ${formatDateOnly(cutoffDate)}`;
  return `I understand that this order is for collection at ${schoolName} between ${formatTTTime(start)} and ${formatTTTime(end)} on ${formatDateOnly(eventDate)}, and that orders close at ${formatTTTime(cutoff)} ${when}.`;
}

export interface EventInput {
  school_name: string; short_name: string; slug: string; event_date: string;
  order_cutoff_at: string; collection_start_at: string; collection_end_at: string;
  collection_location: string; collection_instructions: string;
  event_fee: number; allowed_payment_methods: string[]; hidden_item_ids: string[];
  student_id_required: boolean; session_ttl_minutes: number; policy_text: string; policy_version: string;
}

/**
 * Validate the Admin event form. Times are entered as Trinidad wall-clock
 * times ("HH:MM") and stored as exact instants.
 */
export function parseEventInput(b: Record<string, unknown>): EventInput {
  const school_name = cleanText(b.schoolName, 120);
  if (school_name.length < 3) throw new HttpError(400, "Enter the school name.");
  const slug = cleanText(b.slug, 80).toLowerCase();
  if (!EVENT_SLUG_RE.test(slug)) throw new HttpError(400, "The link name may only use lowercase letters, numbers and dashes.");
  const event_date = String(b.eventDate ?? "");
  if (!DATE_RE.test(event_date)) throw new HttpError(400, "Enter the event date.");
  const cutoffDate = String(b.cutoffDate ?? event_date);
  for (const [label, v] of [["cutoff time", b.cutoffTime], ["collection start", b.collectionStart], ["collection end", b.collectionEnd]] as const) {
    if (typeof v !== "string" || !TIME_RE.test(v)) throw new HttpError(400, `Enter the ${label} (HH:MM).`);
  }
  if (!DATE_RE.test(cutoffDate)) throw new HttpError(400, "Enter the cutoff date.");
  const t = (date: string, hhmm: string) => ttInstant(date, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  const cutoff = t(cutoffDate, b.cutoffTime as string);
  const start = t(event_date, b.collectionStart as string);
  const end = t(event_date, b.collectionEnd as string);
  if (end <= start) throw new HttpError(400, "Collection must end after it starts.");
  if (cutoff > start) throw new HttpError(400, "Ordering must close before collection starts.");

  const event_fee = Math.round(Number(b.eventFee ?? 0) * 100) / 100;
  if (!Number.isFinite(event_fee) || event_fee < 0 || event_fee > 500) throw new HttpError(400, "Enter a valid event fee (TT$0 or more).");

  const methods = Array.isArray(b.paymentMethods) ? b.paymentMethods.filter(m => PAYMENT_METHODS.includes(String(m))).map(String) : [];
  if (methods.length === 0) throw new HttpError(400, "Choose at least one payment method.");

  const validIds = new Set(CATALOG.map(c => c.id));
  const hidden = Array.isArray(b.hiddenItemIds) ? [...new Set(b.hiddenItemIds.map(String).filter(id => validIds.has(id)))] : [];

  const ttl = Math.round(Number(b.sessionTtlMinutes ?? 240));
  if (!Number.isFinite(ttl) || ttl < 5 || ttl > 1440) throw new HttpError(400, "Session length must be between 5 and 1440 minutes.");

  const policy_text = cleanText(b.policyText, 600) || defaultPolicyText(school_name, event_date, start, end, cutoff);

  return {
    school_name, short_name: cleanText(b.shortName, 60) || school_name, slug, event_date,
    order_cutoff_at: cutoff.toISOString(), collection_start_at: start.toISOString(), collection_end_at: end.toISOString(),
    collection_location: cleanText(b.collectionLocation, 200) || school_name,
    collection_instructions: cleanText(b.collectionInstructions, 600),
    event_fee, allowed_payment_methods: methods, hidden_item_ids: hidden,
    student_id_required: b.studentIdRequired === true, session_ttl_minutes: ttl,
    policy_text, policy_version: `${slug.slice(0, 40)}-${sha256(policy_text).slice(0, 8)}`,
  };
}

export const SCHEDULE_FIELDS = ["event_date", "order_cutoff_at", "collection_start_at", "collection_end_at"] as const;

// ── Event dashboard totals ───────────────────────────────────────────────
export interface ReportOrder {
  id: string | number; status: string; total: number | string; subtotal: number | string | null;
  service_fee: number | string | null; amount_paid: number | string | null; payment_method: string | null; payment_status: string | null;
}
export interface ReportPayment { order_id: string | number; kind: "payment" | "refund"; method: string; amount: number | string }

const n = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Totals for one event, computed from the same order and payment records
 * that the weekly Accounts reports use (nothing is double-counted).
 */
export function eventTotals(orders: ReportOrder[], payments: ReportPayment[]) {
  const live = orders.filter(o => o.status !== "cancelled");
  const cancelled = orders.filter(o => o.status === "cancelled");
  const pending = ["new", "confirmed", "preparing", "ready"];
  const sumPay = (pred: (p: ReportPayment) => boolean) =>
    payments.filter(pred).reduce((s, p) => s + (p.kind === "refund" ? -n(p.amount) : n(p.amount)), 0);

  const onlinePaid = sumPay(p => p.method === "bank_transfer" || p.method === "online_provider");
  const cashReceived = sumPay(p => p.method === "cash");
  const otherReceived = sumPay(p => p.method === "other");
  const refunded = payments.filter(p => p.kind === "refund").reduce((s, p) => s + n(p.amount), 0);
  const collectedTotal = onlinePaid + cashReceived + otherReceived;
  const amountPaidOnOrders = orders.reduce((s, o) => s + n(o.amount_paid), 0);

  const totals = {
    totalOrders: live.length,
    cancelledOrders: cancelled.length,
    foodRevenue: live.reduce((s, o) => s + n(o.subtotal ?? o.total), 0),
    eventFees: live.reduce((s, o) => s + n(o.service_fee), 0),
    orderValue: live.reduce((s, o) => s + n(o.total), 0),
    expectedRevenue: live.filter(o => pending.includes(o.status)).reduce((s, o) => s + n(o.total), 0),
    earnedRevenue: live.filter(o => o.status === "completed").reduce((s, o) => s + n(o.total), 0),
    onlinePaid,
    cashExpected: live.filter(o => o.payment_method === "cash_on_collection").reduce((s, o) => s + n(o.total), 0),
    cashReceived,
    otherReceived,
    collectedTotal,
    unpaidBalance: live.reduce((s, o) => s + Math.max(0, n(o.total) - n(o.amount_paid)), 0),
    refunded,
    reconciles: Math.abs(collectedTotal - amountPaidOnOrders) < 0.005,
  };
  return totals;
}
