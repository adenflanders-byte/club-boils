// Unit tests for the pure business rules. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart, publicMenu, CATALOG, isItemActive, getCatalogItem, describeLine } from "../lib/menu";
import { regularFulfilmentFor, ttInstant, ttDateString, formatTTTime } from "../lib/time";
import { normalizeTTPhone, isValidEmail, cleanText } from "../lib/validation";
import { initialPaymentStatus, orderPaymentMethod } from "../lib/payments";
import { signSessionToken, verifySessionToken, hashAccessCode, verifyAccessCode, accessCodeProblem } from "../lib/server/crypto";

const all = () => true;

test("every catalogue id is unique and stable", () => {
  const ids = CATALOG.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["solo_shrimp", "duo_mix", "lobster_half_solo", "lobster_loaded_whole_duo", "build_solo", "build_duo", "ramen", "wings", "sauce", "combo"]) {
    assert.ok(getCatalogItem(id), `missing ${id}`);
  }
});

test("prices come from the menu, never from the request", () => {
  const r = priceCart([{ itemId: "solo_shrimp", quantity: 2, price: 1, unitPrice: 1, lineTotal: 1 }], all);
  assert.ok(r.ok);
  assert.equal(r.subtotal, 260);
  assert.equal(r.lines[0].unitPrice, 130);
});

test("add-ons are priced per unit and only allowed on boils", () => {
  const r = priceCart([{ itemId: "lobster_half_duo", quantity: 1, addons: { extra_shrimp: 2, pepper_sauce: 1 } }], all);
  assert.ok(r.ok);
  assert.equal(r.subtotal, 360 + 2 * 25 + 10);
  assert.equal(r.lines[0].description, "½ lobster (larger serving) + 2x Extra Shrimp, 1x Pepper Sauce");
  const bad = priceCart([{ itemId: "wings", quantity: 1, addons: { extra_shrimp: 1 } }], all);
  assert.equal(bad.ok, false);
});

test("build your own: seafood + extras + heat, duo prices", () => {
  const r = priceCart([{ itemId: "build_duo", quantity: 1, seafood: ["crab", "shrimp"], extras: ["corn"], heat: "hot" }], all);
  assert.ok(r.ok);
  assert.equal(r.subtotal, 100 + 60 + 100 + 10);
  assert.equal(r.lines[0].description, "Shrimp, Snow Crab + Extra Corn - Hot (Duo)");
  assert.equal(priceCart([{ itemId: "build_solo", quantity: 1, seafood: [], heat: "hot" }], all).ok, false);
  assert.equal(priceCart([{ itemId: "build_solo", quantity: 1, seafood: ["shrimp"] }], all).ok, false);
  assert.equal(priceCart([{ itemId: "build_solo", quantity: 1, seafood: ["shrimp", "shrimp"], heat: "mild" }], all).ok, false);
  assert.equal(priceCart([{ itemId: "build_solo", quantity: 1, seafood: ["lobster"], heat: "mild" }], all).ok, false);
});

test("manipulated or unknown items, quantities and extras are rejected", () => {
  for (const cart of [
    [],
    "x",
    [{ itemId: "free_lobster", quantity: 1 }],
    [{ itemId: "solo_shrimp", quantity: 0 }],
    [{ itemId: "solo_shrimp", quantity: -3 }],
    [{ itemId: "solo_shrimp", quantity: 1.5 }],
    [{ itemId: "solo_shrimp", quantity: 999 }],
    [{ itemId: "solo_shrimp", quantity: 1, addons: { extra_shrimp: -1 } }],
    [{ itemId: "solo_shrimp", quantity: 1, addons: { extra_gold: 1 } }],
    [{ itemId: "ramen", quantity: 1, seafood: ["crab"] }],
    Array.from({ length: 31 }, () => ({ itemId: "sauce", quantity: 1 })),
  ]) {
    assert.equal(priceCart(cart, all).ok, false, JSON.stringify(cart).slice(0, 80));
  }
});

test("items switched off in Admin, or hidden for an event, cannot be ordered", () => {
  const settings = { menu_lobster_half: "false" };
  const active = (id: string) => isItemActive(getCatalogItem(id)!, settings);
  assert.equal(active("lobster_half_solo"), false);
  assert.equal(active("lobster_half_duo"), false);
  assert.equal(active("lobster_whole_solo"), true);
  const r = priceCart([{ itemId: "lobster_half_solo", quantity: 1 }], i => isItemActive(i, settings));
  assert.equal(r.ok, false);
  const hidden = new Set(["wings"]);
  assert.equal(priceCart([{ itemId: "wings", quantity: 1 }], i => !hidden.has(i.id)).ok, false);
  const menu = publicMenu(settings, ["wings"]);
  assert.equal(menu.find(m => m.id === "wings")!.active, false);
  assert.equal(menu.find(m => m.id === "ramen")!.active, true);
});

