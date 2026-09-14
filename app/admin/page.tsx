"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

type OrderStatus = "new" | "confirmed" | "ready" | "completed" | "cancelled";
interface Order {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string | null;
  package: string;
  details: string[];
  fulfillment: "delivery" | "pickup";
  address?: string | null;
  notes?: string | null;
  total: number;
  status: OrderStatus;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; next: OrderStatus | null; nextLabel: string | null }> = {
  new:       { label: "New",       color: "#1A56A4", bg: "#EBF3FF", next: "confirmed", nextLabel: "Confirm Order"  },
  confirmed: { label: "Confirmed", color: "#6B3FA0", bg: "#F3ECFF", next: "ready",     nextLabel: "Mark Ready"     },
  ready:     { label: "Ready",     color: "#B8600A", bg: "#FFF8EC", next: "completed", nextLabel: "Mark Completed" },
  completed: { label: "Completed", color: "#1A7A3A", bg: "#EAFFF0", next: null,        nextLabel: null             },
  cancelled: { label: "Cancelled", color: "#A03030", bg: "#FFECEC", next: null,        nextLabel: null             },
};

const C = {
  cream: "#FAF8F3", white: "#FFFFFF", gold: "#C4952A", goldDim: "rgba(196,149,42,0.12)",
  black: "#0A0A0A", charcoal: "#1C1C1C", muted: "#6B6560", border: "rgba(196,149,42,0.2)",
};
const FONT_DISPLAY = `'Cinzel', serif`;
const FONT_BODY    = `'Inter', sans-serif`;
const GOOGLE_FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap');`;
const PASSWORD     = "anderson56$";

