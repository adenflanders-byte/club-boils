// Server-side checkout shared by the main site and school events.
// Every price is recalculated from lib/menu.ts; the browser only sends item
// ids, options and quantities. A snapshot of the priced lines is stored on
// the order so later menu changes never alter it.
import {
  priceCart, isItemActive, settingsFromRows, legacyDetails, legacyPackage, HEATS, MENU_VERSION, DELIVERY_FEE,
  type PricedLine, type SettingsMap, type CatalogItem,
} from "../menu";
import { initialPaymentStatus, type PaymentMethod } from "../payments";
import { normalizeTTPhone, isValidEmail, cleanText, LIMITS } from "../validation";
import { regularFulfilmentFor, formatDateOnly, type OrderDay } from "../time";
import { DELIVERY_AREAS, BLOCKED_DELIVERY_AREAS } from "../areas";
import { db } from "./db";
import { HttpError } from "./http";
import { isOrderingOpen, type SchoolEventRow } from "./events";

export async function loadSettings(): Promise<SettingsMap> {
  const { data, error } = await db().from("settings").select("key, value");
  if (error) throw new HttpError(503, "The menu could not be loaded. Please try again.");
  return settingsFromRows(data);
}

export interface OrderReceipt {
  orderNumber: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  balanceDue: number;
  scheduledDate: string | null;
  lines: { name: string; description: string; quantity: number; lineTotal: number }[];
  duplicate: boolean;
}

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,80}$/;

function receiptFrom(row: Record<string, unknown>, duplicate: boolean): OrderReceipt {
  const items = (row.items as PricedLine[] | null) ?? [];
  const total = Number(row.total);
  return {
    orderNumber: String(row.order_number),
    total,
    subtotal: Number(row.subtotal ?? total),
    deliveryFee: Number(row.delivery_fee ?? 0),
    serviceFee: Number(row.service_fee ?? 0),
    paymentMethod: row.payment_method as PaymentMethod,
    paymentStatus: String(row.payment_status),
    balanceDue: Math.max(0, total - Number(row.amount_paid ?? 0)),
    scheduledDate: (row.scheduled_fulfilment_date as string | null) ?? null,
    lines: items.map(l => ({ name: l.name, description: l.description, quantity: l.quantity, lineTotal: l.lineTotal })),
    duplicate,
  };
}

async function findByIdempotencyKey(key: string) {
  const { data } = await db().from("orders").select("*").eq("idempotency_key", key).maybeSingle();
  return data as Record<string, unknown> | null;
}

/** Price the cart and stop if the customer saw different prices. */
function priceOrThrow(lines: unknown, isAvailable: (i: CatalogItem) => boolean, expectedTotal: unknown, fees: number) {
  const priced = priceCart(lines, isAvailable);
  if (!priced.ok) throw new HttpError(409, priced.error, "CART_INVALID");
  const total = priced.subtotal + fees;
  if (typeof expectedTotal === "number" && expectedTotal !== total) {
    throw new HttpError(409, `Prices have changed since you added these items. Your new total is TT$${total}. Please review your cart.`, "PRICE_CHANGED");
  }
  return { lines: priced.lines, subtotal: priced.subtotal, total };
}

async function insertOrder(row: Record<string, unknown>, idempotencyKey: string): Promise<OrderReceipt> {
  const existing = await findByIdempotencyKey(idempotencyKey);
  if (existing) return receiptFrom(existing, true);

  const { data, error } = await db().from("orders").insert(row).select("*").single();
  if (error) {
    if (error.code === "23505") {
      const again = await findByIdempotencyKey(idempotencyKey);
      if (again) return receiptFrom(again, true);
    }
    const msg = error.message || "";
    if (msg.includes("SCHOOL_EVENT_CUTOFF_PASSED") || msg.includes("SCHOOL_EVENT_CLOSED")) {
      throw new HttpError(409, "Ordering for this event has closed.", "EVENT_CLOSED");
    }
    console.error("[orders] insert failed", error.code);
    throw new HttpError(500, "Your order could not be saved. Please try again or WhatsApp 868-293-0570.");
  }
  return receiptFrom(data as Record<string, unknown>, false);
}

