// End-to-end acceptance tests. Runs against `next start` + a local Supabase
// stack (see .github/workflows/ci.yml). Prints one line per check and exits
// non-zero if any check fails. Screenshots go to tests/e2e/screenshots/.
//
// Env: BASE_URL, SUPABASE_URL, ANON_KEY, SERVICE_KEY, DB_URL, ADMIN_EMAIL,
//      ADMIN_PASSWORD, PW_DIR (folder containing node_modules/playwright), SERVER_LOG
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";

const require = createRequire(`${process.env.PW_DIR}/node_modules/`);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SB = process.env.SUPABASE_URL;
const ANON = process.env.ANON_KEY;
const DB_URL = process.env.DB_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SLUG = "arthur-lok-jack-oct-15-2026";
const CODE = "ALJ-Boils-1015";
const SHOTS = "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { check(name, false, `threw: ${e?.message?.split("\n")[0]}`); }
}
const sql = (q) => execFileSync("psql", [DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const key = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, "0")).join("");

/** fetch with a cookie jar per "client" */
function client(extraHeaders = {}) {
  const jar = new Map();
  return {
    jar,
    async req(path, { method = "GET", body, headers = {} } = {}) {
      const h = { ...extraHeaders, ...headers };
      if (body !== undefined) { h["content-type"] = "application/json"; h.origin = h.origin || BASE; }
      if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";"); const i = pair.indexOf("=");
        const k = pair.slice(0, i), v = pair.slice(i + 1);
        if (/Max-Age=0/i.test(c) || v === "") jar.delete(k); else jar.set(k, v);
      }
      let data = null; try { data = await res.json(); } catch { /* not json */ }
      return { status: res.status, data, headers: res.headers };
    },
  };
}

const cartLines = [
  { itemId: "solo_shrimp", quantity: 2, addons: { extra_shrimp: 1 } },
  { itemId: "build_solo", quantity: 1, seafood: ["shrimp", "crab"], extras: ["corn"], heat: "hot" },
];
const cartTotal = 2 * (130 + 25) + (60 + 30 + 50 + 5); // 455
let POLICY = "alj-2026-10-15-v1";
const student = (over = {}) => ({
  name: "Test Student", phone: "868-555-1234", email: "student@example.com", programme: "MBA 2026",
  studentId: "S123", notes: "No pork please", paymentMethod: "cash_on_collection", acknowledged: true,
  policyVersion: POLICY, lines: cartLines, expectedTotal: cartTotal, idempotencyKey: key(), ...over,
});

// ─────────────────────────────────────────────────────────────────────────
await step("1. public key cannot read or change private data", async () => {
  for (const t of ["orders", "accounts", "payments", "school_events", "audit_log", "admin_users", "admin_sessions", "event_sessions"]) {
    const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
    const body = await r.text();
    check(`anon cannot read ${t}`, r.status === 401 || r.status === 403 || (r.status === 200 && body === "[]"), `HTTP ${r.status}`);
  }
  const ins = await fetch(`${SB}/rest/v1/orders`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "hacker", phone: "1", total: 1 }) });
  check("anon cannot insert orders", ins.status >= 400, `HTTP ${ins.status}`);
  const upd = await fetch(`${SB}/rest/v1/orders?id=not.is.null`, { method: "PATCH", headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ total: 0 }) });
  const updBody = await upd.text();
  check("anon cannot update orders", upd.status >= 400 || updBody === "[]", `HTTP ${upd.status}`);
  const rpc = await fetch(`${SB}/rest/v1/rpc/record_order_payment`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json" },
    body: JSON.stringify({ p_order_id: "x", p_kind: "payment", p_method: "cash", p_amount: 1, p_received_at: null, p_reference: null, p_note: null, p_actor: "x", p_idempotency_key: null }) });
  check("anon cannot call payment functions", rpc.status >= 400, `HTTP ${rpc.status}`);
  const settings = await fetch(`${SB}/rest/v1/settings?select=key,value`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
  check("anon can still read menu settings", settings.status === 200);
  const reviews = await (await fetch(`${SB}/rest/v1/reviews?select=approved`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } })).json();
  check("anon sees only approved reviews", Array.isArray(reviews) && reviews.every(r => r.approved === true));
});