export default function AdminPage() {
  const [authed,         setAuthed]         = useState(false);
  const [pwInput,        setPwInput]        = useState("");
  const [pwError,        setPwError]        = useState(false);
  const [orders,         setOrders]         = useState<Order[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [filter,         setFilter]         = useState<"all" | OrderStatus>("all");
  const [search,         setSearch]         = useState("");
  const [expanded,       setExpanded]       = useState<string | null>(null);

  // Edit state
  const [editingOrder,   setEditingOrder]   = useState<string | null>(null);
  const [editName,       setEditName]       = useState("");
  const [editPhone,      setEditPhone]      = useState("");
  const [editEmail,      setEditEmail]      = useState("");
  const [editAddress,    setEditAddress]    = useState("");
  const [editArea,       setEditArea]       = useState("");
  const [editNotes,      setEditNotes]      = useState("");
  const [editTotal,      setEditTotal]      = useState("");
  const [editFulfill,    setEditFulfill]    = useState<"delivery" | "pickup">("pickup");
  const [editPayMethod,  setEditPayMethod]  = useState("");
  const [editOrderDay,   setEditOrderDay]   = useState("");
  const [editStatus,     setEditStatus]     = useState<OrderStatus>("new");
  const [editSaving,     setEditSaving]     = useState(false);
  const [editSaved,      setEditSaved]      = useState(false);
  const [showEditConfirm,setShowEditConfirm]= useState(false);
  const [editBefore,     setEditBefore]     = useState<Partial<Order> | null>(null);

  // Quick expenditure
  const [quickExpDesc,   setQuickExpDesc]   = useState("");
  const [quickExpAmount, setQuickExpAmount] = useState("");
  const [quickExpCat,    setQuickExpCat]    = useState("Ingredients");
  const [quickExpSaving, setQuickExpSaving] = useState(false);
  const [quickExpSaved,  setQuickExpSaved]  = useState(false);

  // Settings
  const [ordersOpen,     setOrdersOpen]     = useState(true);
  const [menuItems,      setMenuItems]      = useState<Record<string, boolean>>({
    menu_solo_shrimp: true, menu_solo_crab: true, menu_solo_mix: true,
    menu_duo_shrimp: true,  menu_duo_crab: true,  menu_duo_mix: true,
    menu_ramen: true, menu_wings: true, menu_sauce: true, menu_build: true, menu_combo: true,
  });
  const [favItems,       setFavItems]       = useState<Record<string, boolean>>({
    fav_solo_shrimp: false, fav_solo_crab: false, fav_solo_mix: false,
    fav_duo_shrimp: false,  fav_duo_crab: false,  fav_duo_mix: false,
    fav_ramen: false, fav_wings: false, fav_sauce: false, fav_build: false, fav_combo: false,
  });
  const [openDays,       setOpenDays]       = useState({ thursday: true, friday: true, saturday: false });
  const [settingsLoading,setSettingsLoading]= useState(false);
  const [settingsSaved,  setSettingsSaved]  = useState(false);

  // Reviews
  const [pendingReviews, setPendingReviews] = useState<{id: string, name: string, rating: number, comment: string, created_at: string}[]>([]);

  // Revenue history
  const [revenueHistory, setRevenueHistory] = useState<{week: string, revenue: number, orders: number}[]>([]);
  const [markingComplete,setMarkingComplete]= useState(false);

  useEffect(() => {
    if (authed) { fetchOrders(); fetchSettings(); fetchReviews(); loadRevenueHistory(); }
  }, [authed]);

  function loadRevenueHistory() {
    const saved = localStorage.getItem("revenue_history");
    if (saved) setRevenueHistory(JSON.parse(saved));
  }

  async function fetchSettings() {
    const { data } = await supabase.from("settings").select("*");
    if (data) {
      const ordersOpenRow = data.find(r => r.key === "orders_open");
      if (ordersOpenRow) setOrdersOpen(ordersOpenRow.value === "true");
      const menuState: Record<string, boolean> = {};
      data.filter(r => r.key.startsWith("menu_")).forEach(r => { menuState[r.key] = r.value === "true"; });
      if (Object.keys(menuState).length > 0) setMenuItems(prev => ({ ...prev, ...menuState }));
      const favState: Record<string, boolean> = {};
      data.filter(r => r.key.startsWith("fav_")).forEach(r => { favState[r.key] = r.value === "true"; });
      if (Object.keys(favState).length > 0) setFavItems(prev => ({ ...prev, ...favState }));
      const thu = data.find(r => r.key === "day_thursday");
      const fri = data.find(r => r.key === "day_friday");
      const sat = data.find(r => r.key === "day_saturday");
      setOpenDays({
        thursday: thu ? thu.value === "true" : true,
        friday:   fri ? fri.value === "true" : true,
        saturday: sat ? sat.value === "true" : false,
      });
    }
  }

  async function saveSettings() {
    setSettingsLoading(true);
    const updates = [
      { key: "orders_open",   value: String(ordersOpen) },
      ...Object.entries(menuItems).map(([key, value]) => ({ key, value: String(value) })),
      ...Object.entries(favItems).map(([key, value]) => ({ key, value: String(value) })),
      { key: "day_thursday",  value: String(openDays.thursday) },
      { key: "day_friday",    value: String(openDays.friday)   },
      { key: "day_saturday",  value: String(openDays.saturday) },
    ];
    for (const u of updates) {
      await supabase.from("settings").upsert({ key: u.key, value: u.value }, { onConflict: "key" });
    }
    setSettingsLoading(false); setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  }

  async function fetchReviews() {
    const { data } = await supabase.from("reviews").select("*").eq("approved", false).order("created_at", { ascending: false });
    if (data) setPendingReviews(data);
  }
  async function approveReview(id: string) {
    await supabase.from("reviews").update({ approved: true }).eq("id", id);
    setPendingReviews(prev => prev.filter(r => r.id !== id));
  }
  async function deleteReview(id: string) {
    await supabase.from("reviews").delete().eq("id", id);
    setPendingReviews(prev => prev.filter(r => r.id !== id));
  }

  async function fetchOrders() {
    setLoading(true);
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
    setLoading(false);
  }

  async function advanceStatus(id: string, currentStatus: OrderStatus) {
    const next = STATUS_CONFIG[currentStatus].next;
    if (!next) return;
    await supabase.from("orders").update({ status: next }).eq("id", id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
  }

  async function deleteOrder(id: string) {
    if (!window.confirm("Delete this order permanently?")) return;
    await supabase.from("orders").delete().eq("id", id);
    setOrders(prev => prev.filter(o => o.id !== id));
  }

  function startEdit(order: Order) {
    setEditingOrder(order.id);
    setEditBefore({ ...order });
    setEditName(order.name);
    setEditPhone(order.phone);
    setEditEmail(order.email || "");
    setEditAddress(order.address || "");
    setEditNotes(order.notes || "");
    setEditTotal(String(order.total));
    setEditFulfill(order.fulfillment);
    setEditStatus(order.status);
    const pm = (order.notes || "").includes("online_payment") || (order.notes || "").includes("Bank Transfer") ? "online_payment" : "cash_on_delivery";
    setEditPayMethod(pm);
    const dm = (order.notes || "").match(/Day:\s*(\w+)/);
    setEditOrderDay(dm ? dm[1] : "");
    const am = (order.notes || "").match(/Area:\s*([^\n]+)/);
    setEditArea(am ? am[1].trim() : "");
    setShowEditConfirm(false);
    setEditSaved(false);
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    const noteParts = [];
    if (editPayMethod) noteParts.push(`Payment: ${editPayMethod}`);
    if (editOrderDay)  noteParts.push(`Day: ${editOrderDay}`);
    if (editArea && editFulfill === "delivery") noteParts.push(`Area: ${editArea}`);
    if (editNotes.trim()) noteParts.push(editNotes.trim());
    const newNotes = noteParts.join("\n") || null;
    await supabase.from("orders").update({
      name: editName.trim(), phone: editPhone.trim(),
      email: editEmail.trim() || null,
      address: editFulfill === "delivery" ? editAddress.trim() : null,
      notes: newNotes, total: Number(editTotal),
      fulfillment: editFulfill, status: editStatus,
    }).eq("id", id);
    setOrders(prev => prev.map(o => o.id === id ? {
      ...o, name: editName.trim(), phone: editPhone.trim(),
      email: editEmail.trim() || null,
      address: editFulfill === "delivery" ? editAddress.trim() : null,
      notes: newNotes, total: Number(editTotal),
      fulfillment: editFulfill, status: editStatus,
    } : o));
    setEditSaving(false); setEditSaved(true); setShowEditConfirm(false); setEditBefore(null);
    setTimeout(() => { setEditingOrder(null); setEditSaved(false); }, 1500);
  }

  async function addQuickExpenditure() {
    if (!quickExpAmount || isNaN(Number(quickExpAmount))) { alert("Please enter a valid amount."); return; }
    setQuickExpSaving(true);
    await supabase.from("accounts").insert({
      type: "expense", category: quickExpCat,
      description: quickExpDesc.trim() || null,
      amount: Math.round(Number(quickExpAmount)),
      date: new Date().toISOString().split("T")[0],
    });
    setQuickExpSaving(false); setQuickExpSaved(true);
    setQuickExpDesc(""); setQuickExpAmount(""); setQuickExpCat("Ingredients");
    setTimeout(() => setQuickExpSaved(false), 3000);
  }

  function getPaymentMethod(order: Order): "online" | "cash" | "unclassified" {
    const n = order.notes || "";
    if (n.includes("online_payment") || n.includes("Bank Transfer") || n.includes("Online")) return "online";
    if (n.includes("cash_on_delivery") || n.includes("Cash on Delivery")) return "cash";
    return "unclassified";
  }

  function getFulfilmentDate(order: Order): string | null {
    if (!order.notes) return null;
    const m = order.notes.match(/Day:\s*(Thursday|Friday|Saturday)/i);
    if (!m) return null;
    const baseTT = new Date(new Date(order.created_at).toLocaleString("en-US", { timeZone: "America/Port_of_Spain" }));
    const dayMap: Record<string, number> = { thursday: 4, friday: 5, saturday: 6 };
    const target = dayMap[m[1].toLowerCase()];
    let diff = target - baseTT.getDay();
    if (diff < 0) diff += 7;
    const result = new Date(baseTT);
    result.setDate(baseTT.getDate() + diff);
    return result.toISOString().split("T")[0];
  }

  function exportToPDF() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const prepOrders = orders.filter(o => ["new","confirmed","ready"].includes(o.status));
    const revenue = prepOrders.reduce((s, o) => s + o.total, 0);
    printWindow.document.write(`<!DOCTYPE html><html><head><title>The Club Boils - Orders</title>
    <style>body{font-family:Arial,sans-serif;padding:20px}h1{font-size:24px}.order{border:1px solid #ddd;padding:16px;margin-bottom:12px;border-radius:4px}.summary{background:#f5f5f5;padding:12px;margin-bottom:20px;border-radius:4px}</style></head><body>
    <h1>♣ The Club Boils — Order List</h1><p>${new Date().toLocaleDateString("en-TT")}</p>
    <div class="summary"><strong>${prepOrders.length} Active Orders</strong> · TT$${revenue} · ${prepOrders.filter(o=>o.fulfillment==="delivery").length} deliveries · ${prepOrders.filter(o=>o.fulfillment==="pickup").length} pickups</div>
    ${prepOrders.map((o,i)=>`<div class="order"><strong>${i+1}. ${o.name}</strong> · ${o.phone}<br/>${o.package}<br/>${(o.details||[]).join(", ")}<br/>${o.fulfillment==="delivery"?`🚗 ${o.address}`:"🏠 Pickup"} · TT$${o.total}${o.notes?`<br/><em>${o.notes}</em>`:""}</div>`).join("")}
    </body></html>`);
    printWindow.document.close(); printWindow.print();
  }

  function exportFinancialsPDF() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const completedOrders = orders.filter(o => o.status === "completed");
    const revenue = completedOrders.reduce((s, o) => s + o.total, 0);
    const bankTotal = completedOrders.filter(o => getPaymentMethod(o) === "online").reduce((s,o)=>s+o.total,0);
    const cashTotal = completedOrders.filter(o => getPaymentMethod(o) === "cash").reduce((s,o)=>s+o.total,0);
    printWindow.document.write(`<!DOCTYPE html><html><head><title>The Club Boils - Financial Report</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;max-width:600px;margin:0 auto}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee}</style></head><body>
    <h1>♣ The Club Boils — Financial Report</h1><p>${new Date().toLocaleDateString("en-TT", {weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
    <div class="row"><span>Completed Orders</span><strong>${completedOrders.length}</strong></div>
    <div class="row"><span>Total Revenue</span><strong style="color:#B8922A">TT$${revenue}</strong></div>
    <div class="row"><span>Online/Bank Transfer</span><strong>TT$${bankTotal}</strong></div>
    <div class="row"><span>Cash on Delivery</span><strong>TT$${cashTotal}</strong></div>
    </body></html>`);
    printWindow.document.close(); printWindow.print();
  }

  async function markAllComplete() {
    if (!window.confirm("Mark all active orders as completed?")) return;
    setMarkingComplete(true);
    const activeIds = orders.filter(o => ["new","confirmed","ready"].includes(o.status)).map(o => o.id);
    for (const id of activeIds) {
      await supabase.from("orders").update({ status: "completed" }).eq("id", id);
    }
    const weekRevenue = orders.filter(o => activeIds.includes(o.id)).reduce((s,o)=>s+o.total,0);
    const weekLabel = new Date().toLocaleDateString("en-TT", { month: "short", day: "numeric", year: "numeric" });
    const newEntry = { week: weekLabel, revenue: weekRevenue, orders: activeIds.length };
    const newHistory = [newEntry, ...revenueHistory.slice(0, 11)];
    setRevenueHistory(newHistory);
    localStorage.setItem("revenue_history", JSON.stringify(newHistory));
    setOrders(prev => prev.map(o => activeIds.includes(o.id) ? { ...o, status: "completed" as OrderStatus } : o));
    setMarkingComplete(false);
  }

  // ── Computed ──────────────────────────────────────────────
  const completedOrders = orders.filter(o => o.status === "completed");
  const prepOrders      = orders.filter(o => ["new","confirmed","ready"].includes(o.status));
  const pendingCount    = prepOrders.length;

  // This week revenue
  const thisWeekRevenue = (() => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Port_of_Spain" }));
    const dow = now.getDay(); const daysBack = dow === 0 ? 6 : dow - 1;
    const wStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, 0, 0, 0);
    const wEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack + 6, 23, 59, 59);
    return completedOrders.filter(o => {
      const fd = getFulfilmentDate(o); if (!fd) return false;
      const d = new Date(fd + "T12:00:00-04:00"); return d >= wStart && d <= wEnd;
    }).reduce((s, o) => s + o.total, 0);
  })();

  const totalRevenue = completedOrders.reduce((s, o) => s + o.total, 0);
  const bankOrders   = completedOrders.filter(o => getPaymentMethod(o) === "online");
  const cashOrders   = completedOrders.filter(o => getPaymentMethod(o) === "cash");
  const unclassified = completedOrders.filter(o => getPaymentMethod(o) === "unclassified");

  const counts: Record<string, number> = {
    all: orders.length, new: 0, confirmed: 0, ready: 0, completed: 0, cancelled: 0,
  };
  orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });

  const filtered = orders.filter(o => {
    const matchFilter = filter === "all" || o.status === filter;
    const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.notes?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: "4px",
    border: `1px solid ${C.border}`, fontSize: "13px", fontFamily: FONT_BODY,
    boxSizing: "border-box" as const, backgroundColor: C.white,
  };

  // ── Login ──────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{`${GOOGLE_FONTS} * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <main style={{ backgroundColor: C.black, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, padding: "24px", position: "relative" as const, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: "600px", height: "400px", background: "radial-gradient(ellipse, rgba(196,149,42,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", borderRadius: "8px", border: `1px solid ${C.border}`, padding: "52px 44px", maxWidth: "420px", width: "100%", textAlign: "center" as const, animation: "fadeUp 0.6s ease both", boxShadow: "0 32px 64px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ color: C.gold, fontSize: "28px" }}>♣</span>
              <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: "22px", fontWeight: "600", color: C.white, letterSpacing: "0.06em" }}>THE CLUB BOILS</h1>
            </div>
            <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "40px" }}>Admin Dashboard</p>
            <div style={{ textAlign: "left" as const, marginBottom: "16px" }}>
              <label style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "8px" }}>Password</label>
              <input type="password" value={pwInput} onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                onKeyDown={e => e.key === "Enter" && (() => { if (pwInput === PASSWORD) { setAuthed(true); setPwError(false); } else setPwError(true); })()}
                placeholder="Enter password"
                style={{ ...inputStyle, backgroundColor: "rgba(255,255,255,0.05)", border: pwError ? "1px solid #C0392B" : `1px solid ${C.border}`, color: C.white }} />
              {pwError && <p style={{ color: "#C0392B", fontSize: "12px", marginTop: "6px" }}>Incorrect password.</p>}
            </div>
            <button onClick={() => { if (pwInput === PASSWORD) { setAuthed(true); setPwError(false); } else setPwError(true); }}
              style={{ background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, width: "100%", padding: "14px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "700", fontSize: "12px", letterSpacing: "0.12em", cursor: "pointer", textTransform: "uppercase" as const }}>
              Sign In
            </button>
          </div>
        </main>
      </>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <>
      <style>{`
        ${GOOGLE_FONTS}
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .admin-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .admin-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.1); transform: translateY(-1px); }
        .gold-btn { transition: all 0.2s ease; }
        .gold-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(196,149,42,0.35); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.gold}; border-radius: 2px; }
      `}</style>
      <main style={{ backgroundColor: C.cream, minHeight: "100vh", fontFamily: FONT_BODY, color: C.charcoal }}>

        {/* Header */}
        <header style={{ backgroundColor: C.black, padding: "0 clamp(16px,3vw,32px)", display: "flex", justifyContent: "space-between", alignItems: "center", height: "64px", position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: C.gold, fontSize: "20px" }}>♣</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: "16px", fontWeight: "600", color: C.white, letterSpacing: "0.06em" }}>THE CLUB BOILS</span>
            <span style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.16em", color: C.gold, textTransform: "uppercase" as const, backgroundColor: "rgba(196,149,42,0.15)", padding: "3px 10px", borderRadius: "20px" }}>Admin</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <a href="/accounts" style={{ border: `1px solid ${C.border}`, color: C.gold, padding: "7px 16px", borderRadius: "4px", fontSize: "11px", fontFamily: FONT_BODY, textDecoration: "none", letterSpacing: "0.06em", fontWeight: "600" }}>📊 Accounts</a>
            <button onClick={fetchOrders} style={{ backgroundColor: "transparent", border: `1px solid ${C.border}`, color: "rgba(255,255,255,0.5)", padding: "7px 16px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontFamily: FONT_BODY }}>↻ Refresh</button>
            <button onClick={() => setAuthed(false)} style={{ backgroundColor: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)", padding: "7px 16px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontFamily: FONT_BODY }}>Sign Out</button>
          </div>
        </header>

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px clamp(16px,3vw,24px)" }}>

          {/* Stats */}
          {(() => {
            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Port_of_Spain" }));
            const dow = now.getDay(); const daysBack = dow === 0 ? 6 : dow - 1;
            const wStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, 0, 0, 0);
            const wEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack + 6, 23, 59, 59);
            const thisWeekExpected = orders.filter(o => ["new","confirmed","ready"].includes(o.status)).filter(o => {
              const fd = getFulfilmentDate(o); if (!fd) return false;
              const d = new Date(fd + "T12:00:00-04:00"); return d >= wStart && d <= wEnd;
            }).reduce((s, o) => s + o.total, 0);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "32px" }}>
                {[
                  { label: "Total Orders",     value: orders.length,                 sub: "all statuses"   },
                  { label: "Pending",          value: pendingCount,                  sub: "need action"    },
                  { label: "This Week Earned", value: `TT$${thisWeekRevenue}`,       sub: thisWeekExpected > 0 ? `+ TT$${thisWeekExpected} expected` : "completed orders only" },
                ].map(stat => (
                  <div key={stat.label} className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "20px 22px", animation: "fadeUp 0.5s ease both" }}>
                    <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "8px" }}>{stat.label}</p>
                    <p style={{ fontFamily: FONT_DISPLAY, fontSize: "26px", color: C.black }}>{stat.value}</p>
                    <p style={{ fontSize: "11px", color: C.muted, marginTop: "4px" }}>{stat.sub}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Revenue Breakdown */}
          <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Revenue</p>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Completed Orders Only</h3>
            {(() => {
              const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Port_of_Spain" }));
              const dow = now.getDay(); const daysBack = dow === 0 ? 6 : dow - 1;
              const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, 0, 0, 0);
              const weekEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack + 6, 23, 59, 59);
              const lwStart   = new Date(weekStart); lwStart.setDate(weekStart.getDate() - 7);
              const lwEnd     = new Date(weekEnd);   lwEnd.setDate(weekEnd.getDate() - 7);
              const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
              const yearStart  = new Date(now.getFullYear(), 0, 1);
              const withFD = completedOrders.filter(o => getFulfilmentDate(o));
              const inWeek = (o: Order, s: Date, e: Date) => { const fd = getFulfilmentDate(o)!; const d = new Date(fd + "T12:00:00-04:00"); return d >= s && d <= e; };
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                  <div style={{ backgroundColor: "#EAFFF0", borderRadius: "6px", border: "1px solid #8FD4A0", padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>This Week</p>
                      <span>📅</span>
                    </div>
                    <p style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", color: "#1A7A3A", marginBottom: "2px" }}>TT${withFD.filter(o => inWeek(o, weekStart, weekEnd)).reduce((s,o)=>s+o.total,0)} earned</p>
                    <p style={{ fontSize: "11px", color: C.muted }}>{withFD.filter(o => inWeek(o, weekStart, weekEnd)).length} completed</p>
                  </div>
                  {[
                    { label: "Last Week",  rev: withFD.filter(o => inWeek(o, lwStart, lwEnd)).reduce((s,o)=>s+o.total,0),                                                     cnt: withFD.filter(o => inWeek(o, lwStart, lwEnd)).length,           icon: "📅" },
                    { label: "This Month", rev: withFD.filter(o => new Date(getFulfilmentDate(o)!+"T12:00:00-04:00") >= monthStart).reduce((s,o)=>s+o.total,0),               cnt: withFD.filter(o => new Date(getFulfilmentDate(o)!+"T12:00:00-04:00") >= monthStart).length, icon: "📆" },
                    { label: "This Year",  rev: withFD.filter(o => new Date(getFulfilmentDate(o)!+"T12:00:00-04:00") >= yearStart).reduce((s,o)=>s+o.total,0),                cnt: withFD.filter(o => new Date(getFulfilmentDate(o)!+"T12:00:00-04:00") >= yearStart).length,  icon: "🗓️" },
                    { label: "All Time",   rev: totalRevenue, cnt: completedOrders.length, icon: "💰" },
                  ].map(p => (
                    <div key={p.label} style={{ backgroundColor: C.cream, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                        <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>{p.label}</p>
                        <span style={{ fontSize: "18px" }}>{p.icon}</span>
                      </div>
                      <p style={{ fontFamily: FONT_DISPLAY, fontSize: "22px", color: C.gold, marginBottom: "4px" }}>TT${p.rev}</p>
                      <p style={{ fontSize: "11px", color: C.muted }}>{p.cnt} completed order{p.cnt !== 1 ? "s" : ""}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Payment Breakdown */}
          <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Payment Breakdown</p>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Bank Transfer vs Cash</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              {[
                { label: "Online/Bank",    orders: bankOrders,   color: "#1A56A4", bg: "#EBF3FF", border: "#B8D4F5" },
                { label: "Cash on Pickup", orders: cashOrders,   color: "#1A7A3A", bg: "#EAFFF0", border: "#8FD4A0" },
                { label: "Unclassified",   orders: unclassified, color: "#B8600A", bg: "#FFF8EC", border: "#F0C04A" },
              ].map(g => (
                <div key={g.label} style={{ backgroundColor: g.bg, border: `1px solid ${g.border}`, borderRadius: "6px", padding: "16px" }}>
                  <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: g.color, marginBottom: "8px" }}>{g.label}</p>
                  <p style={{ fontFamily: FONT_DISPLAY, fontSize: "22px", color: g.color, marginBottom: "4px" }}>TT${g.orders.reduce((s,o)=>s+o.total,0)}</p>
                  <p style={{ fontSize: "11px", color: g.color, opacity: 0.7 }}>{g.orders.length} orders</p>
                </div>
              ))}
            </div>
          </div>

          {/* Store Settings */}
          <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Store Settings</p>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Orders & Menu</h3>

            {/* Orders Open Toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", backgroundColor: ordersOpen ? "#EAFFF0" : "#FFECEC", borderRadius: "6px", border: `1px solid ${ordersOpen ? "#8FD4A0" : "#F5C6C6"}`, marginBottom: "20px", cursor: "pointer" }}
              onClick={() => setOrdersOpen(!ordersOpen)}>
              <div>
                <p style={{ fontWeight: "700", fontSize: "16px", color: ordersOpen ? "#1A7A3A" : "#A03030" }}>{ordersOpen ? "✅ Orders are OPEN" : "🔒 Orders are CLOSED"}</p>
                <p style={{ fontSize: "12px", color: ordersOpen ? "#1A7A3A" : "#A03030", marginTop: "2px" }}>Click to toggle</p>
              </div>
              <div style={{ width: "48px", height: "24px", borderRadius: "12px", backgroundColor: ordersOpen ? "#1A7A3A" : "#A03030", position: "relative" as const, transition: "background 0.3s" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: C.white, position: "absolute", top: "2px", left: ordersOpen ? "26px" : "2px", transition: "left 0.3s" }} />
              </div>
            </div>

            {/* Open Days */}
            <p style={{ fontFamily: FONT_BODY, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "10px" }}>Open Days</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "20px" }}>
              {([ { key: "thursday" as const, label: "Thursday" }, { key: "friday" as const, label: "Friday" }, { key: "saturday" as const, label: "Saturday" } ]).map(day => (
                <div key={day.key} onClick={() => setOpenDays(prev => ({ ...prev, [day.key]: !prev[day.key] }))}
                  style={{ padding: "16px", borderRadius: "4px", border: openDays[day.key] ? "2px solid #1A7A3A" : `1px solid ${C.border}`, cursor: "pointer", backgroundColor: openDays[day.key] ? "#EAFFF0" : "#FAFAFA", textAlign: "center" as const }}>
                  <p style={{ fontWeight: "700", fontSize: "14px", color: openDays[day.key] ? "#1A7A3A" : C.muted }}>{day.label}</p>
                  <p style={{ fontSize: "11px", marginTop: "4px", color: openDays[day.key] ? "#1A7A3A" : C.muted }}>{openDays[day.key] ? "✅ Open" : "🔒 Closed"}</p>
                </div>
              ))}
            </div>

            {/* Menu Items */}
            <p style={{ fontFamily: FONT_BODY, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "10px" }}>Menu Items</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
              {[
                { key: "menu_solo_shrimp", label: "Club Solo — Shrimp"      },
                { key: "menu_solo_crab",   label: "Club Solo — Snow Crab"   },
                { key: "menu_solo_mix",    label: "Club Solo — Mix"         },
                { key: "menu_duo_shrimp",  label: "Club Duo — Shrimp"       },
                { key: "menu_duo_crab",    label: "Club Duo — Snow Crab"    },
                { key: "menu_duo_mix",     label: "Club Duo — Mix"          },
                { key: "menu_ramen",       label: "Shrimp Alfredo Ramen"    },
                { key: "menu_wings",       label: "Wings Boil"              },
                { key: "menu_combo",       label: "Ramen Wings Combo"       },
                { key: "menu_sauce",       label: "Pepper Sauce"            },
                { key: "menu_build",       label: "Build Your Own Boil"     },
              ].map(item => (
                <div key={item.key} onClick={() => setMenuItems(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "4px", border: menuItems[item.key] ? `1px solid ${C.gold}` : `1px solid ${C.border}`, cursor: "pointer", backgroundColor: menuItems[item.key] ? C.goldDim : "#FAFAFA" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${menuItems[item.key] ? C.gold : C.border}`, backgroundColor: menuItems[item.key] ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {menuItems[item.key] && <span style={{ color: C.white, fontSize: "11px", fontWeight: "700" }}>✓</span>}
                  </div>
                  <span style={{ fontSize: "13px", color: menuItems[item.key] ? C.charcoal : C.muted }}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Fan Favourites */}
            <p style={{ fontFamily: FONT_BODY, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "10px" }}>Fan Favourites</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
              {[
                { key: "fav_solo_shrimp", label: "Solo — Shrimp"        },
                { key: "fav_solo_crab",   label: "Solo — Snow Crab"     },
                { key: "fav_solo_mix",    label: "Solo — Mix"           },
                { key: "fav_duo_shrimp",  label: "Duo — Shrimp"         },
                { key: "fav_duo_crab",    label: "Duo — Snow Crab"      },
                { key: "fav_duo_mix",     label: "Duo — Mix"            },
                { key: "fav_ramen",       label: "Shrimp Alfredo Ramen" },
                { key: "fav_wings",       label: "Wings Boil"           },
                { key: "fav_combo",       label: "Ramen Wings Combo"    },
                { key: "fav_build",       label: "Build Your Own Boil"  },
              ].map(item => (
                <div key={item.key} onClick={() => setFavItems(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "4px", border: favItems[item.key] ? "1px solid #FFD700" : `1px solid ${C.border}`, cursor: "pointer", backgroundColor: favItems[item.key] ? "#FFFBE6" : "#FAFAFA" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${favItems[item.key] ? "#FFD700" : C.border}`, backgroundColor: favItems[item.key] ? "#FFD700" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {favItems[item.key] && <span style={{ color: C.black, fontSize: "11px", fontWeight: "700" }}>⭐</span>}
                  </div>
                  <span style={{ fontSize: "13px", color: favItems[item.key] ? C.charcoal : C.muted }}>{item.label}</span>
                </div>
              ))}
            </div>

            <button onClick={saveSettings} disabled={settingsLoading}
              style={{ background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, padding: "12px 28px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "700", fontSize: "12px", letterSpacing: "0.1em", cursor: "pointer", textTransform: "uppercase" as const }}>
              {settingsLoading ? "Saving..." : settingsSaved ? "✅ Saved!" : "Save Settings"}
            </button>
          </div>

          {/* Pending Reviews */}
          <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Reviews</p>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>
              Pending Approval {pendingReviews.length > 0 && <span style={{ backgroundColor: C.gold, color: C.white, borderRadius: "50%", width: "22px", height: "22px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", marginLeft: "8px" }}>{pendingReviews.length}</span>}
            </h3>
            {pendingReviews.length === 0 ? (
              <p style={{ color: C.muted, fontSize: "14px" }}>No pending reviews</p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {pendingReviews.map(review => (
                  <div key={review.id} style={{ border: `1px solid ${C.border}`, borderRadius: "4px", padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div>
                        <p style={{ fontWeight: "600", fontSize: "15px", color: C.black }}>{review.name}</p>
                        <div style={{ display: "flex", gap: "2px", marginTop: "4px" }}>
                          {[1,2,3,4,5].map(star => (<span key={star} style={{ color: star <= review.rating ? C.gold : C.border, fontSize: "14px" }}>★</span>))}
                        </div>
                      </div>
                      <p style={{ fontSize: "11px", color: C.muted }}>{new Date(review.created_at).toLocaleDateString()}</p>
                    </div>
                    <p style={{ fontSize: "13px", color: C.charcoal, lineHeight: 1.7, marginBottom: "16px", fontStyle: "italic" }}>&ldquo;{review.comment}&rdquo;</p>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button onClick={() => approveReview(review.id)} style={{ backgroundColor: "#1A7A3A", color: C.white, padding: "9px 20px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "12px", cursor: "pointer" }}>✅ Approve</button>
                      <button onClick={() => deleteReview(review.id)} style={{ backgroundColor: C.white, color: "#C0392B", padding: "9px 20px", borderRadius: "4px", border: "1px solid #F5C6C6", fontFamily: FONT_BODY, fontWeight: "500", fontSize: "12px", cursor: "pointer" }}>🗑 Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Item Breakdown */}
          {prepOrders.length > 0 && (
            <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Item Breakdown</p>
              <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>What To Prepare</h3>
              {(() => {
                const itemCounts: Record<string, number> = {};
                prepOrders.forEach(order => {
                  (order.details || []).forEach((detail: string) => {
                    const matchWithVariant = detail.match(/^(\d+)x\s(.+?)\s\(([^)]+)\)/);
                    if (matchWithVariant) {
                      const qty = parseInt(matchWithVariant[1]);
                      const key = `${matchWithVariant[2].trim()} — ${matchWithVariant[3].trim()}`;
                      itemCounts[key] = (itemCounts[key] || 0) + qty;
                    } else {
                      const clean = detail.replace(/\s*-\s*TT\$[\d,]+$/, "").replace(/^\d+x\s/, "").trim();
                      itemCounts[clean] = (itemCounts[clean] || 0) + 1;
                    }
                  });
                });
                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px", marginBottom: "16px" }}>
                      {Object.entries(itemCounts).sort((a,b)=>b[1]-a[1]).map(([item, count]) => (
                        <div key={item} style={{ backgroundColor: C.cream, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontSize: "13px", color: C.charcoal, fontWeight: "500", flex: 1, marginRight: "8px" }}>{item}</p>
                          <span style={{ backgroundColor: C.gold, color: C.white, borderRadius: "20px", padding: "3px 12px", fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap" as const }}>x{count}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ backgroundColor: C.black, borderRadius: "4px", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Active Orders</p>
                      <p style={{ color: C.white, fontFamily: FONT_DISPLAY, fontSize: "20px" }}>{prepOrders.length} orders to prepare · TT${prepOrders.reduce((s: number, o: Order) => s + o.total, 0)} expected</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Admin Tools */}
          <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Admin Tools</p>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Quick Actions</h3>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const }}>
              <button onClick={exportToPDF} style={{ backgroundColor: C.black, color: C.white, padding: "12px 24px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer" }}>🖨️ Print Orders</button>
              <button onClick={exportFinancialsPDF} style={{ background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, padding: "12px 24px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>📊 Print Financial Report</button>
              <button onClick={markAllComplete} disabled={markingComplete} style={{ backgroundColor: "#1A7A3A", color: C.white, padding: "12px 24px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer", opacity: markingComplete ? 0.7 : 1 }}>{markingComplete ? "Completing..." : "✅ Mark All Complete"}</button>
              <button onClick={fetchOrders} style={{ backgroundColor: C.white, color: C.charcoal, padding: "12px 24px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer" }}>↻ Refresh Orders</button>
            </div>
          </div>

          {/* Quick Expenditure */}
          <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Quick Add</p>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Log an Expense</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px" }}>Category</label>
                <select value={quickExpCat} onChange={e => setQuickExpCat(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "13px", fontFamily: FONT_BODY }}>
                  {["Ingredients","Packaging","Gas & Transport","Equipment","Marketing","Other"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px" }}>Amount (TT$)</label>
                <input type="number" value={quickExpAmount} onChange={e => setQuickExpAmount(e.target.value)} placeholder="0" style={{ ...inputStyle }} />
              </div>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px" }}>Description (optional)</label>
              <input type="text" value={quickExpDesc} onChange={e => setQuickExpDesc(e.target.value)} placeholder="e.g. Shrimp from market..." style={{ ...inputStyle }} />
            </div>
            {quickExpSaved && <p style={{ fontSize: "13px", color: "#1A7A3A", marginBottom: "10px" }}>✅ Expense saved!</p>}
            <button onClick={addQuickExpenditure} disabled={quickExpSaving} style={{ backgroundColor: C.gold, color: C.white, padding: "10px 24px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer", opacity: quickExpSaving ? 0.7 : 1 }}>
              {quickExpSaving ? "Saving..." : "Add Expense"}
            </button>
          </div>

          {/* Revenue History */}
          {revenueHistory.length > 0 && (
            <div className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>History</p>
              <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Weekly Revenue</h3>
              <div style={{ display: "grid", gap: "8px" }}>
                {revenueHistory.map((entry, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", backgroundColor: i === 0 ? "#EAFFF0" : C.cream, borderRadius: "4px", border: `1px solid ${i === 0 ? "#8FD4A0" : C.border}` }}>
                    <div>
                      <p style={{ fontWeight: "600", fontSize: "14px", color: C.black }}>{entry.week}</p>
                      <p style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>{entry.orders} order{entry.orders !== 1 ? "s" : ""}</p>
                    </div>
                    <p style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", color: i === 0 ? "#1A7A3A" : C.black }}>TT${entry.revenue}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" as const }}>
            {(["all","new","confirmed","ready","completed","cancelled"] as const).map(tab => (
              <button key={tab} onClick={() => setFilter(tab)} style={{
                padding: "8px 18px", borderRadius: "20px",
                border: filter === tab ? "none" : `1px solid ${C.border}`,
                cursor: "pointer", fontFamily: FONT_BODY, fontSize: "11px",
                fontWeight: filter === tab ? "700" : "500", letterSpacing: "0.06em",
                backgroundColor: filter === tab ? C.black : "transparent",
                color: filter === tab ? C.white : C.muted, transition: "all 0.2s",
              }}>
                {tab === "all" ? "All" : STATUS_CONFIG[tab].label} ({counts[tab] || 0})
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ marginBottom: "20px" }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or day..." style={{ ...inputStyle, padding: "12px 16px", fontSize: "14px" }} />
          </div>

          {/* Orders */}
          {loading ? (
            <div style={{ textAlign: "center" as const, padding: "60px", color: C.muted }}>
              <p>Loading orders...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "60px", backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, color: C.muted }}>
              <p style={{ fontSize: "32px", marginBottom: "12px" }}>📭</p>
              <p style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", color: C.charcoal, marginBottom: "6px" }}>No orders found</p>
              <p>Orders from customers will appear here.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "32px" }}>
              {(["new","confirmed","ready","completed","cancelled"] as const).map(status => {
                const statusOrders = filtered.filter(o => o.status === status);
                if (statusOrders.length === 0) return null;
                const cfg = STATUS_CONFIG[status];
                return (
                  <div key={status}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", paddingBottom: "12px", borderBottom: `2px solid ${cfg.bg}` }}>
                      <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "12px", fontWeight: "800", letterSpacing: "0.1em", padding: "6px 16px", borderRadius: "20px", textTransform: "uppercase" as const }}>{cfg.label}</span>
                      <span style={{ fontFamily: FONT_DISPLAY, fontSize: "15px", color: C.charcoal }}>{statusOrders.length} order{statusOrders.length !== 1 ? "s" : ""}</span>
                      {status !== "completed" && status !== "cancelled" && (
                        <span style={{ fontSize: "13px", color: C.muted }}>· TT${statusOrders.reduce((s, o) => s + o.total, 0)}</span>
                      )}
                    </div>
                    {(["Thursday","Friday","Saturday"] as const).map(day => {
                      const dayOrders = statusOrders.filter(o => o.notes && o.notes.includes(`Day: ${day}`));
                      const noDay = statusOrders.filter(o => !o.notes || (!o.notes.includes("Day: Thursday") && !o.notes.includes("Day: Friday") && !o.notes.includes("Day: Saturday")));
                      const ordersToShow = day === "Thursday" ? [...dayOrders, ...noDay] : dayOrders;
                      if (ordersToShow.length === 0) return null;
                      return (
                        <div key={day} style={{ marginBottom: "16px" }}>
                          <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", color: C.muted, textTransform: "uppercase" as const, marginBottom: "8px", paddingLeft: "4px" }}>📅 {day}</p>
                          <div style={{ display: "grid", gap: "8px" }}>
                            {ordersToShow.map(order => {
                              const cfg2 = STATUS_CONFIG[order.status];
                              const isExpanded2 = expanded === order.id;
                              return (
                                <div key={order.id} className="admin-card" style={{ backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                                  <div onClick={() => setExpanded(isExpanded2 ? null : order.id)} style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px", cursor: "pointer", flexWrap: "wrap" as const }}>
                                    <span style={{ backgroundColor: cfg2.bg, color: cfg2.color, fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", padding: "4px 10px", borderRadius: "20px", whiteSpace: "nowrap" as const }}>{cfg2.label}</span>
                                    <div style={{ flex: 1, minWidth: "160px" }}>
                                      <p style={{ fontWeight: "600", fontSize: "15px", color: C.black }}>{order.name}</p>
                                      <p style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>{order.package}</p>
                                    </div>
                                    {order.notes && order.notes.includes("Day:") && (
                                      <span style={{ backgroundColor: "#EBF3FF", color: "#1A56A4", fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px", whiteSpace: "nowrap" as const }}>
                                        📅 {order.notes.match(/Day: (\w+)/)?.[1] || ""}
                                      </span>
                                    )}
                                    <span style={{ fontSize: "13px", color: C.muted, whiteSpace: "nowrap" as const }}>{order.fulfillment === "delivery" ? "🚗 Delivery" : "🏠 Pickup"}</span>
                                    <span style={{ fontFamily: FONT_DISPLAY, fontSize: "17px", color: C.black, whiteSpace: "nowrap" as const }}>TT${order.total}</span>
                                    <span style={{ color: C.muted, fontSize: "18px" }}>{isExpanded2 ? "▲" : "▼"}</span>
                                  </div>
                                  {isExpanded2 && (
                                    <div style={{ padding: "20px", borderTop: `1px solid ${C.border}`, backgroundColor: C.cream }}>
                                      <div style={{ display: "grid", gap: "6px", marginBottom: "16px", fontSize: "13px" }}>
                                        <p><strong>Phone:</strong> <a href={`tel:${order.phone}`} style={{ color: C.gold }}>{order.phone}</a></p>
                                        {order.email && <p><strong>Email:</strong> {order.email}</p>}
                                        {order.address && <p><strong>Address:</strong> {order.address}</p>}
                                        {(order.details || []).map((d, i) => <p key={i} style={{ color: C.charcoal }}>· {d}</p>)}
                                        {order.notes && <p style={{ backgroundColor: "#FFFBE6", border: "1px solid #F0C04A", borderRadius: "4px", padding: "8px 12px", marginTop: "4px" }}>{order.notes}</p>}
                                      </div>
                                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const, marginBottom: editingOrder === order.id ? "16px" : "0" }}>
                                        {editingOrder !== order.id && (
                                          <button onClick={() => startEdit(order)} style={{ backgroundColor: C.white, color: C.charcoal, padding: "9px 18px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontWeight: "600", fontSize: "12px", cursor: "pointer" }}>✏️ Edit Order</button>
                                        )}
                                        {cfg2.next && (
                                          <button onClick={() => advanceStatus(order.id, order.status)} style={{ background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, padding: "9px 18px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "700", fontSize: "12px", cursor: "pointer" }}>{cfg2.nextLabel}</button>
                                        )}
                                        <a href={`tel:${order.phone}`} style={{ backgroundColor: C.white, color: C.charcoal, padding: "9px 18px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontWeight: "600", fontSize: "12px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>📞 Call</a>
                                        <button onClick={() => deleteOrder(order.id)} style={{ backgroundColor: C.white, color: "#C0392B", padding: "9px 18px", borderRadius: "4px", border: "1px solid #F5C6C6", fontFamily: FONT_BODY, fontWeight: "500", fontSize: "12px", cursor: "pointer" }}>🗑 Delete</button>
                                      </div>

                                      {/* Edit Form */}
                                      {editingOrder === order.id && (
                                        <div style={{ marginTop: "16px", padding: "20px", backgroundColor: C.white, borderRadius: "6px", border: `1px solid ${C.gold}` }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                            <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold }}>Edit Order</p>
                                            {editSaved && <p style={{ fontSize: "12px", color: "#1A7A3A", fontWeight: "700" }}>✅ Saved!</p>}
                                          </div>
                                          {showEditConfirm && editBefore && (
                                            <div style={{ backgroundColor: C.cream, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "12px 16px", marginBottom: "16px", fontSize: "12px" }}>
                                              <p style={{ fontWeight: "700", color: C.charcoal, marginBottom: "6px" }}>Confirm Changes:</p>
                                              {editBefore.name !== editName && <p style={{ color: C.muted }}>Name: <s>{editBefore.name}</s> → <strong>{editName}</strong></p>}
                                              {editBefore.phone !== editPhone && <p style={{ color: C.muted }}>Phone: <s>{editBefore.phone}</s> → <strong>{editPhone}</strong></p>}
                                              {String(editBefore.total) !== editTotal && <p style={{ color: C.muted }}>Total: <s>TT${editBefore.total}</s> → <strong style={{ color: C.gold }}>TT${editTotal}</strong></p>}
                                              {editBefore.fulfillment !== editFulfill && <p style={{ color: C.muted }}>Fulfillment: <s>{editBefore.fulfillment}</s> → <strong>{editFulfill}</strong></p>}
                                              {editBefore.status !== editStatus && <p style={{ color: C.muted }}>Status: <s>{editBefore.status}</s> → <strong>{editStatus}</strong></p>}
                                            </div>
                                          )}
                                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                                            {[
                                              { label: "Name",       value: editName,  set: setEditName  },
                                              { label: "Phone",      value: editPhone, set: setEditPhone },
                                              { label: "Email",      value: editEmail, set: setEditEmail },
                                              { label: "Total (TT$)",value: editTotal, set: setEditTotal, type: "number" },
                                            ].map(f => (
                                              <div key={f.label}>
                                                <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{f.label}</label>
                                                <input type={f.type || "text"} value={f.value} onChange={e => f.set(e.target.value)} style={inputStyle} />
                                              </div>
                                            ))}
                                          </div>
                                          <div style={{ marginBottom: "10px" }}>
                                            <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Order Day</label>
                                            <div style={{ display: "flex", gap: "6px" }}>
                                              {["Thursday","Friday","Saturday"].map(d => (
                                                <button key={d} onClick={() => setEditOrderDay(d)} style={{ flex: 1, padding: "8px 4px", borderRadius: "4px", border: editOrderDay === d ? `2px solid ${C.gold}` : `1px solid ${C.border}`, backgroundColor: editOrderDay === d ? C.goldDim : C.white, cursor: "pointer", fontFamily: FONT_BODY, fontSize: "12px", fontWeight: editOrderDay === d ? "700" : "400", color: editOrderDay === d ? C.gold : C.muted }}>{d}</button>
                                              ))}
                                            </div>
                                          </div>
                                          <div style={{ marginBottom: "10px" }}>
                                            <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Status</label>
                                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
                                              {(["new","confirmed","ready","completed","cancelled"] as OrderStatus[]).map(s => (
                                                <button key={s} onClick={() => setEditStatus(s)} style={{ padding: "7px 12px", borderRadius: "4px", border: editStatus === s ? `2px solid ${STATUS_CONFIG[s].color}` : `1px solid ${C.border}`, backgroundColor: editStatus === s ? STATUS_CONFIG[s].bg : C.white, cursor: "pointer", fontFamily: FONT_BODY, fontSize: "11px", fontWeight: editStatus === s ? "700" : "400", color: editStatus === s ? STATUS_CONFIG[s].color : C.muted, textTransform: "capitalize" as const }}>{s}</button>
                                              ))}
                                            </div>
                                          </div>
                                          <div style={{ marginBottom: "10px" }}>
                                            <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Payment Method</label>
                                            <div style={{ display: "flex", gap: "6px" }}>
                                              {[["cash_on_delivery","💵 Cash on Delivery"],["online_payment","🏦 Online/Bank"]].map(([val, lbl]) => (
                                                <button key={val} onClick={() => setEditPayMethod(val)} style={{ flex: 1, padding: "8px", borderRadius: "4px", border: editPayMethod === val ? `2px solid ${C.gold}` : `1px solid ${C.border}`, backgroundColor: editPayMethod === val ? C.goldDim : C.white, cursor: "pointer", fontFamily: FONT_BODY, fontSize: "12px", fontWeight: editPayMethod === val ? "700" : "400", color: editPayMethod === val ? C.gold : C.muted }}>{lbl}</button>
                                              ))}
                                            </div>
                                          </div>
                                          <div style={{ marginBottom: "10px" }}>
                                            <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Fulfillment</label>
                                            <div style={{ display: "flex", gap: "6px" }}>
                                              <button onClick={() => setEditFulfill("pickup")} style={{ flex: 1, padding: "8px", borderRadius: "4px", border: editFulfill === "pickup" ? `2px solid ${C.gold}` : `1px solid ${C.border}`, backgroundColor: editFulfill === "pickup" ? C.goldDim : C.white, cursor: "pointer", fontFamily: FONT_BODY, fontSize: "12px", fontWeight: editFulfill === "pickup" ? "700" : "400", color: editFulfill === "pickup" ? C.gold : C.muted }}>🏠 Pickup</button>
                                              <button onClick={() => setEditFulfill("delivery")} style={{ flex: 1, padding: "8px", borderRadius: "4px", border: editFulfill === "delivery" ? `2px solid ${C.gold}` : `1px solid ${C.border}`, backgroundColor: editFulfill === "delivery" ? C.goldDim : C.white, cursor: "pointer", fontFamily: FONT_BODY, fontSize: "12px", fontWeight: editFulfill === "delivery" ? "700" : "400", color: editFulfill === "delivery" ? C.gold : C.muted }}>🚗 Delivery</button>
                                            </div>
                                          </div>
                                          {editFulfill === "delivery" && (
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                                              <div>
                                                <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Area</label>
                                                <select value={editArea} onChange={e => setEditArea(e.target.value)} style={{ ...inputStyle }}>
                                                  <option value="">Select...</option>
                                                  {["Arima","D'Abadie","Grand Bazaar","Cumuto","Valencia","Malabar","Piarco","Other"].map(a => <option key={a} value={a}>{a}</option>)}
                                                </select>
                                              </div>
                                              <div>
                                                <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Full Address</label>
                                                <input value={editAddress} onChange={e => setEditAddress(e.target.value)} style={inputStyle} />
                                              </div>
                                            </div>
                                          )}
                                          <div style={{ marginBottom: "14px" }}>
                                            <label style={{ fontSize: "10px", fontWeight: "700", color: C.muted, display: "block", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Notes</label>
                                            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                                          </div>
                                          <div style={{ display: "flex", gap: "8px" }}>
                                            {!showEditConfirm ? (
                                              <button onClick={() => setShowEditConfirm(true)} style={{ background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, padding: "10px 20px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "700", fontSize: "12px", cursor: "pointer", textTransform: "uppercase" as const }}>Review Changes</button>
                                            ) : (
                                              <button onClick={() => saveEdit(order.id)} disabled={editSaving} style={{ background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, padding: "10px 20px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "700", fontSize: "12px", cursor: "pointer", opacity: editSaving ? 0.7 : 1 }}>{editSaving ? "Saving..." : "✅ Confirm Save"}</button>
                                            )}
                                            {showEditConfirm && <button onClick={() => setShowEditConfirm(false)} style={{ backgroundColor: C.white, color: C.muted, padding: "10px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontSize: "12px", cursor: "pointer" }}>Keep Editing</button>}
                                            <button onClick={() => { setEditingOrder(null); setShowEditConfirm(false); }} style={{ backgroundColor: C.white, color: C.muted, padding: "10px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
