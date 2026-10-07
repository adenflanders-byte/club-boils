"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch, adminSignOut } from "@/lib/adminApi";
import PaymentPanel from "@/components/admin/PaymentPanel";
import { C, FONT_BODY, FONT_DISPLAY, GOOGLE_FONTS, input, label, btn, goldBtn, pill, PAYMENT_STATUS_STYLE } from "@/components/admin/theme";
import { CATALOG, type PricedLine } from "@/lib/menu";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, orderPaymentMethod, type PaymentMethod } from "@/lib/payments";
import { formatTTTime, formatDateOnly, formatTTDateTime, ttDateString } from "@/lib/time";

// ── Types ────────────────────────────────────────────────────────────────
interface AdminEvent {
  id: string; slug: string; school_name: string; short_name: string; event_date: string;
  order_cutoff_at: string; collection_start_at: string; collection_end_at: string;
  collection_location: string; collection_instructions: string; status: "draft" | "open" | "closed" | "archived";
  event_fee: number; allowed_payment_methods: string[]; hidden_item_ids: string[]; student_id_required: boolean;
  session_ttl_minutes: number; policy_text: string; policy_version: string; has_access_code: boolean; updated_at: string;
}
interface EventOrder {
  id: string; created_at: string; order_number: string | null; name: string; phone: string; email: string | null;
  status: string; total: number; subtotal: number | null; service_fee: number | null; amount_paid: number | null;
  payment_method: string | null; payment_status: string | null; notes: string | null; heat: string | null;
  items: PricedLine[] | null; programme_or_cohort: string | null; student_id: string | null; collection_name: string | null;
  collected_at: string | null; collected_by: string | null; event_policy_acknowledged_at: string | null;
}
interface Totals {
  totalOrders: number; cancelledOrders: number; foodRevenue: number; eventFees: number; orderValue: number;
  expectedRevenue: number; earnedRevenue: number; onlinePaid: number; cashExpected: number; cashReceived: number;
  otherReceived: number; collectedTotal: number; unpaidBalance: number; refunded: number; reconciles: boolean;
}

const EVENT_STATUS_LABEL: Record<string, { label: string; color: string; bg: string; next?: string; nextLabel?: string }> = {
  new:       { label: "New",             color: C.blue,   bg: C.blueBg,   next: "confirmed", nextLabel: "Confirm" },
  confirmed: { label: "Confirmed",       color: C.purple, bg: C.purpleBg, next: "preparing", nextLabel: "Start preparing" },
  preparing: { label: "Preparing",       color: "#8A5A00", bg: "#FFF3D6", next: "ready",     nextLabel: "Ready at school" },
  ready:     { label: "Ready at School", color: C.amber,  bg: C.amberBg,  next: "completed", nextLabel: "Mark collected" },
  completed: { label: "Collected",       color: C.green,  bg: C.greenBg },
  cancelled: { label: "Cancelled",       color: C.red,    bg: C.redBg },
};
const EVENT_STATE_STYLE: Record<string, { color: string; bg: string }> = {
  draft: { color: C.muted, bg: "#F1EFEA" }, open: { color: C.green, bg: C.greenBg },
  closed: { color: C.amber, bg: C.amberBg }, archived: { color: C.muted, bg: "#E8E5DE" },
};