test("a menu price change shows up everywhere but not in an existing snapshot", () => {
  const before = priceCart([{ itemId: "wings", quantity: 1 }], all);
  assert.ok(before.ok);
  const snapshot = JSON.parse(JSON.stringify(before.lines));
  const wings = getCatalogItem("wings")!;
  const original = wings.basePrice;
  wings.basePrice = 95;
  try {
    const after = priceCart([{ itemId: "wings", quantity: 1 }], all);
    assert.ok(after.ok);
    assert.equal(after.subtotal, 95);
    assert.equal(publicMenu({}).find(m => m.id === "wings")!.basePrice, 95);
    assert.equal(snapshot[0].unitPrice, 80, "stored snapshot keeps the price at order time");
  } finally {
    wings.basePrice = original;
  }
});

test("describeLine matches the old kitchen text", () => {
  const item = getCatalogItem("solo_mix")!;
  assert.equal(describeLine(item, [], [], [], null), "Mix (Shrimp + Crab)");
});

test("Trinidad time: event cutoff is 9:30 AM AST regardless of server timezone", () => {
  const cutoff = ttInstant("2026-10-15", 9, 30);
  assert.equal(cutoff.toISOString(), "2026-10-15T13:30:00.000Z");
  assert.equal(formatTTTime(cutoff), "9:30 AM");
  assert.equal(ttDateString(new Date("2026-10-16T03:59:00Z")), "2026-10-15");
  assert.equal(ttDateString(new Date("2026-10-16T04:00:00Z")), "2026-10-16");
});

test("regular order days close at 8 PM the night before", () => {
  const open = { thursday: true, friday: true, saturday: false };
  // Wednesday 14 Oct 2026, 7:59 PM Trinidad → Thursday 15th is still open
  assert.deepEqual(regularFulfilmentFor("thursday", ttInstant("2026-10-14", 19, 59), open)?.date, "2026-10-15");
  // Wednesday 8:00 PM → Thursday closed (not silently moved to next week)
  assert.equal(regularFulfilmentFor("thursday", ttInstant("2026-10-14", 20, 0), open), null);
  // Friday still fine on Wednesday night
  assert.equal(regularFulfilmentFor("friday", ttInstant("2026-10-14", 21, 0), open)?.date, "2026-10-16");
  // Saturday switched off
  assert.equal(regularFulfilmentFor("saturday", ttInstant("2026-10-14", 9, 0), open), null);
  // Thursday morning → next Thursday
  assert.equal(regularFulfilmentFor("thursday", ttInstant("2026-10-15", 9, 0), open)?.date, "2026-10-22");
});

test("Trinidad phone numbers", () => {
  assert.equal(normalizeTTPhone("868-555-1234"), "868-555-1234");
  assert.equal(normalizeTTPhone("(868) 555 1234"), "868-555-1234");
  assert.equal(normalizeTTPhone("+1 868 555 1234"), "868-555-1234");
  assert.equal(normalizeTTPhone("5551234"), "868-555-1234");
  assert.equal(normalizeTTPhone("555-12"), null);
  assert.equal(normalizeTTPhone("1-212-555-1234"), null);
  assert.equal(normalizeTTPhone("868-055-1234"), null);
  assert.equal(normalizeTTPhone("call me"), null);
});

test("email and text cleaning", () => {
  assert.ok(isValidEmail("student@alj.edu.tt"));
  assert.ok(!isValidEmail("student@alj"));
  assert.equal(cleanText("  hi\u0000 there  ", 50), "hi there");
  assert.equal(cleanText("x".repeat(100), 10).length, 10);
});

test("payments start unpaid; old orders keep their method", () => {
  assert.equal(initialPaymentStatus("bank_transfer"), "awaiting_bank_transfer_verification");
  assert.equal(initialPaymentStatus("cash_on_collection"), "pending_payment");
  assert.equal(initialPaymentStatus("cash_on_delivery"), "pending_payment");
  assert.equal(orderPaymentMethod({ notes: "Payment: online_payment\nDay: Friday" }), "bank_transfer");
  assert.equal(orderPaymentMethod({ notes: "Payment: cash_on_delivery" }), "cash_on_delivery");
  assert.equal(orderPaymentMethod({ payment_method: "cash_on_collection", notes: "Payment: online_payment" }), "cash_on_collection");
});

test("session tokens: signed, typed, expiring", () => {
  const secret = "s".repeat(40);
  const sid = "8f14e45f-ceea-467f-a8f5-5a3b1c2d3e4f";
  const tok = signSessionToken("admin", sid, new Date(Date.now() + 60_000), secret);
  assert.equal(verifySessionToken(tok, "admin", secret)?.sessionId, sid);
  assert.equal(verifySessionToken(tok, "event", secret), null, "admin token is not an event token");
  assert.equal(verifySessionToken(tok, "admin", "t".repeat(40)), null, "wrong secret");
  assert.equal(verifySessionToken(tok.slice(0, -2) + "xx", "admin", secret), null, "tampered");
  const [body, sig] = tok.split(".");
  const forged = Buffer.from(Buffer.from(body, "base64url").toString().replace(/\|\d+$/, "|9999999999")).toString("base64url");
  assert.equal(verifySessionToken(`${forged}.${sig}`, "admin", secret), null, "extended expiry");
  const expired = signSessionToken("admin", sid, new Date(Date.now() - 1000), secret);
  assert.equal(verifySessionToken(expired, "admin", secret), null);
});