await step("2. unauthenticated users cannot reach admin or financial data", async () => {
  const anon = client();
  for (const p of ["/admin", "/accounts", "/admin/events"]) {
    const r = await anon.req(p);
    check(`${p} redirects to sign-in`, r.status === 307 && (r.headers.get("location") || "").includes("/admin/login"), `HTTP ${r.status}`);
  }
  for (const [p, m] of [["/api/admin/events", "GET"], ["/api/admin/db", "POST"], ["/api/admin/orders/x/payments", "GET"]]) {
    const r = await anon.req(p, m === "POST" ? { method: "POST", body: { table: "orders", op: "select" } } : {});
    check(`${m} ${p} returns 401`, r.status === 401, `HTTP ${r.status}`);
  }
  const forged = client({ cookie: "cb_admin=eyJmYWtlIjoxfQ.c2lnbmF0dXJl" });
  const r = await forged.req("/api/admin/events");
  check("forged admin cookie rejected", r.status === 401, `HTTP ${r.status}`);
});

await step("3. admin sign-in, rate limiting, secure cookie", async () => {
  const attacker = client({ "x-forwarded-for": "203.0.113.9" });
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await attacker.req("/api/admin/login", { method: "POST", body: { email: "victim@example.com", password: `wrong${i}` } })).status);
  check("wrong password rejected", statuses[0] === 401, statuses.join(","));
  check("repeated failures rate-limited", statuses[5] === 429, statuses.join(","));
  const plainLeak = sql(`select count(*) from audit_log where meta::text like '%wrong%' or before::text like '%wrong%' or after::text like '%wrong%'`);
  check("failed passwords never logged", plainLeak === "0");
});

const admin = client({ "x-forwarded-for": "198.51.100.7" });
await step("4. admin session works", async () => {
  const r = await admin.req("/api/admin/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check("admin can sign in", r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.data)}`);
  const cookieHeader = r.headers.getSetCookie?.().find(c => c.startsWith("cb_admin=")) || "";
  check("admin cookie is HttpOnly + Secure + SameSite", /HttpOnly/i.test(cookieHeader) && /Secure/i.test(cookieHeader) && /SameSite=Lax/i.test(cookieHeader));
  const crossSite = await admin.req("/api/admin/db", { method: "POST", body: { table: "orders", op: "select" }, headers: { origin: "https://evil.example" } });
  check("cross-site admin request blocked (CSRF)", crossSite.status === 403, `HTTP ${crossSite.status}`);
});

let eventId;
await step("5. seeded Arthur Lok Jack event", async () => {
  const list = await admin.req("/api/admin/events");
  const ev = list.data?.data?.find(e => e.slug === SLUG);
  eventId = ev?.id;
  check("event exists", !!ev);
  check("cutoff 9:30 AM Trinidad", ev?.order_cutoff_at && new Date(ev.order_cutoff_at).toISOString() === "2026-10-15T13:30:00.000Z", ev?.order_cutoff_at);
  check("collection 12:00–2:00 PM", new Date(ev.collection_start_at).toISOString() === "2026-10-15T16:00:00.000Z" && new Date(ev.collection_end_at).toISOString() === "2026-10-15T18:00:00.000Z");
  check("event fee TT$0", Number(ev.event_fee) === 0);
  check("starts without an access code", ev.has_access_code === false);
  check("access-code hash never sent to browser", !JSON.stringify(list.data).includes("scrypt"));
  const noCode = await client().req(`/api/events/${SLUG}/access`, { method: "POST", body: { code: "anything" } });
  check("no one can enter before a code is set", noCode.status === 401, `HTTP ${noCode.status}`);
});

// Browser: admin sets code and hides an item for the event
const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });

