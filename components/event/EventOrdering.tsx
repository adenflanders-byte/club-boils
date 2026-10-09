"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  priceCart, getCatalogItem, ADDON_EXTRAS, SEAFOOD, DUO_SEAFOOD, EXTRAS, DUO_EXTRAS, HEATS, ALLERGY_WARNING, MAX_ADDON_QTY,
  type LineInput, type PublicMenuItem, type CatalogGroup,
} from "@/lib/menu";
import { BANK_DETAILS, PROOF_OF_PAYMENT_TEXT, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type PaymentMethod, type PaymentStatus } from "@/lib/payments";
import { formatTTTime, formatDateOnly, ttDateString } from "@/lib/time";
import { normalizeTTPhone, isValidEmail } from "@/lib/validation";

// ── Types from /api/events/[slug] ────────────────────────────────────────
interface EventInfo {
  slug: string; schoolName: string; shortName: string; eventDate: string;
  orderCutoffAt: string; collectionStartAt: string; collectionEndAt: string; orderingOpen: boolean;
  collectionLocation?: string; collectionInstructions?: string; paymentMethods?: string[];
  eventFee?: number; studentIdRequired?: boolean; policyVersion?: string; policyText?: string;
}
interface Receipt {
  orderNumber: string; total: number; subtotal: number; serviceFee: number; paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus; balanceDue: number; lines: { name: string; description: string; quantity: number; lineTotal: number }[];
}
type CartEntry = { key: string; line: LineInput };

const GROUPS: { id: CatalogGroup; title: string; blurb: string }[] = [
  { id: "solo",    title: "Club Solo",          blurb: "For one" },
  { id: "duo",     title: "Club Duo",           blurb: "Made to share" },
  { id: "lobster", title: "Lobster Boils",      blurb: "Solo or Duo" },
  { id: "build",   title: "Build Your Own Boil", blurb: "Pick your seafood, extras and heat" },
  { id: "more",    title: "More from the Menu", blurb: "" },
];

const gold = "#C4952A", cream = "#FAF8F3", black = "#0A0A0A", charcoal = "#1C1C1C", muted = "#6B6560",
  border = "rgba(196,149,42,0.25)", goldDim = "rgba(196,149,42,0.12)", red = "#A03030";