function customerFields(body: Record<string, unknown>, emailRequired: boolean) {
  const name = cleanText(body.name, LIMITS.name);
  if (name.length < 2) throw new HttpError(400, "Please enter your name.");
  const phone = normalizeTTPhone(body.phone);
  if (!phone) throw new HttpError(400, "Please enter a valid Trinidad & Tobago phone number, e.g. 868-555-1234.");
  const emailRaw = cleanText(body.email, LIMITS.email);
  if (emailRaw && !isValidEmail(emailRaw)) throw new HttpError(400, "Please enter a valid email address.");
  if (emailRequired && !emailRaw) throw new HttpError(400, "Please enter your email address for your receipt.");
  const idempotencyKey = typeof body.idempotencyKey === "string" && IDEMPOTENCY_RE.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (!idempotencyKey) throw new HttpError(400, "Invalid request. Please refresh the page and try again.");
  return { name, phone, email: emailRaw || null, notes: cleanText(body.notes, LIMITS.notes), idempotencyKey };
}

function heatFrom(value: unknown): string | null {
  return HEATS.find(h => h.id === value)?.id ?? null;
}

// ── Regular website orders ───────────────────────────────────────────────
export async function placeRegularOrder(body: Record<string, unknown>): Promise<OrderReceipt> {
  const settings = await loadSettings();
  if (settings.orders_open === "false") throw new HttpError(409, "Orders are currently closed.", "ORDERS_CLOSED");

  const c = customerFields(body, false);

  const fulfilment = body.fulfillment === "delivery" ? "delivery" : body.fulfillment === "pickup" ? "pickup" : null;
  if (!fulfilment) throw new HttpError(400, "Please choose delivery or pickup.");
  let address: string | null = null;
  let area: string | null = null;
  if (fulfilment === "delivery") {
    address = cleanText(body.address, LIMITS.address);
    if (address.length < 5) throw new HttpError(400, "Please enter your delivery address.");
    area = cleanText(body.deliveryArea, 80) || null;
    if (area && BLOCKED_DELIVERY_AREAS.includes(area)) throw new HttpError(400, `We do not deliver to ${area}. Please choose pickup.`);
    if (area && !DELIVERY_AREAS.includes(area)) throw new HttpError(400, "Please choose a delivery area from the list.");
    if (body.deliveryAcknowledged !== true) throw new HttpError(400, "Please acknowledge the delivery window.");
  }

  const paymentMethod: PaymentMethod | null =
    body.paymentMethod === "bank_transfer" ? "bank_transfer" : body.paymentMethod === "cash_on_delivery" ? "cash_on_delivery" : null;
  if (!paymentMethod) throw new HttpError(400, "Please choose a payment method.");

  const day = body.orderDay as OrderDay;
  if (!["thursday", "friday", "saturday"].includes(day)) throw new HttpError(400, "Please choose which day you are ordering for.");
  const openDays = {
    thursday: settings.day_thursday !== "false",
    friday: settings.day_friday !== "false",
    saturday: settings.day_saturday === "true",
  };
  const slot = regularFulfilmentFor(day, new Date(), openDays);
  const dayName = day.charAt(0).toUpperCase() + day.slice(1);
  if (!slot) throw new HttpError(409, `Orders for ${dayName} are closed. Please choose another day.`, "DAY_CLOSED");

  const deliveryFee = fulfilment === "delivery" ? DELIVERY_FEE : 0;
  const priced = priceOrThrow(body.lines, item => isItemActive(item, settings), body.expectedTotal, deliveryFee);

  const legacyNotes = [
    c.notes,
    `Payment: ${paymentMethod === "bank_transfer" ? "online_payment" : "cash_on_delivery"}`,
    `Day: ${dayName}`,
    area ? `Area: ${area}` : "",
  ].filter(Boolean).join("\n");

  return insertOrder({
    name: c.name, phone: c.phone, email: c.email,
    package: legacyPackage(priced.lines), details: legacyDetails(priced.lines),
    fulfillment: fulfilment, fulfilment_type: fulfilment, address, delivery_area: area,
    notes: legacyNotes, heat: heatFrom(body.heat),
    subtotal: priced.subtotal, delivery_fee: deliveryFee, service_fee: 0, total: priced.total,
    items: priced.lines, menu_version: MENU_VERSION,
    status: "new", payment_method: paymentMethod, payment_status: initialPaymentStatus(paymentMethod), amount_paid: 0,
    scheduled_fulfilment_date: slot.date, idempotency_key: c.idempotencyKey,
  }, c.idempotencyKey);
}