await step("6. admin UI: sign in, set access code, hide item", async () => {
  const page = await desktop.newPage();
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(/\/admin\/login/);
  await page.screenshot({ path: `${SHOTS}/desktop-admin-login.png` });
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/admin`);
  await page.waitForSelector("text=School Events");
  check("admin dashboard loads after sign-in", true);
  await page.goto(`${BASE}/admin/events`);
  await page.click("text=Arthur Lok Jack Global School of Business");
  await page.click("text=Settings & access");
  await page.fill("input[aria-label='New access code']", CODE);
  page.once("dialog", d => d.accept());
  await page.click("text=Set code");
  await page.waitForSelector("text=Access code saved");
  check("admin can set access code", true);
  await page.screenshot({ path: `${SHOTS}/desktop-admin-access-code.png`, fullPage: true });
  const hash = sql(`select access_code_hash from school_events where slug='${SLUG}'`);
  check("code stored as scrypt hash only", hash.startsWith("scrypt$") && !hash.includes(CODE));
  check("plain code not in audit log", sql(`select count(*) from audit_log where coalesce(meta::text,'')||coalesce(after::text,'')||coalesce(before::text,'') ilike '%${CODE}%'`) === "0");
  await page.close();
  // Hide Wings for this event only, via the same API the Settings form uses
  const r = await admin.req(`/api/admin/events/${eventId}`);
  const ev = r.data.event;
  const t = (iso) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Port_of_Spain", hour: "2-digit", minute: "2-digit", hour12: false });
  const save = await admin.req(`/api/admin/events/${eventId}`, { method: "PATCH", body: { settings: {
    schoolName: ev.school_name, shortName: ev.short_name, slug: ev.slug, eventDate: ev.event_date, cutoffDate: ev.event_date,
    cutoffTime: t(ev.order_cutoff_at), collectionStart: t(ev.collection_start_at), collectionEnd: t(ev.collection_end_at),
    collectionLocation: ev.collection_location, collectionInstructions: ev.collection_instructions, eventFee: 0,
    paymentMethods: ev.allowed_payment_methods, hiddenItemIds: ["wings"], sessionTtlMinutes: 240, policyText: ev.policy_text } } });
  check("admin can hide an item for the event", save.status === 200, JSON.stringify(save.data).slice(0, 120));
  check("unchanged schedule needs no confirmation", save.status === 200);
  const moved = await admin.req(`/api/admin/events/${eventId}`, { method: "PATCH", body: { settings: {
    schoolName: ev.school_name, shortName: ev.short_name, slug: ev.slug, eventDate: ev.event_date, cutoffDate: ev.event_date,
    cutoffTime: "09:00", collectionStart: t(ev.collection_start_at), collectionEnd: t(ev.collection_end_at),
    paymentMethods: ev.allowed_payment_methods, hiddenItemIds: ["wings"], policyText: ev.policy_text } } });
  check("schedule change requires confirmation", moved.status === 409 && moved.data.code === "SCHEDULE_CONFIRM_REQUIRED", `HTTP ${moved.status}`);
});

const studentApi = client({ "x-forwarded-for": "192.0.2.50" });
await step("7. student access code checks", async () => {
  const wrong = await studentApi.req(`/api/events/${SLUG}/access`, { method: "POST", body: { code: "WRONG-CODE" } });
  check("wrong code rejected server-side", wrong.status === 401);
  const brute = client({ "x-forwarded-for": "192.0.2.99" });
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await brute.req(`/api/events/${SLUG}/access`, { method: "POST", body: { code: `guess-${i}` } })).status);
  check("repeated wrong codes rate-limited", codes[8] === 429, codes.join(","));
  const noSession = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student() });
  check("ordering without a session is refused", noSession.status === 401);
  const ok = await studentApi.req(`/api/events/${SLUG}/access`, { method: "POST", body: { code: CODE.toLowerCase() } });
  check("correct code accepted (case-insensitive)", ok.status === 200);
  const cookie = ok.headers.getSetCookie?.().find(c => c.startsWith(`cb_evt_${SLUG}=`)) || "";
  check("event cookie HttpOnly + Secure + SameSite", /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite/i.test(cookie));
  const html = await (await fetch(`${BASE}/school-orders/${SLUG}`)).text();
  check("code absent from page HTML", !html.includes(CODE) && !html.toLowerCase().includes(CODE.toLowerCase()));
  check("page is noindex", /<meta name="robots" content="noindex, nofollow/i.test(html));
  const hdr = (await fetch(`${BASE}/school-orders/${SLUG}`)).headers.get("x-robots-tag") || "";
  check("X-Robots-Tag noindex header", hdr.includes("noindex"));
  const otherEvent = sql(`insert into school_events(slug, school_name, event_date, order_cutoff_at, collection_start_at, collection_end_at, status, access_code_hash, policy_version, policy_text)
    values ('other-school-test','Other School','2026-10-20','2026-10-20T09:00:00-04:00','2026-10-20T12:00:00-04:00','2026-10-20T14:00:00-04:00','open',
    (select access_code_hash from school_events where slug='${SLUG}'),'v1','I understand.') returning slug`);
  studentApi.jar.set(`cb_evt_${otherEvent}`, studentApi.jar.get(`cb_evt_${SLUG}`));
  const cross = await studentApi.req(`/api/events/${otherEvent}`);
  check("session for one event does not open another (even with a copied cookie)", cross.data?.access === false);
  studentApi.jar.delete(`cb_evt_${otherEvent}`);
});

let cashOrder, bankOrder;
await step("8. server-side pricing and validation", async () => {
  const menu = await studentApi.req(`/api/events/${SLUG}`);
  POLICY = menu.data?.event?.policyVersion;
  check("policy version exposed to the student page", typeof POLICY === "string" && POLICY.length > 3, POLICY);
  const ids = (menu.data?.menu || []).map(m => m.id);
  check("full active menu shown (incl. lobster)", ids.includes("solo_shrimp") && ids.includes("lobster_whole_solo") && ids.includes("build_duo"), `${ids.length} items`);
  check("event-hidden item not shown", !ids.includes("wings"));
  check("item switched off site-wide not shown", !ids.includes("lobster_half_solo"));
  const tampered = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST",
    body: student({ lines: [{ itemId: "solo_shrimp", quantity: 1, price: 1, unitPrice: 1 }], expectedTotal: 1 }) });
  check("manipulated price rejected", tampered.status === 409 && tampered.data?.code === "PRICE_CHANGED", `HTTP ${tampered.status}`);
  const hidden = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ lines: [{ itemId: "wings", quantity: 1 }], expectedTotal: 80 }) });
  check("hidden item rejected", hidden.status === 409, `HTTP ${hidden.status}`);
  const fake = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ lines: [{ itemId: "gold_lobster", quantity: 1 }], expectedTotal: 0 }) });
  check("unknown item rejected", fake.status === 409, `HTTP ${fake.status}`);
  const noAck = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ acknowledged: false }) });
  check("acknowledgement required server-side", noAck.status === 400 && noAck.data?.code === "ACK_REQUIRED");
  const badPhone = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ phone: "12345" }) });
  check("Trinidad phone validated", badPhone.status === 400);
  const noEmailBank = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ paymentMethod: "bank_transfer", email: "" }) });
  check("email required for bank transfer", noEmailBank.status === 400);

  const body = student();
  const first = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body });
  const again = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body });
  cashOrder = first.data?.order;
  check("event order placed", first.status === 201 && cashOrder?.total === cartTotal, `HTTP ${first.status} total ${cashOrder?.total}`);
  check("retry does not duplicate", again.data?.order?.orderNumber === cashOrder?.orderNumber && again.data?.order?.duplicate === true);
  check("exactly one row for retried order", sql(`select count(*) from orders where idempotency_key='${body.idempotencyKey}'`) === "1");
  const row = sql(`select fulfilment_type||'|'||fulfillment||'|'||scheduled_fulfilment_date||'|'||coalesce(address,'∅')||'|'||delivery_fee||'|'||payment_status||'|'||amount_paid||'|'||(event_policy_acknowledged_at is not null)||'|'||event_policy_version from orders where order_number='${cashOrder.orderNumber}'`);
  check("saved as school-event collection, no address, no delivery fee", row.startsWith("school_event_collection|school_event_collection|2026-10-15|∅|0.00|"), row);
  check("cash order unpaid until recorded", row.includes("|pending_payment|0.00|"), row);
  check("acknowledgement saved with version", row.endsWith(`|true|${POLICY}`), row);
  const stale = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ policyVersion: "old-version" }) });
  check("acknowledging outdated terms is refused", stale.status === 400 && stale.data?.code === "ACK_REQUIRED");
  const snap = JSON.parse(sql(`select items from orders where order_number='${cashOrder.orderNumber}'`));
  check("item snapshot stored", snap.length === 2 && snap[0].unitPrice === 155 && snap[1].heat === "hot");

  const bank = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ name: "Bank Student", phone: "868-555-7777", programme: "EMBA", studentId: "S999", paymentMethod: "bank_transfer", lines: [{ itemId: "duo_mix", quantity: 1 }], expectedTotal: 320 }) });
  bankOrder = bank.data?.order;
  check("bank-transfer order awaits verification", bankOrder?.paymentStatus === "awaiting_bank_transfer_verification" && bankOrder?.balanceDue === 320);
});

await step("9. regular website checkout is server-validated too", async () => {
  const shopper = client({ "x-forwarded-for": "192.0.2.77" });
  const base = { name: "Regular Customer", phone: "8685550000", email: "", notes: "", fulfillment: "pickup", paymentMethod: "cash_on_delivery",
    orderDay: "friday", lines: [{ itemId: "ramen", quantity: 1 }], expectedTotal: 100, idempotencyKey: key() };
  const ok = await shopper.req("/api/orders", { method: "POST", body: base });
  check("regular order accepted with server price", ok.status === 201 && ok.data?.order?.total === 100, `HTTP ${ok.status} ${JSON.stringify(ok.data).slice(0, 120)}`);
  const cheat = await shopper.req("/api/orders", { method: "POST", body: { ...base, expectedTotal: 1, idempotencyKey: key() } });
  check("regular order with manipulated total rejected", cheat.status === 409);
  const deliveryFee = await shopper.req("/api/orders", { method: "POST", body: { ...base, fulfillment: "delivery", address: "12 Main Road", deliveryArea: "Arima", deliveryAcknowledged: true, expectedTotal: 130, idempotencyKey: key() } });
  check("regular delivery keeps TT$30 fee", deliveryFee.data?.order?.total === 130, JSON.stringify(deliveryFee.data).slice(0, 100));
});

await step("10. student flow on a phone (screenshots)", async () => {
  const page = await phone.newPage();
  await page.goto(`${BASE}/school-orders/${SLUG}`);
  await page.waitForSelector("text=Enter your access code");
  await page.screenshot({ path: `${SHOTS}/mobile-1-access.png`, fullPage: true });
  await page.fill("#code", "nope-nope");
  await page.click("text=Continue");
  await page.waitForSelector("text=not correct");
  await page.fill("#code", CODE);
  await page.click("text=Continue");
  await page.waitForSelector("text=SCHOOL EVENT");
  const bannerText = await page.textContent(".ev-banner");
  check("banner text", /ARTHUR LOK JACK SCHOOL EVENT.*Order your Club Boils for Thursday, October 15\. Orders close at 9:30 AM\. All orders will be available at the school between 12:00 PM and 2:00 PM\./s.test(bannerText.replace(/\s+/g, " ")), bannerText);
  await page.screenshot({ path: `${SHOTS}/mobile-2-menu.png`, fullPage: true });
  check("hidden item absent in UI", (await page.locator("h3.ev-item-name", { hasText: /^Wings Boil$/ }).count()) === 0);
  await page.click("button[aria-label='Add Club Solo Shrimp']");
  await page.locator("button:has-text('Build')").first().click();
  await page.click(".ev-sheet >> text=Shrimp");
  await page.click(".ev-sheet >> text=Hot");
  await page.screenshot({ path: `${SHOTS}/mobile-3-build.png` });
  await page.click(".ev-sheet >> text=Add to order");
  await page.click(".ev-sticky button");
  await page.waitForSelector("text=Your order");
  const tagText = await page.textContent(".ev-tags");
  check("cart shows event and collection window", tagText.includes("Arthur Lok Jack - 15 Oct 2026") && tagText.includes("12:00 PM-2:00 PM"), tagText);
  await page.screenshot({ path: `${SHOTS}/mobile-4-cart.png`, fullPage: true });
  await page.click("text=Checkout —");
  await page.fill("input[autocomplete=name]", "Phone Student");
  await page.fill("input[type=tel]", "868 555 2468");
  await page.fill("input[placeholder^='e.g. MBA']", "MSc Finance");
  await page.click("text=💵 Cash on collection");
  await page.click(".ev-ack input");
  await page.screenshot({ path: `${SHOTS}/mobile-5-checkout.png`, fullPage: true });
  check("no delivery address field on event checkout", !(await page.locator("text=Delivery Address").count()));
  await page.click("text=Place order —");
  await page.waitForSelector("text=Order received");
  await page.screenshot({ path: `${SHOTS}/mobile-6-confirmation.png`, fullPage: true });
  const conf = await page.textContent(".ev-receipt");
  check("confirmation shows order no., event, window, total, method, balance",
    /Order number\s*CB-\d+/.test(conf) && conf.includes("Arthur Lok Jack Global School of Business") && conf.includes("12:00 PM–2:00 PM")
    && conf.includes("Cash on collection") && conf.includes("Balance due") && conf.includes("TT$220"), conf.slice(0, 200));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("no horizontal scrolling on iPhone width", !overflow);
  await page.close();
  const dpage = await desktop.newPage();
  await dpage.goto(`${BASE}/school-orders/${SLUG}`);
  await dpage.screenshot({ path: `${SHOTS}/desktop-access.png` });
  await dpage.close();
});

await step("11. payments: cash and bank recorded manually, never automatic", async () => {
  const cashId = sql(`select id from orders where order_number='${cashOrder.orderNumber}'`);
  const bankId = sql(`select id from orders where order_number='${bankOrder.orderNumber}'`);
  // Collected ≠ Paid
  const coll = await admin.req(`/api/admin/orders/${cashId}/status`, { method: "POST", body: { status: "completed" } });
  check("mark collected", coll.status === 200);
  check("collected order still unpaid", sql(`select payment_status||'|'||(collected_at is not null)||'|'||collected_by from orders where id='${cashId}'`) === `pending_payment|true|${ADMIN_EMAIL}`);
  const undo = await admin.req(`/api/admin/orders/${cashId}/status`, { method: "POST", body: { status: "ready" } });
  check("undo collection needs a reason", undo.status === 409 && undo.data.code === "REASON_REQUIRED");
  await admin.req(`/api/admin/orders/${cashId}/status`, { method: "POST", body: { status: "ready", reason: "Wrong student" } });
  check("correction audited", sql(`select count(*) from audit_log where entity_id='${cashId}' and action='order.status_corrected'`) === "1");
  await admin.req(`/api/admin/orders/${cashId}/status`, { method: "POST", body: { status: "completed" } });
  // Record cash
  const k = key();
  const pay = await admin.req(`/api/admin/orders/${cashId}/payments`, { method: "POST", body: { kind: "payment", method: "cash", amount: cartTotal, reference: "", note: "at collection", idempotencyKey: k } });
  const payAgain = await admin.req(`/api/admin/orders/${cashId}/payments`, { method: "POST", body: { kind: "payment", method: "cash", amount: cartTotal, idempotencyKey: k } });
  check("Record Cash Received marks paid", pay.data?.result?.payment_status === "paid");
  check("double-submit records cash once", payAgain.data?.result?.duplicate === true && sql(`select count(*) from payments where order_id='${cashId}'`) === "1");
  check("payment saved with who/when", sql(`select recorded_by||'|'||(received_at is not null) from payments where order_id='${cashId}'`) === `${ADMIN_EMAIL}|true`);
  // Bank stays awaiting until confirmed in the UI
  check("bank order still awaiting verification", sql(`select payment_status from orders where id='${bankId}'`) === "awaiting_bank_transfer_verification");
  const page = await desktop.newPage();
  await page.goto(`${BASE}/admin/events`);
  await page.click("text=Arthur Lok Jack Global School of Business");
  await page.click("text=Orders (");
  await page.click("text=Bank Student");
  await page.click("text=Confirm Bank Transfer Received");
  await page.fill("input[placeholder='Bank ref / receipt #']", "FCB-TRX-001");
  page.once("dialog", d => d.accept());
  await page.click("text=Save Payment");
  await page.waitForSelector("text=Balance TT$0");
  await page.screenshot({ path: `${SHOTS}/desktop-admin-bank-confirmed.png`, fullPage: true });
  await page.close();
  check("bank transfer confirmed by admin", sql(`select payment_status||'|'||amount_paid from orders where id='${bankId}'`) === "paid|320.00");
  check("bank confirmation saved reference", sql(`select reference from payments where order_id='${bankId}'`) === "FCB-TRX-001");
  const tamper = await admin.req("/api/admin/db", { method: "POST", body: { table: "orders", op: "update", filters: [{ column: "id", value: bankId }], values: { payment_status: "paid" } } });
  check("payment status cannot be edited directly", tamper.status === 400);
  const editEvent = await admin.req("/api/admin/db", { method: "POST", body: { table: "orders", op: "update", filters: [{ column: "id", value: bankId }], values: { total: 1 } } });
  check("event order total locked", editEvent.status === 409);
});

await step("12. dashboard, prep and collection lists (screenshots)", async () => {
  const r = await admin.req(`/api/admin/events/${eventId}`);
  const t = r.data.totals;
  const dbTotal = Number(sql(`select coalesce(sum(total),0) from orders where school_event_id='${eventId}' and status<>'cancelled'`));
  check("dashboard order value = sum of orders", t.orderValue === dbTotal, `${t.orderValue} vs ${dbTotal}`);
  check("cash + bank + unpaid reconcile", t.reconciles && Math.abs(t.cashReceived + t.onlinePaid + t.unpaidBalance - t.orderValue) < 0.01, JSON.stringify(t));
  const lines = Number(sql(`select coalesce(sum((l->>'quantity')::int),0) from orders o, jsonb_array_elements(o.items) l where o.school_event_id='${eventId}' and o.status<>'cancelled'`));
  const page = await desktop.newPage();
  await page.goto(`${BASE}/admin/events`);
  await page.click("text=Arthur Lok Jack Global School of Business");
  await page.waitForSelector("text=Food revenue");
  await page.screenshot({ path: `${SHOTS}/desktop-admin-event-dashboard.png`, fullPage: true });
  await page.click("text=Prep list");
  const prepQty = await page.$$eval(".ae-table tbody tr td:first-child strong", els => els.reduce((s, e) => s + Number(e.textContent), 0));
  check("prep totals match order lines", prepQty === lines, `${prepQty} vs ${lines}`);
  check("prep list shows allergy notes", (await page.textContent("body")).includes("No pork please"));
  await page.screenshot({ path: `${SHOTS}/desktop-admin-prep.png`, fullPage: true });
  await page.click(".ae-tabs button:has-text('Collection')");
  await page.screenshot({ path: `${SHOTS}/desktop-admin-collection.png`, fullPage: true });
  await page.fill("input[aria-label=Search]", "S123");
  check("collection search by student ID", (await page.locator(".ae-table tbody tr").count()) === 1);
  await page.close();
  const mpage = await phone.newPage();
  await mpage.goto(`${BASE}/admin/login`);
  await mpage.fill("#email", ADMIN_EMAIL); await mpage.fill("#password", ADMIN_PASSWORD); await mpage.click("button[type=submit]");
  await mpage.waitForURL(`${BASE}/admin`);
  await mpage.goto(`${BASE}/admin/events`);
  await mpage.click("text=Arthur Lok Jack Global School of Business");
  await mpage.waitForSelector("text=Food revenue");
  await mpage.screenshot({ path: `${SHOTS}/mobile-admin-event-dashboard.png`, fullPage: true });
  await mpage.close();
});

await step("13. weekly Admin and Accounts include event orders once", async () => {
  const all = await admin.req("/api/admin/db", { method: "POST", body: { table: "orders", op: "select", order: { column: "created_at", ascending: false } } });
  const eventRows = all.data.data.filter(o => o.school_event_id === eventId);
  const ids = eventRows.map(o => o.id);
  check("event orders appear once in the shared orders list", new Set(ids).size === ids.length && ids.length === Number(sql(`select count(*) from orders where school_event_id='${eventId}'`)));
  check("scheduled in the week of Oct 12–18", eventRows.every(o => o.scheduled_fulfilment_date === "2026-10-15"));
  const page = await desktop.newPage();
  await page.goto(`${BASE}/admin`);
  await page.waitForSelector("text=School Events");
  await page.screenshot({ path: `${SHOTS}/desktop-admin-orders.png`, fullPage: true });
  await page.goto(`${BASE}/accounts`);
  await page.waitForSelector("text=Overview", { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: `${SHOTS}/desktop-accounts.png`, fullPage: true });
  check("accounts page loads for signed-in admin", !(await page.locator("text=LOADING…").count()));
  await page.close();
});

await step("14. menu changes flow to both pages", async () => {
  const off = await admin.req("/api/admin/db", { method: "POST", body: { table: "settings", op: "upsert", values: [{ key: "menu_ramen", value: "false" }] } });
  check("admin can switch an item off", off.status === 200);
  const ev = await studentApi.req(`/api/events/${SLUG}`);
  check("switched-off item gone from event menu", !(ev.data.menu || []).some(m => m.id === "ramen"));
  const page = await desktop.newPage();
  await page.goto(BASE);
  await page.locator("a[href='#menu']").first().click();
  await page.waitForTimeout(1500);
  check("main menu renders from shared menu", (await page.locator("text=Club Solo").count()) > 0);
  check("switched-off item gone from main menu", (await page.locator("p", { hasText: /^Shrimp Alfredo Ramen Boil$/ }).count()) === 0);
  await page.close();
  const shopper = client({ "x-forwarded-for": "192.0.2.78" });
  const r = await shopper.req("/api/orders", { method: "POST", body: { name: "Ramen Fan", phone: "8685550001", fulfillment: "pickup", paymentMethod: "cash_on_delivery", orderDay: "friday",
    lines: [{ itemId: "ramen", quantity: 1 }], expectedTotal: 100, idempotencyKey: key() } });
  check("switched-off item cannot be ordered", r.status === 409, `HTTP ${r.status} ${r.data?.error}`);
  check("earlier order snapshot unchanged", JSON.parse(sql(`select items from orders where order_number='${cashOrder.orderNumber}'`))[0].unitPrice === 155);
  await admin.req("/api/admin/db", { method: "POST", body: { table: "settings", op: "upsert", values: [{ key: "menu_ramen", value: "true" }] } });
});

await step("15. cutoff closes the page and the API", async () => {
  const dup = await admin.req(`/api/admin/events/${eventId}/duplicate`, { method: "POST", body: {} });
  const copyId = dup.data?.id;
  check("duplicate creates a draft", sql(`select status||'|'||(access_code_hash is null)||'|'||(select count(*) from orders where school_event_id='${copyId}')||'|'||(select count(*) from event_sessions where event_id='${copyId}') from school_events where id='${copyId}'`) === "draft|true|0|0");
  // Make the real event's cutoff 15 seconds from now
  sql(`update school_events set order_cutoff_at = now() + interval '15 seconds' where slug='${SLUG}'`);
  const page = await phone.newPage();
  await page.goto(`${BASE}/school-orders/${SLUG}`);
  await page.waitForSelector("text=SCHOOL EVENT");
  const before = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ name: "Early", lines: [{ itemId: "sauce", quantity: 1 }], expectedTotal: 10 }) });
  check("orders accepted before cutoff", before.status === 201, `HTTP ${before.status}`);
  await page.waitForTimeout(17000);
  await page.waitForSelector("text=Ordering is closed", { timeout: 5000 });
  check("page switches to read-only at cutoff", true);
  await page.screenshot({ path: `${SHOTS}/mobile-7-closed.png`, fullPage: true });
  await page.close();
  const late = await studentApi.req(`/api/events/${SLUG}/orders`, { method: "POST", body: student({ name: "Late", lines: [{ itemId: "sauce", quantity: 1 }], expectedTotal: 10 }) });
  check("API refuses orders after cutoff", late.status === 409 && late.data.code === "EVENT_CLOSED", `HTTP ${late.status}`);
  sql(`update school_events set order_cutoff_at = '2026-10-15T09:30:00-04:00' where slug='${SLUG}'`);
});

await step("16. revoking sessions and signing out", async () => {
  await admin.req(`/api/admin/events/${eventId}/revoke-sessions`, { method: "POST", body: {} });
  const r = await studentApi.req(`/api/events/${SLUG}`);
  check("revoked student session no longer has access", r.data?.access === false);
  await admin.req("/api/admin/logout", { method: "POST", body: {} });
  const after = await admin.req("/api/admin/events");
  check("admin signed out", after.status === 401);
});

await browser.close();

await step("17. secrets never appear in server logs", async () => {
  const log = process.env.SERVER_LOG && existsSync(process.env.SERVER_LOG) ? readFileSync(process.env.SERVER_LOG, "utf8") : "";
  check("access code not in server log", !log.includes(CODE));
  check("admin password not in server log", !log.includes(ADMIN_PASSWORD));
  check("service-role key not in server log", !log.includes(process.env.SERVICE_KEY));
  const chunks = execFileSync("bash", ["-c", "find .next/static -name '*.js' -exec cat {} + 2>/dev/null || true"], { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  check("service-role key not in browser JS", !chunks.includes(process.env.SERVICE_KEY));
  check("old admin password removed from browser JS", !chunks.includes("anderson56$"));
});

console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