const ttTimeInput = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Port_of_Spain", hour: "2-digit", minute: "2-digit", hour12: false });
const money = (n: number) => `TT$${Math.round(n * 100) / 100}`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function lineText(l: PricedLine) {
  return `${l.quantity}× ${l.name} — ${l.description}`;
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function SchoolEventsAdmin() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadEvents = useCallback(async () => {
    const res = await adminFetch<{ data: AdminEvent[] }>("/api/admin/events");
    if (res.ok) setEvents(res.data.data);
  }, []);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  return (
    <>
      <style>{`${GOOGLE_FONTS} * { box-sizing: border-box; } body { margin: 0; }
        .ae-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 18px 0; }
        .ae-tabs button { font-family: ${FONT_BODY}; font-size: 12px; font-weight: 600; padding: 8px 14px; border-radius: 20px; border: 1px solid ${C.border}; background: transparent; color: ${C.muted}; cursor: pointer; }
        .ae-tabs button.on { background: ${C.black}; color: #fff; border-color: ${C.black}; }
        .ae-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
        .ae-tile { background: #fff; border: 1px solid ${C.border}; border-radius: 6px; padding: 14px; }
        .ae-tile span { display: block; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: ${C.muted}; font-weight: 700; }
        .ae-tile strong { display: block; font-family: ${FONT_DISPLAY}; font-size: 22px; margin-top: 6px; color: ${C.black}; }
        .ae-tile small { color: ${C.muted}; font-size: 11px; }
        .ae-card { background: #fff; border: 1px solid ${C.border}; border-radius: 6px; }
        .ae-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ae-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: ${C.muted}; padding: 8px; border-bottom: 1px solid ${C.border}; }
        .ae-table td { padding: 8px; border-bottom: 1px solid ${C.border}; vertical-align: top; }
        @media print { .no-print { display: none !important; } }
      `}</style>
      <main style={{ backgroundColor: C.cream, minHeight: "100vh", fontFamily: FONT_BODY, color: C.charcoal }}>
        <header className="no-print" style={{ backgroundColor: C.black, padding: "0 clamp(16px,3vw,32px)", display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "64px", gap: "10px", flexWrap: "wrap", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: C.gold, fontSize: "20px" }}>♣</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: "16px", fontWeight: 600, color: C.white, letterSpacing: "0.06em" }}>THE CLUB BOILS</span>
            <span style={pill(C.gold, "rgba(196,149,42,0.15)")}>School Events</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <a href="/admin" style={{ ...btn, backgroundColor: "transparent", color: C.gold, textDecoration: "none" }}>← Orders</a>
            <a href="/accounts" style={{ ...btn, backgroundColor: "transparent", color: C.gold, textDecoration: "none" }}>📊 Accounts</a>
            <button onClick={adminSignOut} style={{ ...btn, backgroundColor: "transparent", color: "rgba(255,255,255,0.5)" }}>Sign Out</button>
          </div>
        </header>

        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px clamp(12px,3vw,24px) 80px" }}>
          {selected ? (
            <EventDetail id={selected} onBack={() => { setSelected(null); loadEvents(); }} onOpen={id => setSelected(id)} />
          ) : creating ? (
            <EventForm onCancel={() => setCreating(false)} onSaved={ev => { setCreating(false); loadEvents(); setSelected(ev.id); }} />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: "26px", margin: 0 }}>School Events</h1>
                <button onClick={() => setCreating(true)} style={goldBtn}>+ Create Event</button>
              </div>
              <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
                {events === null && <p style={{ color: C.muted }}>Loading…</p>}
                {events?.length === 0 && <p style={{ color: C.muted }}>No events yet.</p>}
                {events?.map(ev => {
                  const st = EVENT_STATE_STYLE[ev.status];
                  return (
                    <button key={ev.id} onClick={() => setSelected(ev.id)} className="ae-card" style={{ textAlign: "left", padding: "16px 18px", cursor: "pointer", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", fontFamily: FONT_BODY }}>
                      <span style={pill(st.color, st.bg)}>{ev.status}</span>
                      <div style={{ flex: 1, minWidth: "200px" }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: "15px", color: C.black }}>{ev.school_name}</p>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: C.muted }}>
                          {formatDateOnly(ev.event_date)} · collect {formatTTTime(ev.collection_start_at)}–{formatTTTime(ev.collection_end_at)} · closes {formatTTDateTime(ev.order_cutoff_at)}
                        </p>
                      </div>
                      {!ev.has_access_code && ev.status !== "archived" && <span style={pill(C.red, C.redBg)}>No access code</span>}
                      <span style={{ color: C.gold, fontWeight: 700 }}>Open →</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

// ── Event detail ─────────────────────────────────────────────────────────
function EventDetail({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const [data, setData] = useState<{ event: AdminEvent; orders: EventOrder[]; totals: Totals } | null>(null);
  const [tab, setTab] = useState<"dashboard" | "orders" | "prep" | "collection" | "settings">("dashboard");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await adminFetch<{ event: AdminEvent; orders: EventOrder[]; totals: Totals }>(`/api/admin/events/${id}`);
    if (res.ok) setData(res.data); else setError(res.data.error || "Could not load the event.");
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p style={{ color: C.red }}>{error}</p>;
  if (!data) return <p style={{ color: C.muted }}>Loading…</p>;
  const ev = data.event;
  const st = EVENT_STATE_STYLE[ev.status];
  const link = typeof window !== "undefined" ? `${window.location.origin}/school-orders/${ev.slug}` : `/school-orders/${ev.slug}`;
  const cutoffPassed = Date.now() >= new Date(ev.order_cutoff_at).getTime();

  async function setStatus(status: string) {
    const msg: Record<string, string> = {
      open: "Open ordering for students?", closed: "Close ordering now? Students will no longer be able to order.",
      archived: "Archive this event? The student page will stop working.", draft: "Move back to draft? The student page will stop working.",
    };
    if (!window.confirm(msg[status])) return;
    const res = await adminFetch(`/api/admin/events/${id}`, { method: "PATCH", body: { status } });
    if (!res.ok) window.alert(res.data.error); else load();
  }
  async function duplicate() {
    if (!window.confirm("Create a new draft event with the same settings? Orders, payments, sessions and the access code are not copied.")) return;
    const res = await adminFetch<{ id: string }>(`/api/admin/events/${id}/duplicate`, { body: {} });
    if (!res.ok) window.alert(res.data.error); else onOpen(res.data.id);
  }

  return (
    <div>
      <button onClick={onBack} className="no-print" style={{ ...btn, marginBottom: "14px" }}>← All events</button>
      <div className="ae-card" style={{ padding: "18px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={pill(st.color, st.bg)}>{ev.status}</span>
          {ev.status === "open" && cutoffPassed && <span style={pill(C.amber, C.amberBg)}>cutoff passed — ordering closed</span>}
          {!ev.has_access_code && <span style={pill(C.red, C.redBg)}>No access code set</span>}
        </div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: "24px", margin: "10px 0 4px" }}>{ev.school_name}</h1>
        <p style={{ margin: 0, color: C.muted, fontSize: "13px" }}>
          {formatDateOnly(ev.event_date)} · Collection {formatTTTime(ev.collection_start_at)}–{formatTTTime(ev.collection_end_at)} · Orders close {formatTTDateTime(ev.order_cutoff_at)} (Trinidad time)
        </p>
        <div className="no-print" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px", alignItems: "center" }}>
          <code style={{ fontSize: "12px", background: C.cream, padding: "8px 10px", borderRadius: "4px", border: `1px solid ${C.border}`, wordBreak: "break-all" }}>{link}</code>
          <button style={btn} onClick={() => navigator.clipboard?.writeText(link)}>Copy student link</button>
          {ev.status !== "open" && ev.status !== "archived" && <button style={goldBtn} onClick={() => setStatus("open")}>Open orders</button>}
          {ev.status === "open" && <button style={btn} onClick={() => setStatus("closed")}>Close orders</button>}
          <button style={btn} onClick={duplicate}>Duplicate</button>
          {ev.status !== "archived" && <button style={{ ...btn, color: C.muted }} onClick={() => setStatus("archived")}>Archive</button>}
        </div>
      </div>

      <div className="ae-tabs no-print">
        {(["dashboard", "orders", "prep", "collection", "settings"] as const).map(t => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ dashboard: "Dashboard", orders: `Orders (${data.orders.length})`, prep: "Prep list", collection: "Collection", settings: "Settings & access" }[t]}
          </button>
        ))}
        <button onClick={load}>↻ Refresh</button>
      </div>

      {tab === "dashboard" && <Dashboard totals={data.totals} orders={data.orders} />}
      {tab === "orders" && <OrdersTab orders={data.orders} reload={load} />}
      {tab === "prep" && <PrepTab orders={data.orders} event={ev} />}
      {tab === "collection" && <CollectionTab orders={data.orders} event={ev} reload={load} />}
      {tab === "settings" && (
        <>
          <AccessCodeCard event={ev} reload={load} />
          <EventForm existing={ev} onCancel={() => setTab("dashboard")} onSaved={() => { load(); setTab("dashboard"); }} />
        </>
      )}
    </div>
  );
}

function Dashboard({ totals: t, orders }: { totals: Totals; orders: EventOrder[] }) {
  const byStatus = Object.keys(EVENT_STATUS_LABEL).map(s => ({ s, n: orders.filter(o => o.status === s).length }));
  const tiles: [string, string, string?][] = [
    ["Orders", String(t.totalOrders), `${t.cancelledOrders} cancelled`],
    ["Food revenue", money(t.foodRevenue), t.eventFees ? `+ ${money(t.eventFees)} event fees` : "No event fee"],
    ["Expected (not yet collected)", money(t.expectedRevenue)],
    ["Earned (collected)", money(t.earnedRevenue)],
    ["Bank transfers received", money(t.onlinePaid)],
    ["Cash expected", money(t.cashExpected), "cash-on-collection orders"],
    ["Cash received", money(t.cashReceived)],
    ["Unpaid balance", money(t.unpaidBalance)],
    ["Refunded", money(t.refunded)],
  ];
  return (
    <div>
      <div className="ae-grid">
        {tiles.map(([k, v, sub]) => <div key={k} className="ae-tile"><span>{k}</span><strong>{v}</strong>{sub && <small>{sub}</small>}</div>)}
      </div>
      <div className="ae-card" style={{ padding: "14px 16px", marginTop: "12px", fontSize: "13px" }}>
        <strong>Reconciliation: </strong>
        {t.reconciles
          ? <span style={{ color: C.green }}>✅ Payments ledger matches order balances (received {money(t.collectedTotal)} + unpaid {money(t.unpaidBalance)}).</span>
          : <span style={{ color: C.red }}>⚠️ Ledger and order balances differ — check recent payment entries.</span>}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
          {byStatus.map(({ s, n }) => <span key={s} style={pill(EVENT_STATUS_LABEL[s].color, EVENT_STATUS_LABEL[s].bg)}>{EVENT_STATUS_LABEL[s].label}: {n}</span>)}
        </div>
        <p style={{ color: C.muted, margin: "10px 0 0" }}>These orders also appear in the main Admin and in Accounts under their collection date (tagged “School Event”), counted once.</p>
      </div>
    </div>
  );
}

// ── Orders ───────────────────────────────────────────────────────────────
function useOrderFilters(orders: EventOrder[]) {
  const [q, setQ] = useState("");
  const [programme, setProgramme] = useState("");
  const [method, setMethod] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [status, setStatus] = useState("");
  const [collected, setCollected] = useState("");
  const programmes = useMemo(() => [...new Set(orders.map(o => o.programme_or_cohort || "").filter(Boolean))].sort(), [orders]);
  const filtered = orders.filter(o => {
    const needle = q.trim().toLowerCase();
    if (needle && ![o.name, o.phone, o.student_id, o.order_number, o.collection_name].some(v => (v || "").toLowerCase().includes(needle))) return false;
    if (programme && o.programme_or_cohort !== programme) return false;
    if (method && o.payment_method !== method) return false;
    if (payStatus && o.payment_status !== payStatus) return false;
    if (status && o.status !== status) return false;
    if (collected === "yes" && o.status !== "completed") return false;
    if (collected === "no" && (o.status === "completed" || o.status === "cancelled")) return false;
    return true;
  });
  const bar = (
    <div className="ae-card no-print" style={{ padding: "12px", display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: "12px" }}>
      <input style={input} placeholder="Search name, phone, student ID, order #" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
      <select style={input} value={programme} onChange={e => setProgramme(e.target.value)} aria-label="Programme"><option value="">All programmes</option>{programmes.map(p => <option key={p}>{p}</option>)}</select>
      <select style={input} value={method} onChange={e => setMethod(e.target.value)} aria-label="Payment method"><option value="">All payment methods</option><option value="cash_on_collection">Cash on collection</option><option value="bank_transfer">Bank transfer</option></select>
      <select style={input} value={payStatus} onChange={e => setPayStatus(e.target.value)} aria-label="Payment status"><option value="">All payment statuses</option>{Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select style={input} value={status} onChange={e => setStatus(e.target.value)} aria-label="Preparation status"><option value="">All prep statuses</option>{Object.entries(EVENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <select style={input} value={collected} onChange={e => setCollected(e.target.value)} aria-label="Collection status"><option value="">Collected + not collected</option><option value="no">Not collected yet</option><option value="yes">Collected</option></select>
    </div>
  );
  return { filtered, bar };
}

async function changeStatus(order: EventOrder, status: string, reload: () => void) {
  const forward = ["new", "confirmed", "preparing", "ready", "completed"];
  const isCorrection = status !== "cancelled" && forward.indexOf(status) < forward.indexOf(order.status) || order.status === "cancelled";
  let reason: string | null = null;
  if (status === "completed" && !window.confirm(`Confirm ${order.name} (${order.order_number}) has collected their order?\n\nThis does not mark it paid.`)) return;
  if (status === "cancelled" && !window.confirm(`Cancel order ${order.order_number} for ${order.name}? It will be excluded from expected revenue.`)) return;
  if (isCorrection) {
    reason = window.prompt(`Correction: change ${order.order_number} from “${EVENT_STATUS_LABEL[order.status]?.label}” to “${EVENT_STATUS_LABEL[status]?.label}”.\nReason (required, saved in the audit log):`);
    if (!reason || reason.trim().length < 3) return;
  }
  const res = await adminFetch(`/api/admin/orders/${order.id}/status`, { body: { status, reason } });
  if (!res.ok) window.alert(res.data.error); else reload();
}

function OrderRow({ order, reload }: { order: EventOrder; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const cfg = EVENT_STATUS_LABEL[order.status] ?? EVENT_STATUS_LABEL.new;
  const ps = PAYMENT_STATUS_STYLE[order.payment_status || "pending_payment"];
  return (
    <div className="ae-card" style={{ marginBottom: "8px" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: "14px 16px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", cursor: "pointer", fontFamily: FONT_BODY }}>
        <span style={pill(cfg.color, cfg.bg)}>{cfg.label}</span>
        <span style={{ fontWeight: 700, color: C.black }}>{order.name}</span>
        <span style={{ color: C.muted, fontSize: "12px" }}>#{order.order_number} · {order.programme_or_cohort}</span>
        <span style={{ ...pill(ps.color, ps.bg), marginLeft: "auto" }}>{PAYMENT_STATUS_LABELS[order.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ?? "—"}</span>
        <strong style={{ fontFamily: FONT_DISPLAY }}>{money(Number(order.total))}</strong>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", fontSize: "13px" }}>
          <div style={{ display: "grid", gap: "4px", marginBottom: "12px" }}>
            {(order.items || []).map((l, i) => <p key={i} style={{ margin: 0 }}>· {lineText(l)} <span style={{ color: C.muted }}>({money(l.lineTotal)})</span></p>)}
            {order.heat && <p style={{ margin: 0 }}>Heat: <strong>{order.heat}</strong></p>}
            {order.notes && <p style={{ margin: "4px 0 0", background: "#FFFBE6", border: "1px solid #F0C04A", padding: "6px 10px", borderRadius: "4px", whiteSpace: "pre-wrap" }}>{order.notes}</p>}
            <p style={{ margin: "6px 0 0", color: C.muted }}>
              📞 <a href={`tel:${order.phone}`} style={{ color: C.gold }}>{order.phone}</a>{order.email ? ` · ${order.email}` : ""}
              {order.student_id ? ` · ID ${order.student_id}` : ""}{order.collection_name ? ` · Collected by: ${order.collection_name}` : ""}
            </p>
            <p style={{ margin: 0, color: C.muted }}>Placed {formatTTDateTime(order.created_at)}{order.event_policy_acknowledged_at ? " · collection terms acknowledged" : ""}</p>
            {order.collected_at && <p style={{ margin: 0, color: C.green }}>Collected {formatTTDateTime(order.collected_at)} by {order.collected_by}</p>}
          </div>
          <PaymentPanel order={order} onChanged={reload} compact />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {cfg.next && <button style={goldBtn} onClick={() => changeStatus(order, cfg.next!, reload)}>{cfg.nextLabel}</button>}
            {order.status !== "cancelled" && order.status !== "completed" && <button style={{ ...btn, color: C.red }} onClick={() => changeStatus(order, "cancelled", reload)}>Cancel order</button>}
            <select style={{ ...input, width: "auto" }} value="" onChange={e => e.target.value && changeStatus(order, e.target.value, reload)} aria-label="Correct status">
              <option value="">Correct status…</option>
              {Object.entries(EVENT_STATUS_LABEL).filter(([k]) => k !== order.status).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersTab({ orders, reload }: { orders: EventOrder[]; reload: () => void }) {
  const { filtered, bar } = useOrderFilters(orders);
  return (
    <div>
      {bar}
      <p style={{ color: C.muted, fontSize: "12px" }}>{filtered.length} of {orders.length} orders</p>
      {filtered.map(o => <OrderRow key={o.id} order={o} reload={reload} />)}
    </div>
  );
}

// ── Prep list ────────────────────────────────────────────────────────────
function PrepTab({ orders, event }: { orders: EventOrder[]; event: AdminEvent }) {
  const live = orders.filter(o => o.status !== "cancelled");
  const groups = new Map<string, { label: string; heat: string; qty: number; orders: string[] }>();
  for (const o of live) {
    for (const l of o.items || []) {
      const heat = l.heat || o.heat || "—";
      const key = `${l.name}|${l.description}|${heat}`;
      const g = groups.get(key) ?? { label: `${l.name} — ${l.description}`, heat, qty: 0, orders: [] };
      g.qty += l.quantity; g.orders.push(o.order_number || "");
      groups.set(key, g);
    }
  }
  const rows = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  const baseTotals = new Map<string, number>();
  for (const o of live) for (const l of o.items || []) baseTotals.set(l.name, (baseTotals.get(l.name) || 0) + l.quantity);
  const allergyNotes = live.filter(o => (o.notes || "").trim());

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}><button style={btn} onClick={() => window.print()}>🖨 Print prep list</button></div>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px" }}>Prep — {event.school_name}, {formatDateOnly(event.event_date)}</h2>
      <div className="ae-grid" style={{ marginBottom: "12px" }}>
        {[...baseTotals.entries()].sort().map(([name, qty]) => <div key={name} className="ae-tile"><span>{name}</span><strong>{qty}</strong></div>)}
      </div>
      <div className="ae-card" style={{ overflowX: "auto" }}>
        <table className="ae-table">
          <thead><tr><th>Qty</th><th>Item · size · extras</th><th>Heat</th><th>Orders</th></tr></thead>
          <tbody>
            {rows.map(r => <tr key={`${r.label}|${r.heat}`}><td><strong>{r.qty}</strong></td><td>{r.label}</td><td>{r.heat}</td><td style={{ color: C.muted }}>{r.orders.join(", ")}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={4} style={{ color: C.muted }}>No orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "17px", marginTop: "18px" }}>⚠️ Notes & allergies ({allergyNotes.length})</h3>
      <div className="ae-card" style={{ padding: "6px 12px" }}>
        {allergyNotes.length === 0 && <p style={{ color: C.muted }}>None.</p>}
        {allergyNotes.map(o => <p key={o.id} style={{ fontSize: "13px" }}><strong>#{o.order_number} {o.name}:</strong> {o.notes}</p>)}
      </div>
    </div>
  );
}

// ── Collection list ──────────────────────────────────────────────────────
function CollectionTab({ orders, event, reload }: { orders: EventOrder[]; event: AdminEvent; reload: () => void }) {
  const [groupByCohort, setGroupByCohort] = useState(false);
  const { filtered, bar } = useOrderFilters(orders.filter(o => o.status !== "cancelled"));
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const groups = groupByCohort
    ? [...new Set(sorted.map(o => o.programme_or_cohort || "—"))].sort().map(g => ({ g, list: sorted.filter(o => (o.programme_or_cohort || "—") === g) }))
    : [{ g: "", list: sorted }];

  function printLabels() {
    const w = window.open("", "_blank");
    if (!w) return;
    const labels = sorted.map(o => {
      const method = orderPaymentMethod(o) as PaymentMethod | null;
      const balance = Math.max(0, Number(o.total) - Number(o.amount_paid || 0));
      return `<div class="label">
        <div class="top"><strong>${esc(o.name)}</strong><span>#${esc(o.order_number)}</span></div>
        <div class="prog">${esc(o.programme_or_cohort)}${o.collection_name ? ` · Collector: ${esc(o.collection_name)}` : ""}</div>
        <ul>${(o.items || []).map(l => `<li>${esc(lineText(l))}${l.heat ? ` · ${esc(l.heat)}` : ""}</li>`).join("")}</ul>
        ${o.heat ? `<div>Heat: <strong>${esc(o.heat)}</strong></div>` : ""}
        ${o.notes ? `<div class="allergy">⚠ ${esc(o.notes)}</div>` : ""}
        <div class="pay">${esc(method ? PAYMENT_METHOD_LABELS[method] : "")} · ${esc(PAYMENT_STATUS_LABELS[o.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ?? "")}
          · Total TT$${esc(o.total)} · <strong>Balance TT$${balance}</strong></div>
      </div>`;
    }).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Labels — ${esc(event.school_name)}</title><style>
      body{font-family:Arial,sans-serif;margin:12px} .label{border:1px dashed #999;padding:10px;margin:0 0 10px;page-break-inside:avoid;font-size:12px}
      .top{display:flex;justify-content:space-between;font-size:15px}.prog{color:#555;margin:2px 0 6px} ul{margin:4px 0 6px 16px;padding:0}
      .allergy{background:#fff3cd;padding:4px 6px;margin:4px 0;font-weight:bold}.pay{margin-top:4px;border-top:1px solid #eee;padding-top:4px}
      @media print{.label{break-inside:avoid}}</style></head><body>
      <h3>${esc(event.school_name)} — ${esc(formatDateOnly(event.event_date))} — collection ${esc(formatTTTime(event.collection_start_at))}–${esc(formatTTTime(event.collection_end_at))}</h3>${labels}</body></html>`);
    w.document.close(); w.print();
  }

  return (
    <div>
      {bar}
      <div className="no-print" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px", alignItems: "center" }}>
        <label style={{ fontSize: "13px", display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="checkbox" checked={groupByCohort} onChange={e => setGroupByCohort(e.target.checked)} /> Group by programme / cohort
        </label>
        <button style={btn} onClick={printLabels}>🏷 Print labels ({sorted.length})</button>
        <button style={btn} onClick={() => window.print()}>🖨 Print list</button>
      </div>
      {groups.map(({ g, list }) => (
        <div key={g || "all"} style={{ marginBottom: "14px" }}>
          {g && <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "16px", margin: "10px 0 6px" }}>{g} ({list.length})</h3>}
          <div className="ae-card" style={{ overflowX: "auto" }}>
            <table className="ae-table">
              <thead><tr><th>Student</th><th>Order</th><th>Items</th><th>Payment</th><th>Balance</th><th className="no-print"></th></tr></thead>
              <tbody>
                {list.map(o => {
                  const balance = Math.max(0, Number(o.total) - Number(o.amount_paid || 0));
                  const ps = PAYMENT_STATUS_STYLE[o.payment_status || "pending_payment"];
                  return (
                    <tr key={o.id} style={{ opacity: o.status === "completed" ? 0.55 : 1 }}>
                      <td><strong>{o.name}</strong><br /><small style={{ color: C.muted }}>{o.programme_or_cohort}{o.student_id ? ` · ${o.student_id}` : ""}{o.collection_name ? ` · collector: ${o.collection_name}` : ""}</small></td>
                      <td>#{o.order_number}</td>
                      <td>{(o.items || []).map((l, i) => <div key={i}>{lineText(l)}</div>)}{o.notes && <div style={{ color: C.red }}>⚠ {o.notes}</div>}</td>
                      <td><span style={pill(ps.color, ps.bg)}>{PAYMENT_STATUS_LABELS[o.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ?? "—"}</span><br /><small>{PAYMENT_METHOD_LABELS[(o.payment_method || "cash_on_collection") as PaymentMethod]}</small></td>
                      <td><strong style={{ color: balance > 0 ? C.red : C.green }}>{money(balance)}</strong></td>
                      <td className="no-print">
                        {o.status === "completed"
                          ? <span style={{ color: C.green, fontWeight: 700 }}>✓ Collected</span>
                          : <button style={goldBtn} onClick={() => changeStatus(o, "completed", reload)}>Mark collected</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="no-print" style={{ color: C.muted, fontSize: "12px" }}>To take cash at collection, open the order in the Orders tab and use “Record Cash Received”. Collected and Paid are recorded separately.</p>
    </div>
  );
}

// ── Access code ──────────────────────────────────────────────────────────
function AccessCodeCard({ event, reload }: { event: AdminEvent; reload: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  async function save(disable: boolean) {
    if (disable && !window.confirm("Disable the access code? Nobody will be able to open the student page, and everyone currently in will be signed out.")) return;
    if (!disable && event.has_access_code && !window.confirm("Replace the access code? Everyone currently in will need the new code.")) return;
    const res = await adminFetch(`/api/admin/events/${event.id}/access-code`, { body: disable ? { disable: true } : { code } });
    setMsg(res.ok ? (disable ? "Access code disabled." : "Access code saved. Share it with the students — it cannot be shown again.") : res.data.error || "Failed.");
    if (res.ok) { setCode(""); reload(); }
  }
  async function revoke() {
    if (!window.confirm("Sign out every student currently using this event page? They will need to enter the code again.")) return;
    const res = await adminFetch(`/api/admin/events/${event.id}/revoke-sessions`, { body: {} });
    setMsg(res.ok ? "All student sessions revoked." : res.data.error || "Failed.");
  }
  return (
    <div className="ae-card" style={{ padding: "16px", marginBottom: "14px" }}>
      <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "17px", margin: "0 0 6px" }}>Access code</h3>
      <p style={{ fontSize: "13px", color: C.muted, margin: "0 0 10px" }}>
        {event.has_access_code ? "A code is set. For security it is stored scrambled and cannot be displayed — set a new one if you need to." : "No code is set — students cannot get in until you set one."}
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input style={{ ...input, maxWidth: "260px" }} type="text" autoComplete="off" spellCheck={false} placeholder="New code (6+ characters)" value={code} onChange={e => setCode(e.target.value)} aria-label="New access code" />
        <button style={goldBtn} disabled={code.trim().length < 6} onClick={() => save(false)}>{event.has_access_code ? "Replace code" : "Set code"}</button>
        {event.has_access_code && <button style={btn} onClick={() => save(true)}>Disable code</button>}
        <button style={btn} onClick={revoke}>Sign out all students</button>
      </div>
      {msg && <p style={{ fontSize: "13px", marginTop: "8px", color: C.charcoal }}>{msg}</p>}
    </div>
  );
}

// ── Create / edit form ───────────────────────────────────────────────────
function EventForm({ existing, onCancel, onSaved }: { existing?: AdminEvent; onCancel: () => void; onSaved: (ev: AdminEvent) => void }) {
  const [f, setF] = useState(() => ({
    schoolName: existing?.school_name ?? "",
    shortName: existing?.short_name ?? "",
    slug: existing?.slug ?? "",
    eventDate: existing?.event_date ?? "",
    cutoffDate: existing ? ttDateString(new Date(existing.order_cutoff_at)) : "",
    cutoffTime: existing ? ttTimeInput(existing.order_cutoff_at) : "09:30",
    collectionStart: existing ? ttTimeInput(existing.collection_start_at) : "12:00",
    collectionEnd: existing ? ttTimeInput(existing.collection_end_at) : "14:00",
    collectionLocation: existing?.collection_location ?? "",
    collectionInstructions: existing?.collection_instructions ?? "",
    eventFee: String(existing?.event_fee ?? 0),
    paymentMethods: existing?.allowed_payment_methods ?? ["cash_on_collection", "bank_transfer"],
    hiddenItemIds: existing?.hidden_item_ids ?? [],
    studentIdRequired: existing?.student_id_required ?? false,
    sessionTtlMinutes: String(existing?.session_ttl_minutes ?? 240),
    policyText: existing?.policy_text ?? "",
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const toggle = (k: "paymentMethods" | "hiddenItemIds", v: string) => setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }));

  async function save() {
    setBusy(true); setError("");
    const settings = { ...f, cutoffDate: f.cutoffDate || f.eventDate, eventFee: Number(f.eventFee), sessionTtlMinutes: Number(f.sessionTtlMinutes) };
    let res = existing
      ? await adminFetch<{ data: AdminEvent }>(`/api/admin/events/${existing.id}`, { method: "PATCH", body: { settings } })
      : await adminFetch<{ data: AdminEvent }>("/api/admin/events", { body: settings });
    if (!res.ok && res.data.code === "SCHEDULE_CONFIRM_REQUIRED") {
      if (window.confirm("You are changing the event date or times. Orders already placed keep their original details. This change will be recorded in the audit log. Continue?")) {
        res = await adminFetch<{ data: AdminEvent }>(`/api/admin/events/${existing!.id}`, { method: "PATCH", body: { settings, confirmScheduleChange: true } });
      } else { setBusy(false); return; }
    }
    setBusy(false);
    if (!res.ok) { setError(res.data.error || "Could not save."); return; }
    onSaved(res.data.data);
  }

  const groups = [...new Set(CATALOG.map(c => c.group))];
  return (
    <div className="ae-card" style={{ padding: "18px" }}>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", marginTop: 0 }}>{existing ? "Event settings" : "Create event (saved as a draft)"}</h2>
      <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div><label style={label}>School name</label><input style={input} value={f.schoolName} onChange={set("schoolName")} /></div>
        <div><label style={label}>Short name (banner & cart)</label><input style={input} value={f.shortName} onChange={set("shortName")} placeholder="e.g. Arthur Lok Jack" /></div>
        <div><label style={label}>Link name (slug)</label><input style={input} value={f.slug} onChange={set("slug")} placeholder="school-name-oct-15-2026" /></div>
        <div><label style={label}>Event date</label><input style={input} type="date" value={f.eventDate} onChange={set("eventDate")} /></div>
        <div><label style={label}>Orders close — date</label><input style={input} type="date" value={f.cutoffDate || f.eventDate} onChange={set("cutoffDate")} /></div>
        <div><label style={label}>Orders close — time (Trinidad)</label><input style={input} type="time" value={f.cutoffTime} onChange={set("cutoffTime")} /></div>
        <div><label style={label}>Collection starts</label><input style={input} type="time" value={f.collectionStart} onChange={set("collectionStart")} /></div>
        <div><label style={label}>Collection ends</label><input style={input} type="time" value={f.collectionEnd} onChange={set("collectionEnd")} /></div>
        <div><label style={label}>Event fee per order (TT$)</label><input style={input} type="number" min="0" step="1" value={f.eventFee} onChange={set("eventFee")} /></div>
        <div><label style={label}>Student session length (minutes)</label><input style={input} type="number" min="5" max="1440" value={f.sessionTtlMinutes} onChange={set("sessionTtlMinutes")} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={label}>Collection location</label><input style={input} value={f.collectionLocation} onChange={set("collectionLocation")} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={label}>Collection instructions (shown to students)</label><textarea style={{ ...input, minHeight: "60px" }} value={f.collectionInstructions} onChange={set("collectionInstructions")} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={label}>Collection agreement text (leave blank to generate from the dates above)</label><textarea style={{ ...input, minHeight: "70px" }} value={f.policyText} onChange={set("policyText")} /></div>
      </div>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", margin: "14px 0", fontSize: "13px" }}>
        <label><input type="checkbox" checked={f.paymentMethods.includes("cash_on_collection")} onChange={() => toggle("paymentMethods", "cash_on_collection")} /> Cash on collection</label>
        <label><input type="checkbox" checked={f.paymentMethods.includes("bank_transfer")} onChange={() => toggle("paymentMethods", "bank_transfer")} /> Bank transfer</label>
        <label><input type="checkbox" checked={f.studentIdRequired} onChange={e => setF(p => ({ ...p, studentIdRequired: e.target.checked }))} /> Student ID required</label>
      </div>
      <details style={{ marginBottom: "12px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Menu for this event ({CATALOG.length - f.hiddenItemIds.length} of {CATALOG.length} items shown) — untick to hide</summary>
        <p style={{ fontSize: "12px", color: C.muted }}>Items switched off on the main website are hidden automatically. Hiding here only affects this event.</p>
        {groups.map(g => (
          <div key={g} style={{ margin: "8px 0" }}>
            <strong style={{ fontSize: "12px", textTransform: "uppercase", color: C.muted }}>{g}</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: "4px" }}>
              {CATALOG.filter(c => c.group === g).map(c => (
                <label key={c.id} style={{ fontSize: "13px" }}><input type="checkbox" checked={!f.hiddenItemIds.includes(c.id)} onChange={() => toggle("hiddenItemIds", c.id)} /> {c.name} — {c.description}</label>
              ))}
            </div>
          </div>
        ))}
      </details>
      {error && <p style={{ color: C.red, fontSize: "13px" }}>⚠️ {error}</p>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Create draft"}</button>
        <button style={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