const lineKey = (l: Omit<LineInput, "quantity">) => JSON.stringify([l.itemId, l.addons ?? {}, l.seafood ?? [], l.extras ?? [], l.heat ?? ""]);
const newKey = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); };
/** "15 Oct 2026" */
const shortDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]} ${y}`;
};

export default function EventOrdering({ slug }: { slug: string }) {
  const [info, setInfo] = useState<EventInfo | null>(null);
  const [access, setAccess] = useState(false);
  const [menu, setMenu] = useState<PublicMenuItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [clockSkew, setClockSkew] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);

  const [cart, setCart] = useState<CartEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(sessionStorage.getItem(`cb-event-cart-${slug}`) || "[]"); } catch { return []; }
  });
  const [view, setView] = useState<"menu" | "cart" | "checkout" | "done">("menu");
  const [customizing, setCustomizing] = useState<{ itemId: string; addons: Record<string, number> } | null>(null);
  const [building, setBuilding] = useState<{ itemId: "build_solo" | "build_duo"; seafood: string[]; extras: string[]; heat: string } | null>(null);

  const [form, setForm] = useState({ name: "", phone: "", email: "", programme: "", studentId: "", collectionName: "", notes: "", heat: "" });
  const [paymentMethod, setPaymentMethod] = useState<"" | "cash_on_collection" | "bank_transfer">("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [idemKey, setIdemKey] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  // Fetch, then apply in a callback (keeps React's effect rules happy).
  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${slug}`, { cache: "no-store", credentials: "same-origin" });
      return { ok: res.ok, data: await res.json().catch(() => ({})) };
    } catch {
      return { ok: false, data: { error: "Could not load the ordering page. Check your connection and refresh." } };
    }
  }, [slug]);
  const apply = useCallback(({ ok, data }: { ok: boolean; data: Record<string, unknown> & { error?: string } }) => {
    if (!ok) { setLoadError(data.error || "This ordering page is not available."); return; }
    setInfo(data.event as EventInfo);
    setAccess(Boolean(data.access));
    if (data.access) {
      setMenu((data.menu as PublicMenuItem[]) ?? []);
      if (data.serverTime) setClockSkew(new Date(String(data.serverTime)).getTime() - Date.now());
    }
  }, []);
  const load = useCallback(() => fetchEvent().then(apply), [fetchEvent, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchEvent().then(r => { if (!cancelled) apply(r); });
    return () => { cancelled = true; };
  }, [fetchEvent, apply]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Keep the cart if the page is refreshed (this device only).
  useEffect(() => {
    try { sessionStorage.setItem(`cb-event-cart-${slug}`, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart, slug]);

  const cutoffMs = info ? new Date(info.orderCutoffAt).getTime() : 0;
  const remainingMs = cutoffMs - (now + clockSkew);
  const open = !!info && info.orderingOpen && remainingMs > 0;

  const activeIds = useMemo(() => new Set(menu.map(m => m.id)), [menu]);
  const priced = useMemo(() => {
    if (cart.length === 0) return null;
    return priceCart(cart.map(c => c.line), item => activeIds.has(item.id));
  }, [cart, activeIds]);
  const fee = info?.eventFee ?? 0;
  const subtotal = priced?.ok ? priced.subtotal : 0;
  const total = subtotal + (cart.length ? fee : 0);
  const itemCount = cart.reduce((s, c) => s + c.line.quantity, 0);

  function addLine(line: Omit<LineInput, "quantity">) {
    const key = lineKey(line);
    setCart(prev => {
      const existing = prev.find(c => c.key === key);
      if (existing) return prev.map(c => c.key === key ? { ...c, line: { ...c.line, quantity: Math.min(20, c.line.quantity + 1) } } : c);
      return [...prev, { key, line: { ...line, quantity: 1 } }];
    });
    setIdemKey("");
  }
  function changeQty(key: string, delta: number) {
    setCart(prev => prev.flatMap(c => {
      if (c.key !== key) return [c];
      const q = c.line.quantity + delta;
      return q <= 0 ? [] : [{ ...c, line: { ...c.line, quantity: Math.min(20, q) } }];
    }));
    setIdemKey("");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeBusy(true); setCodeError("");
    try {
      const res = await fetch(`/api/events/${slug}/access`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCodeError(data.error || "That code did not work."); }
      else { setCode(""); await load(); }
    } catch {
      setCodeError("Could not reach the server. Try again.");
    }
    setCodeBusy(false);
  }

  function validateCheckout(): string | null {
    if (form.name.trim().length < 2) return "Please enter your name.";
    if (!normalizeTTPhone(form.phone)) return "Please enter a valid mobile number, e.g. 868-555-1234.";
    if (paymentMethod === "bank_transfer" && !isValidEmail(form.email.trim())) return "Please enter your email for your bank-transfer receipt.";
    if (form.email.trim() && !isValidEmail(form.email.trim())) return "Please check your email address.";
    if (form.programme.trim().length < 2) return "Please enter your programme, class or cohort.";
    if (info?.studentIdRequired && !form.studentId.trim()) return "Please enter your student ID.";
    if (!paymentMethod) return "Please choose how you will pay.";
    if (!acknowledged) return "Please tick the box to confirm the collection details.";
    if (!priced?.ok) return priced && !priced.ok ? priced.error : "Your cart is empty.";
    return null;
  }

  async function placeOrder() {
    const problem = validateCheckout();
    if (problem) { setSubmitError(problem); return; }
    if (!open) { setSubmitError("Ordering for this event has closed."); return; }
    setSubmitting(true); setSubmitError("");
    const key = idemKey || newKey();
    if (!idemKey) setIdemKey(key);
    try {
      const res = await fetch(`/api/events/${slug}/orders`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({
          ...form, paymentMethod, acknowledged, policyVersion: info?.policyVersion,
          heat: form.heat || undefined, lines: cart.map(c => c.line), expectedTotal: total, idempotencyKey: key,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setAccess(false); setSubmitError(""); setView("menu"); setCodeError("Your session expired. Enter the access code again — your cart is saved."); }
      else if (!res.ok) {
        setSubmitError(data.error || "Your order could not be placed. Please try again.");
        if (data.code === "EVENT_CLOSED") load();
        if (data.code === "PRICE_CHANGED" || data.code === "CART_INVALID") load();
      } else {
        setReceipt(data.order);
        setCart([]); setIdemKey(""); setView("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setSubmitError("Could not reach the server. Check your connection and try again — you will not be charged twice.");
    }
    setSubmitting(false);
  }

  // ── Rendering helpers ──────────────────────────────────────────────────
  const window_ = info ? `${formatTTTime(info.collectionStartAt)}–${formatTTTime(info.collectionEndAt)}` : "";
  const cutoffLabel = info ? formatTTTime(info.orderCutoffAt) : "";
  const countdown = (() => {
    if (remainingMs <= 0) return "";
    const h = Math.floor(remainingMs / 3_600_000), m = Math.floor((remainingMs % 3_600_000) / 60_000), s = Math.floor((remainingMs % 60_000) / 1000);
    const d = Math.floor(h / 24);
    return d > 0 ? `${d}d ${h % 24}h ${m}m` : `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  })();

  const pill = access && view !== "done" && cart.length > 0 ? { count: itemCount, total, onClick: () => setView("cart") } : null;

  if (loadError) {
    return <Styles><Shell pill={pill}><section className="ev-card ev-center"><h1 className="ev-h1">Not available</h1><p className="ev-muted">{loadError}</p></section></Shell></Styles>;
  }
  if (!info) {
    return <Styles><Shell pill={pill}><section className="ev-card ev-center"><p className="ev-muted">Loading…</p></section></Shell></Styles>;
  }

  const hero = (
    <section className="ev-hero">
      <p className="ev-kicker">School Event · Pre-order</p>
      <h1 className="ev-h1">{info.schoolName}</h1>
      <div className="ev-facts">
        <div><span>Event date</span><strong>{formatDateOnly(info.eventDate)}</strong></div>
        <div><span>Collection at school</span><strong>{window_}</strong></div>
        <div><span>Orders close</span><strong>{cutoffLabel}{ttDateString(new Date(info.orderCutoffAt)) === info.eventDate ? " that day" : `, ${formatDateOnly(ttDateString(new Date(info.orderCutoffAt)), { weekday: "short", month: "short", day: "numeric" })}`}</strong></div>
      </div>
    </section>
  );

  // Closed (after cutoff or switched off) — read-only.
  if (!open && view !== "done") {
    return (
      <Styles><Shell pill={pill}>
        {hero}
        <section className="ev-card ev-center" role="status">
          <p style={{ fontSize: 34, margin: 0 }}>⏰</p>
          <h2 className="ev-h2">Ordering is closed</h2>
          <p className="ev-muted">Orders for this event closed at {cutoffLabel} on {formatDateOnly(ttDateString(new Date(info.orderCutoffAt)))}. If you already ordered, collect it at the school between {window_}.</p>
        </section>
      </Shell></Styles>
    );
  }

  // Access code gate.
  if (!access) {
    return (
      <Styles><Shell pill={pill}>
        {hero}
        <form className="ev-card" onSubmit={submitCode}>
          <h2 className="ev-h2">Enter your access code</h2>
          <p className="ev-muted">This page is for {info.schoolName} students. Enter the code shared with your class.</p>
          <label className="ev-label" htmlFor="code">Access code</label>
          <input id="code" className="ev-input" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            value={code} onChange={e => setCode(e.target.value)} maxLength={64} required />
          {codeError && <p className="ev-error" role="alert">{codeError}</p>}
          <button className="ev-btn ev-btn-gold ev-btn-block" disabled={codeBusy || code.trim().length === 0}>{codeBusy ? "Checking…" : "Continue"}</button>
        </form>
      </Shell></Styles>
    );
  }

  const banner = (
    <div className="ev-banner" role="note">
      <strong>{(info.shortName || info.schoolName).toUpperCase()} SCHOOL EVENT</strong> — Order your Club Boils for {formatDateOnly(info.eventDate, { weekday: "long", month: "long", day: "numeric" })}.
      Orders close at {cutoffLabel}. All orders will be available at the school between {formatTTTime(info.collectionStartAt)} and {formatTTTime(info.collectionEndAt)}.
      {countdown && <span className="ev-countdown">Closes in {countdown}</span>}
    </div>
  );

  const eventTag = (
    <div className="ev-tags">
      <div><span>Event</span><strong>{info.shortName || info.schoolName} - {shortDate(info.eventDate)}</strong></div>
      <div><span>School Collection</span><strong>{formatTTTime(info.collectionStartAt)}-{formatTTTime(info.collectionEndAt)}</strong></div>
    </div>
  );

  // ── Confirmation ───────────────────────────────────────────────────────
  if (view === "done" && receipt) {
    const pm = receipt.paymentMethod;
    return (
      <Styles><Shell pill={pill}>
        <section className="ev-card ev-receipt">
          <p style={{ fontSize: 40, margin: 0, textAlign: "center" }}>🎉</p>
          <h1 className="ev-h1" style={{ textAlign: "center" }}>Order received</h1>
          <p className="ev-order-no">Order number <strong>{receipt.orderNumber}</strong></p>
          {eventTag}
          <dl className="ev-dl">
            <div><dt>School</dt><dd>{info.schoolName}</dd></div>
            <div><dt>Collection</dt><dd>{formatDateOnly(info.eventDate)}, {window_}</dd></div>
            {info.collectionInstructions && <div><dt>Where</dt><dd>{info.collectionInstructions}</dd></div>}
          </dl>
          <div className="ev-lines">
            {receipt.lines.map((l, i) => (
              <div key={i} className="ev-line"><span>{l.quantity}× {l.name}<small>{l.description}</small></span><strong>TT${l.lineTotal}</strong></div>
            ))}
            {receipt.serviceFee > 0 && <div className="ev-line"><span>Event fee</span><strong>TT${receipt.serviceFee}</strong></div>}
            <div className="ev-line ev-total"><span>Total</span><strong>TT${receipt.total}</strong></div>
          </div>
          <dl className="ev-dl">
            <div><dt>Payment method</dt><dd>{PAYMENT_METHOD_LABELS[pm]}</dd></div>
            <div><dt>Payment status</dt><dd>{PAYMENT_STATUS_LABELS[receipt.paymentStatus] ?? receipt.paymentStatus}</dd></div>
            <div><dt>Balance due</dt><dd><strong>TT${receipt.balanceDue}</strong></dd></div>
          </dl>
          {pm === "bank_transfer" && (
            <div className="ev-note ev-note-gold">
              <strong>Your order is not paid until we confirm your transfer.</strong>
              <BankDetails />
              <p>{PROOF_OF_PAYMENT_TEXT.replace("your order number", `your order number (${receipt.orderNumber})`)}</p>
            </div>
          )}
          {pm === "cash_on_collection" && (
            <div className="ev-note">Please bring <strong>TT${receipt.balanceDue}</strong> in cash when you collect. Exact change helps!</div>
          )}
          <p className="ev-muted" style={{ textAlign: "center" }}>Screenshot this page or save it — you’ll need your order number at collection.</p>
          <div className="ev-row ev-no-print">
            <button className="ev-btn" onClick={() => window.print()}>🖨 Print / Save</button>
            <button className="ev-btn ev-btn-gold" onClick={() => { setReceipt(null); setView("menu"); setAcknowledged(false); }}>Place another order</button>
          </div>
        </section>
      </Shell></Styles>
    );
  }

  // ── Cart ───────────────────────────────────────────────────────────────
  const cartBody = (
    <>
      {eventTag}
      {cart.length === 0 && <p className="ev-muted">Your cart is empty.</p>}
      {priced?.ok && priced.lines.map((l, i) => (
        <div key={cart[i].key} className="ev-cart-line">
          <div className="ev-cart-text"><strong>{l.name}</strong><small>{l.description}</small><small>TT${l.unitPrice} each</small></div>
          <div className="ev-qty">
            <button aria-label={`Remove one ${l.name}`} onClick={() => changeQty(cart[i].key, -1)}>−</button>
            <span>{l.quantity}</span>
            <button aria-label={`Add one ${l.name}`} onClick={() => changeQty(cart[i].key, 1)}>+</button>
          </div>
          <strong className="ev-cart-price">TT${l.lineTotal}</strong>
        </div>
      ))}
      {priced && !priced.ok && (
        <div className="ev-note ev-note-red">
          {priced.error}
          <button className="ev-btn" style={{ marginTop: 8 }} onClick={() => setCart(prev => prev.filter(c => c.line.itemId !== priced.itemId))}>Remove unavailable item</button>
        </div>
      )}
      {cart.length > 0 && (
        <div className="ev-lines">
          <div className="ev-line"><span>Food</span><strong>TT${subtotal}</strong></div>
          <div className="ev-line"><span>Event fee</span><strong>{fee > 0 ? `TT$${fee}` : "Free"}</strong></div>
          <div className="ev-line"><span>Delivery</span><strong>None — school collection</strong></div>
          <div className="ev-line ev-total"><span>Total</span><strong>TT${total}</strong></div>
        </div>
      )}
    </>
  );

  if (view === "cart") {
    return (
      <Styles><Shell pill={pill}>
        {banner}
        <section className="ev-card">
          <div className="ev-row-between"><h2 className="ev-h2">Your order</h2><button className="ev-link" onClick={() => setView("menu")}>← Keep shopping</button></div>
          {cartBody}
          {cart.length > 0 && <button className="ev-btn ev-btn-gold ev-btn-block" disabled={!priced?.ok}
            onClick={() => { setView("checkout"); setSubmitError(""); window.scrollTo({ top: 0 }); }}>Checkout — TT${total}</button>}
        </section>
      </Shell></Styles>
    );
  }

  // ── Checkout ───────────────────────────────────────────────────────────
  if (view === "checkout") {
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
    const methods = (info.paymentMethods ?? ["cash_on_collection", "bank_transfer"]) as ("cash_on_collection" | "bank_transfer")[];
    return (
      <Styles><Shell pill={pill}>
        {banner}
        <section className="ev-card">
          <div className="ev-row-between"><h2 className="ev-h2">Checkout</h2><button className="ev-link" onClick={() => setView("cart")}>← Back to cart</button></div>
          {eventTag}
          <div className="ev-grid">
            <Field label="Student name *"><input className="ev-input" value={form.name} onChange={set("name")} autoComplete="name" maxLength={80} /></Field>
            <Field label="Mobile number *"><input className="ev-input" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="868-555-1234" autoComplete="tel" maxLength={20} /></Field>
            <Field label={`Email ${paymentMethod === "bank_transfer" ? "*" : "(optional)"}`}><input className="ev-input" type="email" value={form.email} onChange={set("email")} autoComplete="email" maxLength={254} /></Field>
            <Field label="Programme / class / cohort *"><input className="ev-input" value={form.programme} onChange={set("programme")} placeholder="e.g. MBA 2026, Cohort B" maxLength={80} /></Field>
            <Field label={`Student ID ${info.studentIdRequired ? "*" : "(optional)"}`}><input className="ev-input" value={form.studentId} onChange={set("studentId")} maxLength={40} /></Field>
            <Field label="Someone else collecting? (optional)"><input className="ev-input" value={form.collectionName} onChange={set("collectionName")} placeholder="Their name" maxLength={80} /></Field>
            <Field label="Heat level (for boils)">
              <select className="ev-input" value={form.heat} onChange={set("heat")}>
                <option value="">Choose…</option>
                {HEATS.map(h => <option key={h.id} value={h.id}>{h.emoji} {h.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notes / allergies (optional)">
            <textarea className="ev-input" rows={3} value={form.notes} onChange={set("notes")} maxLength={500} placeholder="Anything we should know?" />
            <small className="ev-warning">⚠️ {ALLERGY_WARNING}</small>
          </Field>

          <h3 className="ev-h3">Payment</h3>
          <div className="ev-choice">
            {methods.includes("cash_on_collection") && (
              <button type="button" className={paymentMethod === "cash_on_collection" ? "on" : ""} onClick={() => setPaymentMethod("cash_on_collection")}>💵 Cash on collection</button>
            )}
            {methods.includes("bank_transfer") && (
              <button type="button" className={paymentMethod === "bank_transfer" ? "on" : ""} onClick={() => setPaymentMethod("bank_transfer")}>🏦 Bank transfer</button>
            )}
          </div>
          {paymentMethod === "bank_transfer" && (
            <div className="ev-note ev-note-gold">
              <BankDetails />
              <p>You’ll get your order number after checkout. {PROOF_OF_PAYMENT_TEXT} Your order stays <strong>awaiting verification</strong> until we confirm the transfer.</p>
            </div>
          )}
          {paymentMethod === "cash_on_collection" && (
            <div className="ev-note">Pay in cash when you collect at the school. Your order is unpaid until then.</div>
          )}

          <label className="ev-ack">
            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
            <span>{info.policyText}</span>
          </label>

          {submitError && <p className="ev-error" role="alert">⚠️ {submitError}</p>}
          <button className="ev-btn ev-btn-gold ev-btn-block" onClick={placeOrder} disabled={submitting || !priced?.ok}>
            {submitting ? "Placing order…" : `Place order — TT$${total}`}
          </button>
        </section>
      </Shell></Styles>
    );
  }

  // ── Menu ───────────────────────────────────────────────────────────────
  return (
    <Styles><Shell pill={pill}>
      {banner}
      {GROUPS.map(g => {
        const items = menu.filter(m => m.group === g.id);
        if (items.length === 0) return null;
        return (
          <section key={g.id} className="ev-section">
            <h2 className="ev-h2">{g.title}</h2>
            {g.blurb && <p className="ev-muted" style={{ marginTop: -6 }}>{g.blurb}</p>}
            <div className="ev-menu">
              {items.map(item => (
                <article key={item.id} className="ev-item">
                  <div>
                    <h3 className="ev-item-name">{item.name}{item.favourite && <span className="ev-fav">Fan Favourite</span>}</h3>
                    <p className="ev-muted ev-item-desc">{item.kind === "build" ? `Base TT$${item.basePrice} + your choices` : item.description}</p>
                  </div>
                  <div className="ev-item-foot">
                    <strong className="ev-price">{item.kind === "build" ? `from TT$${item.basePrice}` : `TT$${item.basePrice}`}</strong>
                    <div className="ev-row">
                      {item.kind === "build" ? (
                        <button className="ev-btn ev-btn-gold" onClick={() => setBuilding({ itemId: item.id as "build_solo" | "build_duo", seafood: [], extras: [], heat: "" })}>Build</button>
                      ) : (
                        <>
                          {item.allowsAddons && <button className="ev-btn" onClick={() => setCustomizing({ itemId: item.id, addons: {} })}>Customise</button>}
                          <button className="ev-btn ev-btn-gold" onClick={() => addLine({ itemId: item.id })} aria-label={`Add ${item.name} ${item.description}`}>+ Add</button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {cart.length > 0 && (
        <div className="ev-sticky">
          <button className="ev-btn ev-btn-gold ev-btn-block" onClick={() => setView("cart")}>View order · {itemCount} item{itemCount === 1 ? "" : "s"} · TT${total}</button>
        </div>
      )}

      {customizing && (() => {
        const item = getCatalogItem(customizing.itemId)!;
        const extraTotal = ADDON_EXTRAS.reduce((s, a) => s + (customizing.addons[a.id] || 0) * a.unitPrice, 0);
        return (
          <Sheet title={`${item.name} — ${item.description}`} onClose={() => setCustomizing(null)}>
            {ADDON_EXTRAS.map(a => {
              const q = customizing.addons[a.id] || 0;
              return (
                <div key={a.id} className="ev-cart-line">
                  <div className="ev-cart-text"><strong>{a.emoji} {a.label}</strong><small>+TT${a.unitPrice} each</small></div>
                  <div className="ev-qty">
                    <button aria-label={`Less ${a.label}`} onClick={() => setCustomizing(c => c && ({ ...c, addons: { ...c.addons, [a.id]: Math.max(0, q - 1) } }))}>−</button>
                    <span>{q}</span>
                    <button aria-label={`More ${a.label}`} onClick={() => setCustomizing(c => c && ({ ...c, addons: { ...c.addons, [a.id]: Math.min(MAX_ADDON_QTY, q + 1) } }))}>+</button>
                  </div>
                </div>
              );
            })}
            <button className="ev-btn ev-btn-gold ev-btn-block" onClick={() => {
              const addons = Object.fromEntries(Object.entries(customizing.addons).filter(([, q]) => q > 0));
              addLine({ itemId: customizing.itemId, addons });
              setCustomizing(null);
            }}>Add to order — TT${item.basePrice + extraTotal}</button>
          </Sheet>
        );
      })()}

      {building && (() => {
        const duo = building.itemId === "build_duo";
        const sf = duo ? DUO_SEAFOOD : SEAFOOD, ex = duo ? DUO_EXTRAS : EXTRAS;
        const toggle = (k: "seafood" | "extras", id: string) => setBuilding(b => b && ({ ...b, [k]: b[k].includes(id) ? b[k].filter(x => x !== id) : [...b[k], id] }));
        const preview = priceCart([{ itemId: building.itemId, quantity: 1, seafood: building.seafood, extras: building.extras, heat: building.heat || undefined }], () => true);
        const base = getCatalogItem(building.itemId)!.basePrice;
        const est = base + building.seafood.reduce((s, id) => s + (sf.find(x => x.id === id)?.price ?? 0), 0) + building.extras.reduce((s, id) => s + (ex.find(x => x.id === id)?.price ?? 0), 0);
        return (
          <Sheet title={duo ? "Build Your Own Boil (Duo)" : "Build Your Own Boil"} onClose={() => setBuilding(null)}>
            <p className="ev-label">Seafood (pick at least one)</p>
            <div className="ev-chips">{sf.map(x => <button key={x.id} className={building.seafood.includes(x.id) ? "on" : ""} onClick={() => toggle("seafood", x.id)}>{x.emoji} {x.label} <small>+TT${x.price}</small></button>)}</div>
            <p className="ev-label">Extras</p>
            <div className="ev-chips">{ex.map(x => <button key={x.id} className={building.extras.includes(x.id) ? "on" : ""} onClick={() => toggle("extras", x.id)}>{x.emoji} {x.label} <small>+TT${x.price}</small></button>)}</div>
            <p className="ev-label">Heat</p>
            <div className="ev-chips">{HEATS.map(h => <button key={h.id} className={building.heat === h.id ? "on" : ""} onClick={() => setBuilding(b => b && ({ ...b, heat: h.id }))}>{h.emoji} {h.label}</button>)}</div>
            <button className="ev-btn ev-btn-gold ev-btn-block" disabled={!preview.ok} onClick={() => {
              addLine({ itemId: building.itemId, seafood: building.seafood, extras: building.extras, heat: building.heat });
              setBuilding(null);
            }}>{preview.ok ? `Add to order — TT$${preview.subtotal}` : `TT$${est} · choose seafood & heat`}</button>
          </Sheet>
        );
      })()}
    </Shell></Styles>
  );
}

function Shell({ pill, children }: { pill: { count: number; total: number; onClick: () => void } | null; children: React.ReactNode }) {
  return (
    <main className="ev-main">
      <header className="ev-header">
        <div className="ev-brand"><span style={{ color: gold, fontSize: 22 }}>♣</span><span className="ev-brand-name">THE CLUB BOILS</span></div>
        {pill && <button className="ev-cart-pill" onClick={pill.onClick} aria-label="View cart">🛒 {pill.count} · TT${pill.total}</button>}
      </header>
      {children}
      <footer className="ev-footer">Questions? WhatsApp <a href="https://wa.me/18682930570">868-293-0570</a> · @theclub.boils</footer>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="ev-field"><label className="ev-label">{label}</label>{children}</div>;
}

function BankDetails() {
  return (
    <dl className="ev-dl ev-bank">
      {BANK_DETAILS.map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
    </dl>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ev-overlay" onClick={onClose}>
      <div className="ev-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="ev-row-between"><h3 className="ev-h3" style={{ margin: 0 }}>{title}</h3><button className="ev-link" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function Styles({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${cream}; }
        .ev-main { min-height: 100vh; background: ${cream}; color: ${charcoal}; font-family: 'Inter', sans-serif; padding-bottom: 96px; }
        .ev-header { position: sticky; top: 0; z-index: 20; background: ${black}; color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; height: 56px; border-bottom: 1px solid ${border}; }
        .ev-brand { display: flex; align-items: center; gap: 10px; }
        .ev-brand-name { font-family: 'Cinzel', serif; font-weight: 600; letter-spacing: .06em; font-size: 15px; }
        .ev-cart-pill { background: ${gold}; color: ${black}; border: 0; border-radius: 20px; padding: 7px 14px; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
        .ev-hero { background: ${black}; color: #fff; padding: 28px 16px 32px; text-align: center; background-image: radial-gradient(ellipse at top, rgba(196,149,42,.18), transparent 70%); }
        .ev-kicker { color: ${gold}; font-size: 10px; letter-spacing: .22em; text-transform: uppercase; font-weight: 700; margin: 0 0 10px; }
        .ev-h1 { font-family: 'Cinzel', serif; font-weight: 600; font-size: clamp(22px, 6vw, 34px); line-height: 1.15; margin: 0 0 16px; }
        .ev-h2 { font-family: 'Cinzel', serif; font-weight: 600; font-size: 21px; margin: 0 0 12px; color: ${black}; }
        .ev-h3 { font-family: 'Cinzel', serif; font-weight: 600; font-size: 17px; margin: 22px 0 10px; color: ${black}; }
        .ev-facts { display: grid; gap: 8px; max-width: 520px; margin: 0 auto; }
        .ev-facts div { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid rgba(196,149,42,.25); padding: 10px 0 0; font-size: 14px; text-align: left; }
        .ev-facts span { color: rgba(255,255,255,.6); }
        .ev-facts strong { color: #fff; text-align: right; }
        .ev-card { background: #fff; border: 1px solid ${border}; border-radius: 8px; padding: 20px 16px; margin: 16px; max-width: 640px; }
        @media (min-width: 680px) { .ev-card { margin: 24px auto; padding: 28px; } }
        .ev-center { text-align: center; }
        .ev-muted { color: ${muted}; font-size: 14px; line-height: 1.6; }
        .ev-label { display: block; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${muted}; margin: 14px 0 6px; }
        .ev-input { width: 100%; padding: 12px 14px; border: 1px solid ${border}; border-radius: 6px; font-size: 16px; font-family: inherit; background: #fff; color: ${charcoal}; }
        .ev-input:focus { outline: 2px solid ${gold}; outline-offset: 1px; }
        .ev-btn { font-family: inherit; font-size: 14px; font-weight: 600; padding: 11px 16px; border-radius: 6px; border: 1px solid ${border}; background: #fff; color: ${charcoal}; cursor: pointer; min-height: 44px; }
        .ev-btn:disabled { opacity: .5; cursor: not-allowed; }
        .ev-btn-gold { background: linear-gradient(135deg, ${gold}, #E8B84B); border: 0; color: ${black}; font-weight: 700; }
        .ev-btn-block { width: 100%; margin-top: 16px; padding: 15px; font-size: 15px; }
        .ev-link { background: none; border: 0; color: ${gold}; font-weight: 600; cursor: pointer; font-size: 14px; font-family: inherit; padding: 8px 0; }
        .ev-error { color: ${red}; font-size: 14px; margin: 10px 0 0; }
        .ev-banner { background: ${black}; color: #fff; padding: 14px 16px; font-size: 13px; line-height: 1.6; border-bottom: 2px solid ${gold}; }
        .ev-banner strong { color: ${gold}; letter-spacing: .04em; }
        .ev-countdown { display: inline-block; margin-left: 8px; background: rgba(196,149,42,.2); color: ${gold}; border-radius: 12px; padding: 2px 10px; font-weight: 700; font-size: 12px; }
        .ev-section { padding: 22px 16px 4px; max-width: 1000px; margin: 0 auto; }
        .ev-menu { display: grid; gap: 12px; grid-template-columns: 1fr; }
        @media (min-width: 700px) { .ev-menu { grid-template-columns: 1fr 1fr; } }
        .ev-item { background: #fff; border: 1px solid ${border}; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; }
        .ev-item-name { font-family: 'Cinzel', serif; font-size: 17px; font-weight: 600; margin: 0 0 4px; color: ${black}; }
        .ev-item-desc { margin: 0; font-size: 13px; }
        .ev-item-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ev-price { font-family: 'Cinzel', serif; color: ${gold}; font-size: 19px; }
        .ev-fav { margin-left: 8px; background: ${goldDim}; color: ${gold}; font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 800; padding: 3px 7px; letter-spacing: .1em; text-transform: uppercase; vertical-align: middle; }
        .ev-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .ev-row-between { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .ev-sticky { position: fixed; left: 0; right: 0; bottom: 0; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: rgba(250,248,243,.96); border-top: 1px solid ${border}; z-index: 15; }
        .ev-sticky .ev-btn-block { margin: 0 auto; display: block; max-width: 640px; }
        .ev-tags { display: grid; gap: 6px; background: ${goldDim}; border: 1px solid ${border}; border-radius: 6px; padding: 10px 12px; margin: 4px 0 14px; }
        .ev-tags div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
        .ev-tags span { color: ${muted}; }
        .ev-cart-line { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 12px 0; border-bottom: 1px solid ${border}; }
        .ev-cart-text { display: flex; flex-direction: column; gap: 2px; font-size: 14px; min-width: 0; }
        .ev-cart-text small { color: ${muted}; font-size: 12px; }
        .ev-cart-price { font-size: 14px; white-space: nowrap; }
        .ev-qty { display: flex; align-items: center; gap: 6px; }
        .ev-qty button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid ${border}; background: #fff; font-size: 18px; cursor: pointer; color: ${charcoal}; }
        .ev-qty span { min-width: 18px; text-align: center; font-weight: 700; }
        .ev-lines { margin-top: 12px; }
        .ev-line { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 14px; border-bottom: 1px dashed ${border}; }
        .ev-line span { display: flex; flex-direction: column; }
        .ev-line small { color: ${muted}; font-size: 12px; }
        .ev-total { font-size: 16px; border-bottom: 0; }
        .ev-total strong { color: ${gold}; font-family: 'Cinzel', serif; font-size: 20px; }
        .ev-grid { display: grid; gap: 0 14px; grid-template-columns: 1fr; }
        @media (min-width: 620px) { .ev-grid { grid-template-columns: 1fr 1fr; } }
        .ev-warning { display: block; color: #7a5c00; font-size: 12px; line-height: 1.5; margin-top: 6px; }
        .ev-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ev-choice button, .ev-chips button { font-family: inherit; font-size: 14px; padding: 12px; border-radius: 6px; border: 1px solid ${border}; background: #fff; cursor: pointer; color: ${charcoal}; min-height: 44px; }
        .ev-choice button.on, .ev-chips button.on { border: 2px solid ${gold}; background: ${goldDim}; color: ${black}; font-weight: 700; }
        .ev-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .ev-chips small { color: ${muted}; }
        .ev-note { background: ${goldDim}; border: 1px solid ${border}; border-radius: 6px; padding: 12px 14px; font-size: 13px; line-height: 1.6; margin-top: 12px; }
        .ev-note p { margin: 8px 0 0; }
        .ev-note-gold { background: #FFFBE6; border-color: #F0C04A; color: #5a4400; }
        .ev-note-red { background: #FFECEC; border-color: #F5C6C6; color: ${red}; }
        .ev-ack { display: flex; gap: 12px; align-items: flex-start; margin-top: 18px; padding: 14px; border: 1px solid #B8D4F5; background: #EBF3FF; border-radius: 6px; font-size: 13px; line-height: 1.6; color: #1A3E6E; cursor: pointer; }
        .ev-ack input { width: 20px; height: 20px; margin-top: 2px; flex-shrink: 0; accent-color: ${gold}; }
        .ev-dl { margin: 12px 0; }
        .ev-dl div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 14px; }
        .ev-dl dt { color: ${muted}; }
        .ev-dl dd { margin: 0; text-align: right; font-weight: 600; }
        .ev-bank dd { font-family: ui-monospace, monospace; }
        .ev-order-no { text-align: center; font-size: 15px; margin: 0 0 14px; }
        .ev-order-no strong { color: ${gold}; font-size: 22px; letter-spacing: .06em; display: block; font-family: 'Cinzel', serif; }
        .ev-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
        .ev-sheet { background: #fff; width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; border-radius: 14px 14px 0 0; padding: 18px 16px calc(18px + env(safe-area-inset-bottom)); }
        @media (min-width: 680px) { .ev-overlay { align-items: center; } .ev-sheet { border-radius: 10px; } }
        .ev-footer { text-align: center; color: ${muted}; font-size: 12px; padding: 28px 16px; }
        .ev-footer a { color: ${gold}; }
        @media print { .ev-header, .ev-no-print, .ev-footer, .ev-sticky { display: none !important; } .ev-card { border: 0; margin: 0; } }
      `}</style>
      {children}
    </>
  );
}