test("access codes are salted scrypt hashes, never stored plain", async () => {
  const hash = await hashAccessCode("Boils-ALJ-1015");
  assert.ok(hash.startsWith("scrypt$"));
  assert.ok(!hash.includes("Boils"));
  assert.notEqual(hash, await hashAccessCode("Boils-ALJ-1015"), "salted");
  assert.ok(await verifyAccessCode("Boils-ALJ-1015", hash));
  assert.ok(await verifyAccessCode("  boils-alj-1015 ", hash), "case and spaces ignored");
  assert.ok(!(await verifyAccessCode("Boils-ALJ-1016", hash)));
  assert.ok(!(await verifyAccessCode("Boils-ALJ-1015", null)));
  assert.equal(accessCodeProblem("abc"), "Access codes must be at least 6 characters.");
  assert.equal(accessCodeProblem("abcdef"), null);
});

test("event form: Trinidad times, default policy text matches the brief", async () => {
  const { parseEventInput, eventTotals } = await import("../lib/server/eventAdmin");
  const ev = parseEventInput({
    schoolName: "Arthur Lok Jack Global School of Business", slug: "arthur-lok-jack-oct-15-2026",
    eventDate: "2026-10-15", cutoffTime: "09:30", collectionStart: "12:00", collectionEnd: "14:00",
    paymentMethods: ["cash_on_collection", "bank_transfer"], hiddenItemIds: ["wings", "not_a_real_item"],
  });
  assert.equal(ev.order_cutoff_at, "2026-10-15T13:30:00.000Z");
  assert.equal(ev.collection_start_at, "2026-10-15T16:00:00.000Z");
  assert.equal(ev.collection_end_at, "2026-10-15T18:00:00.000Z");
  assert.equal(ev.event_fee, 0);
  assert.deepEqual(ev.hidden_item_ids, ["wings"]);
  assert.equal(ev.policy_text,
    "I understand that this order is for collection at Arthur Lok Jack Global School of Business between 12:00 PM and 2:00 PM on Thursday, October 15, 2026, and that orders close at 9:30 AM that morning.");
  assert.throws(() => parseEventInput({ schoolName: "X School", slug: "x", eventDate: "2026-10-15", cutoffTime: "13:00",
    collectionStart: "12:00", collectionEnd: "14:00", paymentMethods: ["cash_on_collection"] }), /close before collection/);
  assert.throws(() => parseEventInput({ schoolName: "X School", slug: "Bad Slug", eventDate: "2026-10-15", cutoffTime: "09:00",
    collectionStart: "12:00", collectionEnd: "14:00", paymentMethods: ["cash_on_collection"] }), /link name/);

  // Dashboard totals reconcile with the orders and payment ledger
  const orders = [
    { id: 1, status: "completed", total: 130, subtotal: 130, service_fee: 0, amount_paid: 130, payment_method: "cash_on_collection", payment_status: "paid" },
    { id: 2, status: "ready",     total: 280, subtotal: 280, service_fee: 0, amount_paid: 0,   payment_method: "cash_on_collection", payment_status: "pending_payment" },
    { id: 3, status: "confirmed", total: 100, subtotal: 100, service_fee: 0, amount_paid: 100, payment_method: "bank_transfer", payment_status: "paid" },
    { id: 4, status: "cancelled", total: 80,  subtotal: 80,  service_fee: 0, amount_paid: 0,   payment_method: "bank_transfer", payment_status: "refunded" },
  ];
  const payments = [
    { order_id: 1, kind: "payment" as const, method: "cash", amount: 130 },
    { order_id: 3, kind: "payment" as const, method: "bank_transfer", amount: 100 },
    { order_id: 4, kind: "payment" as const, method: "bank_transfer", amount: 80 },
    { order_id: 4, kind: "refund" as const, method: "bank_transfer", amount: 80 },
  ];
  const t = eventTotals(orders, payments);
  assert.equal(t.totalOrders, 3);
  assert.equal(t.cancelledOrders, 1);
  assert.equal(t.foodRevenue, 510);
  assert.equal(t.expectedRevenue, 380);
  assert.equal(t.earnedRevenue, 130);
  assert.equal(t.cashExpected, 410);
  assert.equal(t.cashReceived, 130);
  assert.equal(t.onlinePaid, 100);
  assert.equal(t.unpaidBalance, 280);
  assert.equal(t.refunded, 80);
  assert.equal(t.reconciles, true);
  assert.equal(t.cashReceived + t.onlinePaid + t.unpaidBalance, t.orderValue, "paid + unpaid = order value");
});
