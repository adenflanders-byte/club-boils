"use client";
import { useState } from "react";
import { adminFetch, newIdempotencyKey } from "@/lib/adminApi";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, orderPaymentMethod, ledgerMethodFor, type PaymentStatus } from "@/lib/payments";
import { ttDateString, ttInstant, formatTTDateTime } from "@/lib/time";
import { C, input, label, btn, goldBtn, pill, PAYMENT_STATUS_STYLE } from "./theme";

export interface PaymentOrder {
  id: string | number;
  total: number;
  status: string;
  amount_paid?: number | string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  notes?: string | null;
}

interface Payment {
  id: string; kind: "payment" | "refund"; method: string; amount: number | string;
  received_at: string; reference: string | null; note: string | null; recorded_by: string;
}

function nowTTLocal(): string {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { timeZone: "America/Port_of_Spain", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${ttDateString(now)}T${time}`;
}
function ttLocalToISO(v: string): string {
  const [date, time] = v.split("T");
  return ttInstant(date, Number(time.slice(0, 2)), Number(time.slice(3, 5))).toISOString();
}

/** Payment status, ledger and "record money received" actions for one order. */
export default function PaymentPanel({ order, onChanged, compact = false }: { order: PaymentOrder; onChanged: () => void; compact?: boolean }) {
  const method = orderPaymentMethod(order);
  const paid = Number(order.amount_paid ?? 0);
  const balance = Math.max(0, Number(order.total) - paid);
  const status = (order.payment_status as PaymentStatus | null) ??
    (method === "bank_transfer" ? "awaiting_bank_transfer_verification" : "pending_payment");
  const st = PAYMENT_STATUS_STYLE[status] ?? PAYMENT_STATUS_STYLE.pending_payment;

  const [mode, setMode] = useState<null | "payment" | "refund">(null);
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(nowTTLocal());
  const [ledgerMethod, setLedgerMethod] = useState<string>(ledgerMethodFor(method));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [idem, setIdem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ledger, setLedger] = useState<Payment[] | null>(null);

  function open(kind: "payment" | "refund") {
    setMode(kind);
    setAmount(String(kind === "payment" ? balance : paid));
    setReceivedAt(nowTTLocal());
    setLedgerMethod(ledgerMethodFor(method));
    setReference(""); setNote(""); setError("");
    setIdem(newIdempotencyKey());
  }

  async function loadLedger() {
    const res = await adminFetch<{ data: Payment[] }>(`/api/admin/orders/${order.id}/payments`);
    if (res.ok) setLedger(res.data.data);
  }

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter an amount greater than 0."); return; }
    const verb = mode === "refund" ? "refund" : "record";
    if (!window.confirm(`${verb === "refund" ? "Refund" : "Record"} TT$${value} (${ledgerMethod.replace("_", " ")}) for this order?`)) return;
    setBusy(true); setError("");
    const res = await adminFetch(`/api/admin/orders/${order.id}/payments`, {
      body: { kind: mode, method: ledgerMethod, amount: value, receivedAt: ttLocalToISO(receivedAt), reference, note, idempotencyKey: idem },
    });
    setBusy(false);
    if (!res.ok) { setError(res.data.error || "Could not save."); return; }
    setMode(null);
    if (ledger) loadLedger();
    onChanged();
  }

  async function markFailed() {
    const reason = window.prompt("Mark this payment as failed/cancelled? Add a short note (optional):");
    if (reason === null) return;
    const res = await adminFetch(`/api/admin/orders/${order.id}/payment-failed`, { body: { note: reason } });
    if (!res.ok) { window.alert(res.data.error || "Could not update."); return; }
    onChanged();
  }

  const recordLabel = method === "bank_transfer" ? "✅ Confirm Bank Transfer Received" : "💵 Record Cash Received";

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "6px", backgroundColor: C.white, padding: compact ? "12px" : "14px 16px", marginBottom: "14px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "12px", color: C.muted }}>Payment:</span>
        <strong style={{ fontSize: "13px" }}>{method ? PAYMENT_METHOD_LABELS[method] : "Not recorded"}</strong>
        <span style={pill(st.color, st.bg)}>{PAYMENT_STATUS_LABELS[status] ?? status}</span>
        <span style={{ fontSize: "12px", color: C.muted, marginLeft: "auto" }}>
          Paid <strong style={{ color: C.charcoal }}>TT${paid}</strong> · Balance <strong style={{ color: balance > 0 ? C.red : C.green }}>TT${balance}</strong>
        </span>
      </div>

      {mode === null && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {balance > 0 && order.status !== "cancelled" && <button onClick={() => open("payment")} style={goldBtn}>{recordLabel}</button>}
          {paid > 0 && <button onClick={() => open("refund")} style={btn}>↩ Record Refund</button>}
          {paid === 0 && status !== "failed_or_cancelled" && <button onClick={markFailed} style={{ ...btn, color: C.red }}>Mark payment failed</button>}
          <button onClick={() => (ledger ? setLedger(null) : loadLedger())} style={btn}>{ledger ? "Hide history" : "Payment history"}</button>
        </div>
      )}

      {mode !== null && (
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: "4px" }}>
          <div>
            <label style={label}>{mode === "refund" ? "Refund amount (TT$)" : "Amount received (TT$)"}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>{mode === "refund" ? "Refunded on" : "Received on"} (Trinidad time)</label>
            <input type="datetime-local" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Method</label>
            <select value={ledgerMethod} onChange={e => setLedgerMethod(e.target.value)} style={input}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style={label}>Reference (optional)</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Bank ref / receipt #" style={input} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Internal note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} style={input} />
          </div>
          {error && <p style={{ gridColumn: "1 / -1", color: C.red, fontSize: "12px" }}>⚠️ {error}</p>}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
            <button onClick={submit} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : mode === "refund" ? "Save Refund" : "Save Payment"}</button>
            <button onClick={() => setMode(null)} style={btn}>Cancel</button>
          </div>
        </div>
      )}

      {ledger && (
        <div style={{ marginTop: "10px", fontSize: "12px" }}>
          {ledger.length === 0 && <p style={{ color: C.muted }}>No payments recorded yet.</p>}
          {ledger.map(p => (
            <div key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ color: p.kind === "refund" ? C.red : C.green, fontWeight: 700 }}>{p.kind === "refund" ? "−" : "+"}TT${Number(p.amount)}</span>
              <span>{p.method.replace("_", " ")}</span>
              <span style={{ color: C.muted }}>{formatTTDateTime(p.received_at)}</span>
              {p.reference && <span>Ref: {p.reference}</span>}
              {p.note && <span style={{ color: C.muted }}>“{p.note}”</span>}
              <span style={{ color: C.muted, marginLeft: "auto" }}>by {p.recorded_by}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