// ── School-event orders ──────────────────────────────────────────────────
export async function placeEventOrder(ev: SchoolEventRow, body: Record<string, unknown>): Promise<OrderReceipt> {
  if (!isOrderingOpen(ev)) throw new HttpError(409, "Ordering for this event has closed.", "EVENT_CLOSED");

  const paymentMethod = body.paymentMethod as PaymentMethod;
  if (!["cash_on_collection", "bank_transfer"].includes(paymentMethod) || !ev.allowed_payment_methods.includes(paymentMethod)) {
    throw new HttpError(400, "Please choose a payment method.");
  }
  const c = customerFields(body, paymentMethod === "bank_transfer");

  const programme = cleanText(body.programme, LIMITS.programme);
  if (programme.length < 2) throw new HttpError(400, "Please enter your programme, class or cohort.");
  const studentId = cleanText(body.studentId, LIMITS.studentId);
  if (ev.student_id_required && !studentId) throw new HttpError(400, "Please enter your student ID.");
  const collectionName = cleanText(body.collectionName, LIMITS.name);

  if (body.acknowledged !== true || body.policyVersion !== ev.policy_version) {
    throw new HttpError(400, "Please tick the box to confirm the collection details.", "ACK_REQUIRED");
  }

  const settings = await loadSettings();
  const hidden = new Set(ev.hidden_item_ids);
  const fee = Number(ev.event_fee) || 0;
  const priced = priceOrThrow(body.lines, item => isItemActive(item, settings) && !hidden.has(item.id), body.expectedTotal, fee);

  const weekday = formatDateOnly(ev.event_date, { weekday: "long" });
  const legacyNotes = [
    c.notes,
    `Payment: ${paymentMethod === "bank_transfer" ? "online_payment" : "cash_on_collection"}`,
    `Day: ${weekday}`,
    `School event: ${ev.school_name}`,
  ].filter(Boolean).join("\n");

  return insertOrder({
    name: c.name, phone: c.phone, email: c.email,
    package: legacyPackage(priced.lines), details: legacyDetails(priced.lines),
    fulfillment: "school_event_collection", fulfilment_type: "school_event_collection", address: null,
    notes: legacyNotes, heat: heatFrom(body.heat),
    subtotal: priced.subtotal, delivery_fee: 0, service_fee: fee, total: priced.total,
    items: priced.lines, menu_version: MENU_VERSION,
    status: "new", payment_method: paymentMethod, payment_status: initialPaymentStatus(paymentMethod), amount_paid: 0,
    scheduled_fulfilment_date: ev.event_date, idempotency_key: c.idempotencyKey,
    school_event_id: ev.id, programme_or_cohort: programme, student_id: studentId || null,
    collection_name: collectionName || null, event_policy_version: ev.policy_version,
    event_policy_text: ev.policy_text, event_policy_acknowledged_at: new Date().toISOString(),
  }, c.idempotencyKey);
}
