"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

// ── Types ──────────────────────────────────────────────────────────────
type TxType = "income" | "expense" | "equity";
type PayStatus = "unpaid" | "partial" | "paid" | "refunded";
type TxCategory =
  | "Order Sales" | "Delivery Income" | "Catering" | "Other Income"
  | "Ingredients" | "Packaging" | "Delivery/Driver Fees" | "Gas & Transport"
  | "Equipment" | "Marketing" | "Utilities" | "Labour/Wages" | "Rent"
  | "Repairs & Maintenance" | "Bank/Processing Fees" | "Refunds" | "Taxes" | "Other"
  | "Owner Contribution" | "Owner Draw" | "Adjustment";

interface Transaction {
  id: string;
  created_at: string;
  type: TxType;
  category: TxCategory | string;
  description: string | null;
  amount: number;
  date: string;
  payment_method?: string | null;
  receipt_number?: string | null;
  supplier?: string | null;
  notes?: string | null;
}

interface Order {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  package: string;
  total: number;
  status: string;
  fulfillment: string;
  notes?: string | null;
  payment_method?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────
const INCOME_CATS  = ["Order Sales", "Delivery Income", "Catering", "Other Income"];
const EXPENSE_CATS = ["Ingredients", "Packaging", "Delivery/Driver Fees", "Gas & Transport", "Equipment", "Marketing", "Utilities", "Labour/Wages", "Rent", "Repairs & Maintenance", "Bank/Processing Fees", "Refunds", "Taxes", "Other"];
const EQUITY_CATS  = ["Owner Contribution", "Owner Draw"];
const PASSWORD     = "anderson56$";

// Trinidad timezone helper
function toTT(d: Date): Date {
  return new Date(d.toLocaleString("en-US", { timeZone: "America/Port_of_Spain" }));
}
function ttDateStr(d: Date): string {
  return toTT(d).toISOString().split("T")[0];
}
// Returns the Monday date of the Mon-Sun business week for a given date string
// Uses noon TT time to avoid UTC boundary issues
function getWeekKey(dateStr: string): string {
  // Parse in TT timezone by appending noon TT offset
  const d = new Date(dateStr + "T12:00:00-04:00");
  const dow = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  // Days back to Monday: Sun=6, Mon=0, Tue=1 ... Sat=5
  const daysBack = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - daysBack);
  // Format as YYYY-MM-DD using TT date parts
  const yy = mon.getFullYear();
  const mm = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function getMonthKey(dateStr: string): string { return dateStr.slice(0, 7); }
function getYearKey(dateStr: string):  string { return dateStr.slice(0, 4); }
function getFulfilmentDate(order: Order): string | null {
  if (!order.notes) return null;
  const m = order.notes.match(/Day:\s*(Thursday|Friday|Saturday)/i);
  if (!m) return null;
  // Use created_at week to find the right day
  const base = new Date(order.created_at);
  const dayMap: Record<string, number> = { thursday: 4, friday: 5, saturday: 6 };
  const target = dayMap[m[1].toLowerCase()];
  const cur = base.getDay();
  let diff = target - cur;
  if (diff <= 0) diff += 7;
  const result = new Date(base);
  result.setDate(base.getDate() + diff);
  return result.toISOString().split("T")[0];
}

// ── Styling tokens ─────────────────────────────────────────────────────
const C = {
  cream: "#FAF8F3", white: "#FFFFFF", gold: "#C4952A",
  goldDim: "rgba(196,149,42,0.12)", black: "#0A0A0A",
  charcoal: "#1C1C1C", muted: "#6B6560", border: "rgba(196,149,42,0.2)",
  green: "#1A7A3A", greenBg: "#EAFFF0", greenBorder: "#8FD4A0",
  red: "#A03030", redBg: "#FFECEC", redBorder: "#F5C6C6",
  amber: "#B8600A", amberBg: "#FFF8EC", amberBorder: "#F0C04A",
};
const FD = `'Cinzel', serif`;
const FB = `'Inter', sans-serif`;
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap');`;

// ── Tooltip component ──────────────────────────────────────────────────
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "rgba(196,149,42,0.2)", color: C.gold, fontSize: "10px", fontWeight: "700", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "help", marginLeft: "6px" }}>?</span>
      {show && (
        <span style={{ position: "absolute", bottom: "24px", left: "50%", transform: "translateX(-50%)", backgroundColor: C.black, color: C.white, fontSize: "11px", padding: "8px 12px", borderRadius: "4px", whiteSpace: "normal" as const, zIndex: 999, lineHeight: 1.5, maxWidth: "260px" }}>
          {text}
        </span>
      )}
    </span>
  );
}

export default function AccountsPage() {
  const [authed,       setAuthed]       = useState(false);
  const [pwInput,      setPwInput]      = useState("");
  const [pwError,      setPwError]      = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [activeTab,    setActiveTab]    = useState<"overview" | "pl" | "cashflow" | "transactions" | "receipts" | "health" | "allocation">("overview");
  const [periodFilter, setPeriodFilter] = useState<"week" | "lastweek" | "month" | "lastmonth" | "year" | "all">("week");

  // Add/edit form
  const [newType,    setNewType]    = useState<TxType>("expense");
  const [newCat,     setNewCat]     = useState<string>("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newAmount,  setNewAmount]  = useState("");
  const [newDate,    setNewDate]    = useState(ttDateStr(new Date()));
  const [newPMethod, setNewPMethod] = useState("");
  const [newSupplier,setNewSupplier]= useState("");
  const [newNotes,   setNewNotes]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  // Edit state
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editType,   setEditType]   = useState<TxType>("expense");
  const [editCat,    setEditCat]    = useState("");
  const [editDesc,   setEditDesc]   = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate,   setEditDate]   = useState("");

  // Scan receipt
  const [scanning,   setScanning]   = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanError,  setScanError]  = useState("");
  const [receiptTab, setReceiptTab] = useState<"scan" | "manual">("scan");

  // Allocation
  const [alloc, setAlloc] = useState([
    { label: "Owner",               pct: 30, distributed: false },
    { label: "Father",              pct: 30, distributed: false },
    { label: "Reinvest in Business",pct: 30, distributed: false },
    { label: "Emergency Fund",      pct: 10, distributed: false },
  ]);

  useEffect(() => {
    if (authed) { fetchTransactions(); fetchOrders(); }
  }, [authed]);

  async function fetchTransactions() {
    setLoading(true);
    const { data } = await supabase.from("accounts").select("*").order("date", { ascending: false });
    if (data) setTransactions(data as Transaction[]);
    setLoading(false);
  }
  async function fetchOrders() {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  }

  function handleLogin() {
    if (pwInput === PASSWORD) { setAuthed(true); setPwError(false); }
    else setPwError(true);
  }

  async function addTransaction() {
    if (!newCat || !newAmount || isNaN(Number(newAmount))) { alert("Please fill in category and amount."); return; }
    setSaving(true);
    await supabase.from("accounts").insert({
      type: newType, category: newCat, description: newDesc.trim() || null,
      amount: Math.round(Number(newAmount)), date: newDate,
      payment_method: newPMethod || null, supplier: newSupplier.trim() || null,
      notes: newNotes.trim() || null,
    });
    setSaving(false); setSaved(true);
    setNewCat(""); setNewDesc(""); setNewAmount(""); setNewPMethod(""); setNewSupplier(""); setNewNotes("");
    setTimeout(() => setSaved(false), 3000);
    fetchTransactions();
  }

  async function deleteTransaction(id: string) {
    if (!window.confirm("Delete this transaction? This cannot be undone.")) return;
    await supabase.from("accounts").delete().eq("id", id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  function startEdit(t: Transaction) {
    setEditId(t.id); setEditType(t.type); setEditCat(t.category);
    setEditDesc(t.description || ""); setEditAmount(String(t.amount)); setEditDate(t.date);
  }
  async function saveEdit() {
    if (!editId) return;
    await supabase.from("accounts").update({
      type: editType, category: editCat, description: editDesc.trim() || null,
      amount: Math.round(Number(editAmount)), date: editDate,
    }).eq("id", editId);
    setTransactions(prev => prev.map(t => t.id === editId ? {
      ...t, type: editType, category: editCat, description: editDesc,
      amount: Math.round(Number(editAmount)), date: editDate,
    } : t));
    setEditId(null);
  }

  async function scanReceipt(file: File) {
    setScanError(""); setScanResult(null); setScanning(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type as any, data: base64 } },
            { type: "text", text: `You are analyzing a receipt for The Club Boils, a seafood business in Trinidad. Extract all line items. For each item pick the best category from: ${EXPENSE_CATS.join(", ")}. Return ONLY JSON: {"items":[{"description":"string","amount":number,"category":"string"}],"total":number,"date":"YYYY-MM-DD or empty","supplier":"store name or empty"}` }
          ]}]
        })
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      setScanResult(JSON.parse(clean));
    } catch { setScanError("Could not read receipt. Try a clearer photo or enter manually."); }
    setScanning(false);
  }

  async function saveScanResult() {
    if (!scanResult) return;
    setSaving(true);
    for (const item of scanResult.items) {
      await supabase.from("accounts").insert({
        type: "expense", category: item.category, description: item.description,
        amount: Math.round(item.amount), date: scanResult.date || newDate,
        supplier: scanResult.supplier || null,
      });
    }
    setSaving(false); setSaved(true); setScanResult(null);
    setTimeout(() => setSaved(false), 3000);
    fetchTransactions();
  }

  // ── Financial calculations ─────────────────────────────────────────
  function getPeriodDates(): [Date, Date] {
    // All dates computed in TT timezone (America/Port_of_Spain, UTC-4)
    const now = toTT(new Date());
    const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate();

    // Monday-Sunday business week
    const dow = now.getDay(); // 0=Sun...6=Sat
    const daysBack = dow === 0 ? 6 : dow - 1; // days since last Monday
    const monStart = new Date(y, mo, d - daysBack, 0, 0, 0);
    const sunEnd   = new Date(y, mo, d - daysBack + 6, 23, 59, 59);
    const lwMon    = new Date(y, mo, d - daysBack - 7, 0, 0, 0);
    const lwSun    = new Date(y, mo, d - daysBack - 1, 23, 59, 59);

    const monthStart  = new Date(y, mo, 1, 0, 0, 0);
    const monthEnd    = new Date(y, mo + 1, 0, 23, 59, 59);
    const lmStart     = new Date(y, mo - 1, 1, 0, 0, 0);
    const lmEnd       = new Date(y, mo, 0, 23, 59, 59);
    const yearStart   = new Date(y, 0, 1, 0, 0, 0);
    const yearEnd     = new Date(y, 11, 31, 23, 59, 59);

    const map: Record<string, [Date, Date]> = {
      week:      [monStart,  sunEnd],
      lastweek:  [lwMon,     lwSun],
      month:     [monthStart, monthEnd],
      lastmonth: [lmStart,    lmEnd],
      year:      [yearStart,  yearEnd],
      all:       [new Date(2020, 0, 1), new Date(2099, 11, 31)],
    };
    return map[periodFilter];
  }

  function inPeriod(dateStr: string): boolean {
    const [start, end] = getPeriodDates();
    // Parse at noon TT to avoid UTC date shifting
    const d = new Date(dateStr + "T12:00:00-04:00");
    return d >= start && d <= end;
  }

  // Order revenue: completed orders only, by fulfilment date
  const completedOrders = orders.filter(o => o.status === "completed");
  const expectedOrders  = orders.filter(o => ["new","confirmed","ready"].includes(o.status));
  const cancelledOrders = orders.filter(o => o.status === "cancelled");

  // STRICT: only use fulfilment date. If missing, exclude from period totals (flagged in health check).
  const periodCompletedOrders = completedOrders.filter(o => {
    const fd = getFulfilmentDate(o);
    return fd ? inPeriod(fd) : false; // missing fulfilment date → Unassigned, not included
  });
  const periodExpectedOrders = expectedOrders.filter(o => {
    const fd = getFulfilmentDate(o);
    return fd ? inPeriod(fd) : false;
  });
  const unassignedOrders = orders.filter(o => !getFulfilmentDate(o) && o.status !== "cancelled");

  const earnedRevenue   = periodCompletedOrders.reduce((s, o) => s + o.total, 0);
  const expectedRevenue = periodExpectedOrders.reduce((s, o) => s + o.total, 0);

  const periodTx = transactions.filter(t => inPeriod(t.date));
  const otherIncome    = periodTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const cogs           = periodTx.filter(t => t.type === "expense" && ["Ingredients","Packaging"].includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const opExpenses     = periodTx.filter(t => t.type === "expense" && !["Ingredients","Packaging"].includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const totalExpenses  = cogs + opExpenses;
  const grossProfit    = earnedRevenue - cogs;
  const netProfit      = grossProfit + otherIncome - opExpenses;
  const profitMargin   = earnedRevenue > 0 ? ((netProfit / earnedRevenue) * 100).toFixed(1) : "0";
  const avgOrderValue  = periodCompletedOrders.length > 0 ? Math.round(earnedRevenue / periodCompletedOrders.length) : 0;

  // Payment breakdown — uses period-filtered completed orders (not all time)
  const paymentBase  = periodFilter === "all" ? completedOrders : periodCompletedOrders;
  const bankOrders   = paymentBase.filter(o => o.notes && o.notes.includes("Bank Transfer"));
  const cashOrders   = paymentBase.filter(o => o.notes && o.notes.includes("Cash on Delivery"));
  const unclassified = paymentBase.filter(o => !o.notes?.includes("Bank Transfer") && !o.notes?.includes("Cash on Delivery"));

  // Health checks
  const healthIssues: string[] = [];
  orders.filter(o => o.status !== "cancelled").forEach(o => {
    const fd = getFulfilmentDate(o);
    if (!fd) healthIssues.push(`⚠️ Order #${o.id.slice(0,8)} — ${o.name} (TT$${o.total}): missing fulfilment date — placed in Unassigned/Needs Review`);
    if (o.status === "completed" && !o.notes?.includes("Bank Transfer") && !o.notes?.includes("Cash on Delivery"))
      healthIssues.push(`⚠️ Order #${o.id.slice(0,8)} — ${o.name} (TT$${o.total}): completed but payment method unclassified`);
  });
  transactions.forEach(t => {
    if (t.amount <= 0) healthIssues.push(`Transaction ${t.id.slice(0,8)}: invalid amount ${t.amount}`);
  });

  // Period label
  // Period label shows exact date range for weeks
  function getPeriodLabel(): string {
    const fmt = (d: Date) => d.toLocaleDateString("en-TT", { month: "short", day: "numeric" });
    const fmtFull = (d: Date) => d.toLocaleDateString("en-TT", { month: "short", day: "numeric", year: "numeric" });
    const [s, e] = getPeriodDates();
    if (periodFilter === "week") return `This Week (${fmt(s)} – ${fmtFull(e)})`;
    if (periodFilter === "lastweek") return `Last Week (${fmt(s)} – ${fmtFull(e)})`;
    if (periodFilter === "month") return `This Month (${s.toLocaleDateString("en-TT", { month: "long", year: "numeric" })})`;
    if (periodFilter === "lastmonth") return `Last Month (${s.toLocaleDateString("en-TT", { month: "long", year: "numeric" })})`;
    if (periodFilter === "year") return `This Year (${s.getFullYear()})`;
    return "All Time";
  }
  const periodLabels: Record<string, string> = {
    week: "This Week", lastweek: "Last Week", month: "This Month",
    lastmonth: "Last Month", year: "This Year", all: "All Time",
  };

  // Week by week breakdown — for "all time" shows every week, otherwise shows selected period
  function getBreakdownGroups() {
    const groups: Record<string, { earnedRevenue: number; expenses: number; orders: number; cogs: number; opEx: number }> = {};

    // Only completed orders with a valid fulfilment date
    const ordersToShow = periodFilter === "all"
      ? completedOrders.filter(o => getFulfilmentDate(o))
      : periodCompletedOrders;

    ordersToShow.forEach(o => {
      const fd  = getFulfilmentDate(o)!;
      const key = getWeekKey(fd);
      if (!groups[key]) groups[key] = { earnedRevenue: 0, expenses: 0, orders: 0, cogs: 0, opEx: 0 };
      groups[key].earnedRevenue += o.total;
      groups[key].orders++;
    });

    // Expenses: all time shows all, selected period shows period
    const txToShow = periodFilter === "all" ? transactions : periodTx;
    txToShow.filter(t => t.type === "expense").forEach(t => {
      const key = getWeekKey(t.date);
      if (!groups[key]) groups[key] = { earnedRevenue: 0, expenses: 0, orders: 0, cogs: 0, opEx: 0 };
      const isCogs = ["Ingredients","Packaging"].includes(t.category);
      groups[key].expenses += t.amount;
      if (isCogs) groups[key].cogs += t.amount;
      else groups[key].opEx += t.amount;
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }

  // Styles
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "9px 18px", borderRadius: "20px",
    border: active ? "none" : `1px solid ${C.border}`,
    cursor: "pointer", fontFamily: FB, fontSize: "11px",
    fontWeight: active ? "700" : "500", letterSpacing: "0.06em",
    backgroundColor: active ? C.black : "transparent",
    color: active ? C.white : C.muted, transition: "all 0.2s",
  });
  const periodBtn = (p: string): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: "20px",
    border: periodFilter === p ? "none" : `1px solid ${C.border}`,
    cursor: "pointer", fontFamily: FB, fontSize: "10px",
    fontWeight: periodFilter === p ? "700" : "500", letterSpacing: "0.08em",
    backgroundColor: periodFilter === p ? C.gold : "transparent",
    color: periodFilter === p ? C.black : C.muted, transition: "all 0.2s",
  });
  const card = (color?: string): React.CSSProperties => ({
    backgroundColor: C.white, borderRadius: "6px",
    border: `1px solid ${color || C.border}`, padding: "20px",
  });
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: "4px",
    border: `1px solid ${C.border}`, fontSize: "13px", fontFamily: FB,
    boxSizing: "border-box" as const, backgroundColor: C.white, outline: "none",
  };
  const labelSt: React.CSSProperties = {
    fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em",
    textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px",
  };
  const goldBtn: React.CSSProperties = {
    background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black,
    padding: "11px 24px", borderRadius: "4px", border: "none", fontFamily: FB,
    fontWeight: "700", fontSize: "11px", letterSpacing: "0.1em", cursor: "pointer",
    textTransform: "uppercase" as const,
  };

  // ── Login ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{`${FONTS} * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <main style={{ backgroundColor: C.black, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FB, padding: "24px", position: "relative" as const, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: "600px", height: "400px", background: "radial-gradient(ellipse, rgba(196,149,42,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", borderRadius: "8px", border: `1px solid ${C.border}`, padding: "52px 44px", maxWidth: "420px", width: "100%", textAlign: "center" as const, animation: "fadeUp 0.6s ease both", boxShadow: "0 32px 64px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ color: C.gold, fontSize: "28px" }}>♣</span>
              <h1 style={{ fontFamily: FD, fontSize: "22px", fontWeight: "600", color: C.white, letterSpacing: "0.06em" }}>THE CLUB BOILS</h1>
            </div>
            <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "40px" }}>Business Accounts</p>
            <div style={{ textAlign: "left" as const, marginBottom: "16px" }}>
              <label style={labelSt}>Password</label>
              <input type="password" value={pwInput} onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Enter password"
                style={{ ...inputStyle, backgroundColor: "rgba(255,255,255,0.05)", border: pwError ? "1px solid #C0392B" : `1px solid ${C.border}`, color: C.white }} />
              {pwError && <p style={{ color: "#C0392B", fontSize: "12px", marginTop: "6px" }}>Incorrect password.</p>}
            </div>
            <button onClick={handleLogin} style={{ ...goldBtn, width: "100%", padding: "14px" }}>Sign In</button>
          </div>
        </main>
      </>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .acct-card { transition: box-shadow 0.2s, transform 0.2s; }
        .acct-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.1); transform: translateY(-1px); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.gold}; border-radius: 2px; }
      `}</style>
      <main style={{ backgroundColor: C.cream, minHeight: "100vh", fontFamily: FB, color: C.charcoal }}>

        {/* Header */}
        <header style={{ backgroundColor: C.black, padding: "0 clamp(16px,3vw,32px)", display: "flex", justifyContent: "space-between", alignItems: "center", height: "64px", position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: C.gold, fontSize: "20px" }}>♣</span>
            <span style={{ fontFamily: FD, fontSize: "16px", fontWeight: "600", color: C.white, letterSpacing: "0.06em" }}>THE CLUB BOILS</span>
            <span style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.16em", color: C.gold, textTransform: "uppercase" as const, backgroundColor: "rgba(196,149,42,0.15)", padding: "3px 10px", borderRadius: "20px" }}>Accounts</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <a href="/admin" style={{ border: `1px solid ${C.border}`, color: C.gold, padding: "7px 16px", borderRadius: "4px", fontSize: "11px", fontFamily: FB, textDecoration: "none", letterSpacing: "0.06em", fontWeight: "600" }}>← Orders</a>
            <button onClick={() => setAuthed(false)} style={{ backgroundColor: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)", padding: "7px 16px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontFamily: FB }}>Sign Out</button>
          </div>
        </header>

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px clamp(16px,3vw,24px)" }}>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "28px", flexWrap: "wrap" as const }}>
            {([["overview","📊 Overview"],["pl","📈 P&L"],["cashflow","💵 Cash Flow"],["transactions","📋 Transactions"],["receipts","🧾 Receipts"],["allocation","🥧 Allocation"],["health","❤️ Health"]] as const).map(([id, label]) => (
              <button key={id} style={tabBtn(activeTab === id)} onClick={() => setActiveTab(id as any)}>{label}</button>
            ))}
          </div>

          {/* Period filter */}
          {["overview","pl","cashflow"].includes(activeTab) && (
            <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" as const }}>
              {(["week","lastweek","month","lastmonth","year","all"] as const).map(p => (
                <button key={p} style={periodBtn(p)} onClick={() => setPeriodFilter(p)}>{periodLabels[p]}</button>
              ))}
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {activeTab === "overview" && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em", color: C.gold, marginBottom: "20px", textTransform: "uppercase" as const }}>{getPeriodLabel()}</p>

              {/* Key metric cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: "24px" }}>
                {[
                  { label: "Expected Revenue", value: `TT$${expectedRevenue}`, color: C.amber, bg: C.amberBg, tip: "Total value of non-cancelled New, Confirmed and Ready orders. Forecast only — not yet earned.", sub: `${periodExpectedOrders.length} pending orders` },
                  { label: "Earned Revenue",   value: `TT$${earnedRevenue}`,   color: C.green, bg: C.greenBg, tip: "Revenue from Completed orders only, assigned to fulfilment date. This is your actual income.", sub: `${periodCompletedOrders.length} completed orders` },
                  { label: "Other Income",     value: `TT$${otherIncome}`,     color: C.green, bg: C.greenBg, tip: "Manual income entries (catering, other sales) for this period.", sub: "manual entries" },
                  { label: "Cost of Goods",    value: `TT$${cogs}`,            color: C.red,   bg: C.redBg,   tip: "Ingredients and Packaging costs — directly tied to producing your menu items.", sub: "ingredients + packaging" },
                  { label: "Operating Expenses",value: `TT$${opExpenses}`,     color: C.red,   bg: C.redBg,   tip: "All other business expenses: gas, marketing, equipment, etc.", sub: "all other expenses" },
                  { label: "Gross Profit",     value: `${grossProfit >= 0 ? "+" : ""}TT$${grossProfit}`, color: grossProfit >= 0 ? C.green : C.red, bg: grossProfit >= 0 ? C.greenBg : C.redBg, tip: "Earned Revenue minus Cost of Goods Sold. Profit before operating expenses.", sub: "revenue - COGS" },
                  { label: earnedRevenue > 0 ? "Net Profit" : "Projected Profit", value: `${netProfit >= 0 ? "+" : ""}TT$${netProfit}`, color: earnedRevenue > 0 ? (netProfit >= 0 ? C.green : C.red) : C.amber, bg: earnedRevenue > 0 ? (netProfit >= 0 ? C.greenBg : C.redBg) : C.amberBg, tip: earnedRevenue > 0 ? "Net Profit = Gross Profit + Other Income - Operating Expenses." : "Projected only — no completed orders yet. Expenses minus forecast revenue.", sub: earnedRevenue > 0 ? `${profitMargin}% margin` : "forecast only" },
                  { label: "Avg Order Value",  value: `TT$${avgOrderValue}`,   color: C.charcoal, bg: C.cream, tip: "Average value of completed orders in this period.", sub: "per completed order" },
                ].map(c => (
                  <div key={c.label} className="acct-card" style={{ backgroundColor: c.bg, borderRadius: "6px", border: `1px solid ${c.color}33`, padding: "18px", animation: "fadeUp 0.5s ease both" }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
                      <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>{c.label}</p>
                      <Tip text={c.tip} />
                    </div>
                    <p style={{ fontFamily: FD, fontSize: "22px", color: c.color, marginBottom: "4px" }}>{c.value}</p>
                    <p style={{ fontSize: "11px", color: C.muted }}>{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Week by week breakdown */}
              <div className="acct-card" style={{ ...card(), marginBottom: "24px" }}>
                <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "16px" }}>Week by Week</p>
                {getBreakdownGroups().length === 0 ? (
                  <p style={{ color: C.muted, fontSize: "13px" }}>No data yet</p>
                ) : (
                  <div>
                    {getBreakdownGroups().map(([key, g], idx) => {
                      const net = g.earnedRevenue - g.expenses;
                      const d = new Date(key);
                      const end = new Date(d); end.setDate(d.getDate() + 6);
                      const label = `${d.toLocaleDateString("en-TT", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-TT", { month: "short", day: "numeric", year: "numeric" })}`;
                      return (
                        <div key={key} style={{ padding: "14px 0", borderBottom: idx < getBreakdownGroups().length - 1 ? `1px solid ${C.border}` : "none", display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center" }}>
                          <div>
                            <p style={{ fontFamily: FD, fontSize: "14px", color: C.black, marginBottom: "4px" }}>{label}</p>
                            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const }}>
                              <span style={{ fontSize: "11px", color: C.muted }}>Revenue: <strong style={{ color: C.green }}>TT${g.earnedRevenue}</strong> ({g.orders} orders)</span>
                              <span style={{ fontSize: "11px", color: C.muted }}>COGS: <strong style={{ color: C.red }}>TT${g.cogs}</strong></span>
                              <span style={{ fontSize: "11px", color: C.muted }}>OpEx: <strong style={{ color: C.red }}>TT${g.opEx}</strong></span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" as const }}>
                            <p style={{ fontFamily: FD, fontSize: "18px", color: net >= 0 ? C.green : C.red }}>{net >= 0 ? "+" : ""}TT${net}</p>
                            <p style={{ fontSize: "10px", color: C.muted }}>{net >= 0 ? "profit" : "loss"}</p>
                          </div>
                        </div>
                      );
                    })}
                    {/* Running total */}
                    {(() => {
                      const groups = getBreakdownGroups();
                      const totalRev = groups.reduce((s, [,g]) => s + g.earnedRevenue, 0);
                      const totalExp = groups.reduce((s, [,g]) => s + g.expenses, 0);
                      const totalNet = totalRev - totalExp;
                      return (
                        <div style={{ padding: "14px 16px", backgroundColor: C.black, borderRadius: "4px", marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: "4px" }}>Total — {getPeriodLabel()} ({groups.length} week{groups.length !== 1 ? "s" : ""})</p>
                            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>Revenue: TT${totalRev} · Expenses: TT${totalExp}</p>
                          </div>
                          <p style={{ fontFamily: FD, fontSize: "22px", color: totalNet >= 0 ? "#8FD4A0" : "#F5C6C6" }}>{totalNet >= 0 ? "+" : ""}TT${totalNet}</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Payment breakdown */}
              <div className="acct-card" style={{ ...card(), marginBottom: "24px" }}>
                <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "16px" }}>Payment Breakdown — {getPeriodLabel()}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                  {[
                    { label: "Bank Transfer", orders: bankOrders, color: "#1A56A4", bg: "#EBF3FF", border: "#B8D4F5" },
                    { label: "Cash on Delivery", orders: cashOrders, color: C.green, bg: C.greenBg, border: C.greenBorder },
                    { label: "Unclassified", orders: unclassified, color: C.amber, bg: C.amberBg, border: C.amberBorder },
                  ].map(g => (
                    <div key={g.label} style={{ backgroundColor: g.bg, border: `1px solid ${g.border}`, borderRadius: "6px", padding: "16px" }}>
                      <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: g.color, marginBottom: "10px" }}>{g.label}</p>
                      <p style={{ fontFamily: FD, fontSize: "24px", color: g.color, marginBottom: "4px" }}>TT${g.orders.reduce((s, o) => s + o.total, 0)}</p>
                      <p style={{ fontSize: "11px", color: g.color, opacity: 0.7, marginBottom: g.orders.length > 0 ? "10px" : "0" }}>{g.orders.length} order{g.orders.length !== 1 ? "s" : ""}</p>
                      {g.orders.map(o => (
                        <div key={o.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "4px 0", borderTop: `1px solid ${g.border}` }}>
                          <span style={{ color: g.color }}>{o.name}</span>
                          <span style={{ fontWeight: "700", color: g.color }}>TT${o.total}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {unassignedOrders.length > 0 && (
                <div style={{ marginTop: "12px", padding: "12px 16px", backgroundColor: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: "4px", fontSize: "12px", color: C.red }}>
                  ⚠️ {unassignedOrders.length} order{unassignedOrders.length !== 1 ? "s" : ""} have no fulfilment date and are excluded from period totals: {unassignedOrders.map(o => `${o.name} (TT$${o.total})`).join(", ")}. Edit these orders in Admin to assign a day.
                </div>
              )}
              {unclassified.length > 0 && (
                  <div style={{ marginTop: "12px", padding: "12px 16px", backgroundColor: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: "4px", fontSize: "12px", color: C.amber }}>
                    ⚠️ {unclassified.length} completed order{unclassified.length !== 1 ? "s" : ""} {unclassified.length === 1 ? "has" : "have"} no payment method recorded. Please edit these orders to add a payment method.
                  </div>
                )}
              </div>

              {/* Reconciliation panel */}
              <div className="acct-card" style={{ ...card() }}>
                <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "16px" }}>Reconciliation Summary</p>
                <div style={{ display: "grid", gap: "8px" }}>
                  {[
                    { label: "Period",                   value: getPeriodLabel(),                                                       color: C.gold },
                    { label: "Completed Orders (Period)",value: periodCompletedOrders.length,                                         color: C.green },
                    { label: "Earned Revenue (Period)",  value: `TT$${earnedRevenue}`,                                                color: C.green },
                    { label: "Expected Orders (Period)", value: periodExpectedOrders.length,                                          color: C.amber },
                    { label: "Expected Revenue (Period)",value: `TT$${expectedRevenue}`,                                             color: C.amber },
                    { label: "Cancelled (All Time)",     value: cancelledOrders.length,                                              color: C.red },
                    { label: "Unassigned (No Date)",     value: unassignedOrders.length,                                             color: C.red },
                    { label: "Bank Transfer (Period)",   value: `TT$${bankOrders.reduce((s,o)=>s+o.total,0)} (${bankOrders.length})`, color: "#1A56A4" },
                    { label: "Cash (Period)",            value: `TT$${cashOrders.reduce((s,o)=>s+o.total,0)} (${cashOrders.length})`, color: C.green },
                    { label: "Unclassified (Period)",    value: `TT$${unclassified.reduce((s,o)=>s+o.total,0)} (${unclassified.length})`, color: C.amber },
                    { label: "Bank + Cash + Unclassified",value: `TT$${paymentBase.reduce((s,o)=>s+o.total,0)} (should = TT$${earnedRevenue})`, color: paymentBase.reduce((s,o)=>s+o.total,0) === earnedRevenue ? C.green : C.red },
                  ].map(r => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: "13px" }}>
                      <span style={{ color: C.muted }}>{r.label}</span>
                      <span style={{ fontWeight: "700", color: r.color }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PROFIT & LOSS ── */}
          {activeTab === "pl" && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em", color: C.gold, marginBottom: "20px", textTransform: "uppercase" as const }}>Profit & Loss — {getPeriodLabel()}</p>
              <div className="acct-card" style={{ ...card() }}>
                {[
                  { label: "Earned Revenue",     value: earnedRevenue,   color: C.green,    indent: false, tip: "Completed orders only, by fulfilment date." },
                  { label: "Cost of Goods Sold", value: -cogs,           color: C.red,      indent: true,  tip: "Ingredients + Packaging costs." },
                  { label: "Gross Profit",       value: grossProfit,     color: grossProfit >= 0 ? C.green : C.red, indent: false, tip: "Earned Revenue - COGS.", bold: true },
                  { label: "Other Income",       value: otherIncome,     color: C.green,    indent: true,  tip: "Manual income entries." },
                  { label: "Operating Expenses", value: -opExpenses,     color: C.red,      indent: true,  tip: "Gas, marketing, equipment, etc." },
                  { label: "Net Profit",         value: netProfit,       color: netProfit >= 0 ? C.green : C.red, indent: false, tip: "Gross Profit + Other Income - Operating Expenses.", bold: true },
                  { label: "Profit Margin",      value: profitMargin + "%", color: netProfit >= 0 ? C.green : C.red, indent: false, tip: "Net Profit / Earned Revenue × 100.", isString: true },
                ].map((r, i) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: i < 6 ? `1px solid ${C.border}` : "none", paddingLeft: r.indent ? "16px" : "0" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <p style={{ fontSize: r.bold ? "15px" : "13px", fontWeight: r.bold ? "700" : "400", color: C.charcoal }}>{r.label}</p>
                      <Tip text={r.tip} />
                    </div>
                    <p style={{ fontFamily: r.bold ? FD : FB, fontSize: r.bold ? "20px" : "14px", fontWeight: "700", color: r.color }}>
                      {r.isString ? r.value : `${typeof r.value === "number" && r.value > 0 ? "+" : ""}TT$${r.value}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CASH FLOW ── */}
          {activeTab === "cashflow" && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em", color: C.gold, marginBottom: "20px", textTransform: "uppercase" as const }}>Cash Flow — {getPeriodLabel()}</p>
              {(() => {
                const cashIn  = earnedRevenue + otherIncome;
                const cashOut = totalExpenses;
                const netCash = cashIn - cashOut;
                return (
                  <div className="acct-card" style={{ ...card() }}>
                    {[
                      { label: "Money Received (Completed Orders)", value: earnedRevenue,  color: C.green, tip: "Cash received from completed orders." },
                      { label: "Other Income Received",             value: otherIncome,    color: C.green, tip: "Other manual income entries." },
                      { label: "Total Cash In",                     value: cashIn,         color: C.green, bold: true, tip: "Total money coming into the business." },
                      { label: "Cost of Goods (Cash Out)",          value: -cogs,          color: C.red,   tip: "Ingredients and packaging paid for." },
                      { label: "Operating Expenses (Cash Out)",     value: -opExpenses,    color: C.red,   tip: "Other expenses paid." },
                      { label: "Total Cash Out",                    value: -cashOut,       color: C.red,   bold: true, tip: "Total money going out of the business." },
                      { label: "Net Cash Movement",                 value: netCash,        color: netCash >= 0 ? C.green : C.red, bold: true, tip: "Cash In minus Cash Out for this period." },
                    ].map((r, i) => (
                      <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: i < 6 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <p style={{ fontSize: r.bold ? "15px" : "13px", fontWeight: r.bold ? "700" : "400", color: C.charcoal }}>{r.label}</p>
                          <Tip text={r.tip} />
                        </div>
                        <p style={{ fontFamily: r.bold ? FD : FB, fontSize: r.bold ? "20px" : "14px", fontWeight: "700", color: r.color }}>
                          {`${typeof r.value === "number" && r.value > 0 ? "+" : ""}TT$${r.value}`}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── TRANSACTIONS ── */}
          {activeTab === "transactions" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em", color: C.gold, textTransform: "uppercase" as const }}>All Transactions</p>
                <button onClick={() => setActiveTab("receipts" as any)} style={{ ...goldBtn, padding: "8px 16px", fontSize: "10px" }}>+ Add Entry</button>
              </div>
              {loading ? <p style={{ color: C.muted, textAlign: "center" as const, padding: "40px" }}>Loading...</p> : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {transactions.map(t => (
                    <div key={t.id} style={{ backgroundColor: C.white, borderRadius: "4px", border: editId === t.id ? `1px solid ${C.gold}` : `1px solid ${C.border}`, padding: "16px 20px" }}>
                      {editId === t.id ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {(["income","expense","equity"] as TxType[]).map(tp => (
                              <button key={tp} onClick={() => setEditType(tp)} style={{ flex: 1, padding: "8px", borderRadius: "4px", border: editType === tp ? `2px solid ${C.gold}` : `1px solid ${C.border}`, backgroundColor: editType === tp ? C.goldDim : "transparent", cursor: "pointer", fontFamily: FB, fontSize: "11px", color: editType === tp ? C.gold : C.muted, fontWeight: editType === tp ? "700" : "400" }}>{tp}</button>
                            ))}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            <select value={editCat} onChange={e => setEditCat(e.target.value)} style={inputStyle}>
                              {(editType === "income" ? INCOME_CATS : editType === "equity" ? EQUITY_CATS : EXPENSE_CATS).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
                          </div>
                          <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" style={inputStyle} />
                          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={inputStyle} />
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={saveEdit} style={goldBtn}>Save</button>
                            <button onClick={() => setEditId(null)} style={{ backgroundColor: "transparent", color: C.muted, padding: "9px 16px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FB, fontSize: "11px", cursor: "pointer" }}>Cancel</button>
                            <button onClick={() => deleteTransaction(t.id)} style={{ backgroundColor: "transparent", color: C.red, padding: "9px 16px", borderRadius: "4px", border: `1px solid ${C.redBorder}`, fontFamily: FB, fontSize: "11px", cursor: "pointer", marginLeft: "auto" }}>🗑 Delete</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" as const }}>
                          <span style={{ backgroundColor: t.type === "income" ? C.greenBg : t.type === "equity" ? C.amberBg : C.redBg, color: t.type === "income" ? C.green : t.type === "equity" ? C.amber : C.red, fontSize: "9px", fontWeight: "700", letterSpacing: "0.08em", padding: "3px 10px", borderRadius: "20px", whiteSpace: "nowrap" as const, textTransform: "uppercase" as const }}>{t.type}</span>
                          <div style={{ flex: 1, minWidth: "120px" }}>
                            <p style={{ fontWeight: "600", fontSize: "13px", color: C.black }}>{t.category}</p>
                            {t.description && <p style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{t.description}</p>}
                            {t.supplier && <p style={{ fontSize: "10px", color: C.muted }}>📦 {t.supplier}</p>}
                          </div>
                          <p style={{ fontSize: "11px", color: C.muted, whiteSpace: "nowrap" as const }}>{new Date(t.date).toLocaleDateString("en-TT", { month: "short", day: "numeric", year: "numeric" })}</p>
                          <p style={{ fontFamily: FD, fontSize: "16px", color: t.type === "income" ? C.green : C.red, whiteSpace: "nowrap" as const }}>
                            {t.type === "income" ? "+" : "-"}TT${t.amount}
                          </p>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button onClick={() => startEdit(t)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "4px", cursor: "pointer", color: C.muted, fontSize: "11px", padding: "4px 10px", fontFamily: FB }}>✏️</button>
                            <button onClick={() => deleteTransaction(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: "16px", padding: "4px" }}>🗑</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {transactions.length === 0 && <p style={{ color: C.muted, textAlign: "center" as const, padding: "40px" }}>No transactions yet</p>}
                </div>
              )}
            </div>
          )}

          {/* ── RECEIPTS ── */}
          {activeTab === "receipts" && (
            <div style={{ maxWidth: "640px" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
                <button style={tabBtn(receiptTab === "scan")}   onClick={() => setReceiptTab("scan")}>📷 Scan Receipt</button>
                <button style={tabBtn(receiptTab === "manual")} onClick={() => setReceiptTab("manual")}>✏️ Manual Entry</button>
              </div>

              {receiptTab === "scan" && (
                <div className="acct-card" style={card()}>
                  <p style={{ fontFamily: FD, fontSize: "20px", color: C.black, marginBottom: "8px" }}>Scan a Receipt</p>
                  <p style={{ fontSize: "12px", color: C.muted, marginBottom: "20px" }}>Claude AI will automatically extract all items, amounts and categories from your receipt photo.</p>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={labelSt}>Receipt Date</label>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} />
                  </div>
                  <label style={{ display: "block", border: `2px dashed ${C.border}`, borderRadius: "6px", padding: "40px 20px", textAlign: "center" as const, cursor: "pointer", backgroundColor: "#FAFAF8", marginBottom: "16px" }}>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) scanReceipt(f); }} />
                    {scanning ? (
                      <div><p style={{ fontSize: "32px", marginBottom: "8px" }}>🔍</p><p style={{ fontFamily: FD, fontSize: "16px", color: C.black, marginBottom: "4px" }}>Reading receipt...</p><p style={{ fontSize: "12px", color: C.muted }}>Claude AI is extracting the items</p></div>
                    ) : (
                      <div><p style={{ fontSize: "40px", marginBottom: "8px" }}>📷</p><p style={{ fontFamily: FD, fontSize: "16px", color: C.black, marginBottom: "4px" }}>Tap to upload receipt photo</p><p style={{ fontSize: "12px", color: C.muted }}>JPG, PNG or HEIC — take a clear photo of the full receipt</p></div>
                    )}
                  </label>
                  {scanError && <div style={{ backgroundColor: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: "4px", padding: "14px", fontSize: "13px", color: C.red, marginBottom: "16px" }}>{scanError}</div>}
                  {scanResult && (
                    <div>
                      <div style={{ backgroundColor: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "4px", padding: "16px 20px", marginBottom: "16px" }}>
                        <p style={{ fontSize: "11px", fontWeight: "700", color: C.green, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: "12px" }}>Receipt Scanned!</p>
                        {scanResult.supplier && <p style={{ fontSize: "12px", color: C.muted, marginBottom: "8px" }}>📦 {scanResult.supplier}</p>}
                        {scanResult.items.map((item: any, i: number) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.greenBorder}`, fontSize: "13px" }}>
                            <div><p style={{ fontWeight: "600", color: C.black }}>{item.description}</p><p style={{ fontSize: "11px", color: C.muted }}>{item.category}</p></div>
                            <p style={{ fontWeight: "700", color: C.red }}>TT${item.amount}</p>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "8px", borderTop: `1px solid ${C.greenBorder}` }}>
                          <p style={{ fontWeight: "700", color: C.black }}>Total</p>
                          <p style={{ fontFamily: FD, fontSize: "18px", color: C.red }}>TT${scanResult.total}</p>
                        </div>
                      </div>
                      {saved ? (
                        <div style={{ backgroundColor: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "4px", padding: "14px", fontSize: "13px", color: C.green, textAlign: "center" as const }}>✅ All items saved!</div>
                      ) : (
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button onClick={saveScanResult} disabled={saving} style={{ ...goldBtn, flex: 1, padding: "12px", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save All to Accounts"}</button>
                          <button onClick={() => setScanResult(null)} style={{ padding: "12px 20px", borderRadius: "4px", border: `1px solid ${C.border}`, backgroundColor: "transparent", fontFamily: FB, fontSize: "11px", cursor: "pointer", color: C.muted }}>Discard</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {receiptTab === "manual" && (
                <div className="acct-card" style={card()}>
                  <p style={{ fontFamily: FD, fontSize: "20px", color: C.black, marginBottom: "24px" }}>Add Transaction</p>
                  <div style={{ display: "grid", gap: "14px" }}>
                    <div>
                      <label style={labelSt}>Type *</label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {(["income","expense","equity"] as TxType[]).map(tp => (
                          <button key={tp} onClick={() => { setNewType(tp); setNewCat(""); }} style={{ flex: 1, padding: "10px", borderRadius: "4px", border: newType === tp ? `1px solid ${C.gold}` : `1px solid ${C.border}`, backgroundColor: newType === tp ? C.goldDim : "transparent", cursor: "pointer", fontFamily: FB, fontSize: "11px", fontWeight: newType === tp ? "700" : "400", color: newType === tp ? C.gold : C.muted, textTransform: "capitalize" as const }}>{tp}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={labelSt}>Category *</label>
                      <select value={newCat} onChange={e => setNewCat(e.target.value)} style={inputStyle}>
                        <option value="">Select...</option>
                        {(newType === "income" ? INCOME_CATS : newType === "equity" ? EQUITY_CATS : EXPENSE_CATS).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div><label style={labelSt}>Amount (TT$) *</label><input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0" style={inputStyle} /></div>
                      <div><label style={labelSt}>Date *</label><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div><label style={labelSt}>Description</label><input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="e.g. Shrimp from Hi-Lo" style={inputStyle} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div><label style={labelSt}>Supplier</label><input type="text" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder="Store name" style={inputStyle} /></div>
                      <div><label style={labelSt}>Payment Method</label>
                        <select value={newPMethod} onChange={e => setNewPMethod(e.target.value)} style={inputStyle}>
                          <option value="">Select...</option>
                          {["Cash","Bank Transfer","Card","Other"].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <div><label style={labelSt}>Notes</label><textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2} placeholder="Any additional notes..." style={{ ...inputStyle, resize: "vertical" }} /></div>
                    {saved && <div style={{ backgroundColor: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "4px", padding: "12px", fontSize: "13px", color: C.green }}>✅ Transaction saved!</div>}
                    <button onClick={addTransaction} disabled={saving} style={{ ...goldBtn, width: "100%", padding: "14px", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save Transaction"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PROFIT ALLOCATION ── */}
          {activeTab === "allocation" && (
            <div style={{ maxWidth: "560px" }}>
              <div className="acct-card" style={card()}>
                <p style={{ fontFamily: FD, fontSize: "22px", color: C.black, marginBottom: "8px" }}>Profit Allocation</p>
                <p style={{ fontSize: "12px", color: C.muted, marginBottom: "24px" }}>
                  Allocations are a distribution plan only — they are <strong>not</strong> additional business expenses and do not affect your P&L.
                </p>
                <div style={{ backgroundColor: C.goldDim, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "16px 20px", marginBottom: "24px" }}>
                  <p style={{ fontSize: "11px", color: C.muted, marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>Available to Allocate (Net Profit)</p>
                  <p style={{ fontFamily: FD, fontSize: "28px", color: netProfit >= 0 ? C.green : C.red }}>{netProfit >= 0 ? "+" : ""}TT${netProfit}</p>
                </div>
                {alloc.reduce((s, a) => s + a.pct, 0) !== 100 && (
                  <div style={{ backgroundColor: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: "4px", padding: "10px 14px", fontSize: "12px", color: C.red, marginBottom: "16px" }}>
                    ⚠️ Percentages must total 100% (currently {alloc.reduce((s, a) => s + a.pct, 0)}%)
                  </div>
                )}
                <div style={{ display: "grid", gap: "12px" }}>
                  {alloc.map((a, i) => (
                    <div key={a.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", backgroundColor: C.cream, borderRadius: "6px", border: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "13px", fontWeight: "600", color: C.black, marginBottom: "4px" }}>{a.label}</p>
                        <p style={{ fontFamily: FD, fontSize: "18px", color: C.gold }}>TT${Math.round(netProfit * a.pct / 100)}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input type="number" value={a.pct} min={0} max={100}
                          onChange={e => setAlloc(prev => prev.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) } : x))}
                          style={{ width: "60px", padding: "6px 8px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "13px", fontFamily: FB, textAlign: "center" as const }} />
                        <span style={{ fontSize: "13px", color: C.muted }}>%</span>
                        <button onClick={() => setAlloc(prev => prev.map((x, j) => j === i ? { ...x, distributed: !x.distributed } : x))}
                          style={{ padding: "6px 12px", borderRadius: "20px", border: "none", cursor: "pointer", fontFamily: FB, fontSize: "10px", fontWeight: "700", letterSpacing: "0.08em", backgroundColor: a.distributed ? C.greenBg : C.cream, color: a.distributed ? C.green : C.muted, textTransform: "uppercase" as const }}>
                          {a.distributed ? "Distributed" : "Planned"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── HEALTH CHECK ── */}
          {activeTab === "health" && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em", color: C.gold, marginBottom: "20px", textTransform: "uppercase" as const }}>Financial Health Check</p>
              {healthIssues.length === 0 ? (
                <div style={{ ...card(C.greenBorder), backgroundColor: C.greenBg, textAlign: "center" as const, padding: "48px" }}>
                  <p style={{ fontSize: "40px", marginBottom: "12px" }}>✅</p>
                  <p style={{ fontFamily: FD, fontSize: "20px", color: C.green, marginBottom: "8px" }}>All Clear!</p>
                  <p style={{ fontSize: "13px", color: C.muted }}>No issues found in your financial records.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {healthIssues.map((issue, i) => (
                    <div key={i} style={{ backgroundColor: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: "6px", padding: "14px 18px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "18px", flexShrink: 0 }}>⚠️</span>
                      <p style={{ fontSize: "13px", color: C.amber, lineHeight: 1.6 }}>{issue}</p>
                    </div>
                  ))}
                  <div style={{ backgroundColor: C.cream, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "14px 18px", fontSize: "12px", color: C.muted }}>
                    ℹ️ The health check is read-only. To fix an issue, edit the affected order or transaction directly. No records have been modified.
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </>
  );
}
