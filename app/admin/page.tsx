"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

type OrderStatus = "new" | "confirmed" | "ready" | "completed" | "cancelled";

interface Order {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  package: string;
  details: string[];
  fulfillment: "delivery" | "pickup";
  address?: string;
  notes?: string;
  total: number;
  status: OrderStatus;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; next: OrderStatus | null; nextLabel: string | null }> = {
  new:       { label: "New",       color: "#1A56A4", bg: "#EBF3FF", next: "confirmed", nextLabel: "Confirm Order" },
  confirmed: { label: "Confirmed", color: "#6B3FA0", bg: "#F3ECFF", next: "ready",     nextLabel: "Mark Ready"    },
  ready:     { label: "Ready",     color: "#B87A00", bg: "#FFF7E0", next: "completed", nextLabel: "Mark Complete" },
  completed: { label: "Completed", color: "#1A7A3A", bg: "#EAFFF0", next: null,        nextLabel: null            },
  cancelled: { label: "Cancelled", color: "#A03030", bg: "#FFECEC", next: null,        nextLabel: null            },
};

const PASSWORD = "anderson56$";

const C = {
  cream: "#F7F3EC", white: "#FFFFFF", gold: "#B8922A",
  black: "#0F0E0C", charcoal: "#2C2A26", muted: "#7A7368", border: "#E4D9C6",
};
const FONT_DISPLAY = `'Georgia', 'Times New Roman', serif`;
const FONT_BODY    = `'Helvetica Neue', Arial, sans-serif`;

export default function AdminPage() {
  const [authed,    setAuthed]   = useState(false);
  const [pwInput,   setPwInput]  = useState("");
  const [pwError,   setPwError]  = useState(false);
  const [orders,    setOrders]   = useState<Order[]>([]);
  const [loading,   setLoading]  = useState(false);
  const [filter,    setFilter]   = useState<OrderStatus | "all">("all");
  const [expanded,  setExpanded] = useState<string | null>(null);
  const [weeklyExpenditure, setWeeklyExpenditure] = useState<string>("");
  const [revenueHistory, setRevenueHistory] = useState<{week: string, revenue: number, orders: number}[]>([]);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [search,    setSearch]   = useState("");

  // Settings
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [menuItems, setMenuItems] = useState<Record<string, boolean>>({
    menu_solo_shrimp: true, menu_solo_crab: true, menu_solo_mix: true,
    menu_duo_shrimp: true,  menu_duo_crab: true,  menu_duo_mix: true,
    menu_ramen: true, menu_wings: true, menu_sauce: true, menu_build: true, menu_combo: true,
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved,   setSettingsSaved]   = useState(false);
  const [openDays, setOpenDays] = useState({ thursday: true, friday: true, saturday: false });
  const [favItems, setFavItems] = useState<Record<string, boolean>>({
    fav_solo_shrimp: false, fav_solo_crab: false, fav_solo_mix: false,
    fav_duo_shrimp: false,  fav_duo_crab: false,  fav_duo_mix: false,
    fav_ramen: false, fav_wings: false, fav_sauce: false, fav_build: false, fav_combo: false,
  });
  const [pendingReviews, setPendingReviews] = useState<{id: string, name: string, rating: number, comment: string, created_at: string}[]>([]);

  async function fetchSettings() {
    const { data } = await supabase.from("settings").select("*");
    if (data) {
      const ordersOpenRow = data.find(r => r.key === "orders_open");
      if (ordersOpenRow) setOrdersOpen(ordersOpenRow.value === "true");
      const menuState: Record<string, boolean> = {};
      data.filter(r => r.key.startsWith("menu_")).forEach(r => {
        menuState[r.key] = r.value === "true";
      });
      if (Object.keys(menuState).length > 0) setMenuItems(prev => ({ ...prev, ...menuState }));
    }
  }

  async function saveSettings() {
    setSettingsLoading(true);
    const updates = [
      { key: "orders_open", value: String(ordersOpen) },
      ...Object.entries(menuItems).map(([key, value]) => ({ key, value: String(value) })),
      ...Object.entries(favItems).map(([key, value]) => ({ key, value: String(value) })),
      { key: "day_thursday", value: String(openDays.thursday) },
      { key: "day_friday",   value: String(openDays.friday)   },
      { key: "day_saturday", value: String(openDays.saturday) },
    ];
    for (const update of updates) {
      await supabase.from("settings").update({ value: update.value }).eq("key", update.key);
    }
    setSettingsLoading(false);
    setSettingsSaved(true);
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

  // Export ORDERS ONLY to PDF
  function exportToPDF() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const activeOrders = orders.filter(o => ["new","confirmed","ready"].includes(o.status));
    const revenue = activeOrders.reduce((s, o) => s + o.total, 0);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>The Club Boils - Saturday Orders</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
          h1 { font-size: 28px; margin-bottom: 2px; }
          .subtitle { color: #888; font-size: 13px; margin-bottom: 28px; }
          .divider { border: none; border-top: 2px solid #C4952A; margin: 20px 0; }
          .section-title { font-size: 13px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #C4952A; margin-bottom: 12px; }
          .summary-bar { background: #f5f5f5; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; display: flex; gap: 24px; flex-wrap: wrap; }
          .summary-item { font-size: 13px; }
          .order { border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; }
          .order-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
          .order-name { font-size: 16px; font-weight: bold; }
          .order-total { font-size: 16px; font-weight: bold; color: #C4952A; }
          .detail { font-size: 12px; color: #555; margin: 3px 0; }
          .notes-box { background: #fff8e6; border: 1px solid #f0c040; border-radius: 4px; padding: 8px 10px; font-size: 12px; margin-top: 8px; }
          .delivery-tag { display: inline-block; background: #EBF3FF; color: #1A56A4; font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
          .pickup-tag { display: inline-block; background: #F3ECFF; color: #6B3FA0; font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <h1>♣ The Club Boils</h1>
        <p class="subtitle">Saturday Order List &nbsp;·&nbsp; ${new Date().toLocaleDateString("en-TT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        <hr class="divider" />
        <div class="summary-bar">
          <div class="summary-item"><strong>${activeOrders.length}</strong> Total Orders</div>
          <div class="summary-item"><strong>${activeOrders.filter(o => o.fulfillment === "delivery").length}</strong> Deliveries</div>
          <div class="summary-item"><strong>${activeOrders.filter(o => o.fulfillment === "pickup").length}</strong> Pickups</div>
          <div class="summary-item"><strong>TT$${revenue}</strong> Total Revenue</div>
        </div>
        <hr class="divider" />
        <p class="section-title">Orders (${activeOrders.length})</p>
        ${activeOrders.map((o, i) => `
          <div class="order">
            <div class="order-header">
              <div>
                <div class="order-name">${i + 1}. ${o.name}</div>
                <div class="detail" style="margin-top:4px;">📞 ${o.phone}${o.email ? " &nbsp;·&nbsp; " + o.email : ""}</div>
              </div>
              <div class="order-total">TT$${o.total}</div>
            </div>
            <div class="detail"><strong>Package:</strong> ${o.package}</div>
            ${(o.details || []).map(d => `<div class="detail">&nbsp;&nbsp;· ${d}</div>`).join("")}
            <div style="margin-top:8px;">
              ${o.fulfillment === "delivery"
                ? `<span class="delivery-tag">🚗 Delivery</span> <span class="detail" style="display:inline">${o.address}</span>`
                : `<span class="pickup-tag">🏠 Pickup</span>`
              }
            </div>
            ${o.notes ? `<div class="notes-box">⚠️ ${o.notes}</div>` : ""}
          </div>
        `).join("")}
        <hr class="divider" />
        <p style="font-size:11px;color:#aaa;text-align:center;">The Club Boils &nbsp;·&nbsp; Arima, Trinidad &nbsp;·&nbsp; @theclub.boils</p>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }

  // Export FINANCIALS ONLY to PDF
  function exportFinancialsPDF() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const activeOrders = orders.filter(o => o.status !== "cancelled");
    const revenue  = activeOrders.reduce((s, o) => s + o.total, 0);
    const exp      = Number(weeklyExpenditure) || 0;
    const profit   = revenue - exp;
    const margin   = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0";
    const roi      = exp > 0 ? ((profit / exp) * 100).toFixed(1) : "N/A";
    const isProfit = profit >= 0;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>The Club Boils - Financial Report</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; max-width: 600px; margin: 0 auto; }
          h1 { font-size: 28px; margin-bottom: 2px; }
          .subtitle { color: #888; font-size: 13px; margin-bottom: 32px; }
          .divider { border: none; border-top: 2px solid #C4952A; margin: 24px 0; }
          .section-title { font-size: 11px; font-weight: bold; letter-spacing: 0.14em; text-transform: uppercase; color: #C4952A; margin-bottom: 16px; }
          .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px 24px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
          .card.highlight { border-color: ${isProfit ? "#8FD4A0" : "#F5C6C6"}; background: ${isProfit ? "#EAFFF0" : "#FFECEC"}; }
          .card-label { font-size: 12px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin-bottom: 4px; }
          .card-value { font-size: 28px; font-weight: bold; }
          .gold { color: #C4952A; }
          .green { color: #1A7A3A; }
          .red { color: #A03030; }
          .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
          .row:last-child { border-bottom: none; }
          .footer { text-align: center; font-size: 11px; color: #aaa; margin-top: 32px; }
        </style>
      </head>
      <body>
        <h1>♣ The Club Boils</h1>
        <p class="subtitle">Financial Report &nbsp;·&nbsp; ${new Date().toLocaleDateString("en-TT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>

        <hr class="divider" />
        <p class="section-title">Revenue & Costs</p>

        <div class="card">
          <div><div class="card-label">Total Revenue</div><div class="card-value gold">TT$${revenue}</div></div>
          <div style="font-size:13px;color:#888;">${activeOrders.length} orders</div>
        </div>

        <div class="card">
          <div><div class="card-label">Total Expenditure</div><div class="card-value">${exp > 0 ? "TT$" + exp : "Not entered"}</div></div>
          <div style="font-size:13px;color:#888;">Weekly costs</div>
        </div>

        ${exp > 0 ? `
        <div class="card highlight">
          <div><div class="card-label">Net Profit</div><div class="card-value ${isProfit ? "green" : "red"}">${isProfit ? "+" : ""}TT$${profit}</div></div>
          <div style="font-size:13px;color:#888;">${isProfit ? "Profit" : "Loss"}</div>
        </div>
        ` : ""}

        <hr class="divider" />
        <p class="section-title">Performance Metrics</p>

        <div class="row"><span>Profit Margin</span><strong>${exp > 0 ? margin + "%" : "N/A"}</strong></div>
        <div class="row"><span>Return on Cost</span><strong>${exp > 0 ? roi + "%" : "N/A"}</strong></div>
        <div class="row"><span>Average Order Value</span><strong>${activeOrders.length > 0 ? "TT$" + (revenue / activeOrders.length).toFixed(0) : "N/A"}</strong></div>
        <div class="row"><span>Total Orders</span><strong>${activeOrders.length}</strong></div>
        <div class="row"><span>Deliveries</span><strong>${activeOrders.filter(o => o.fulfillment === "delivery").length}</strong></div>
        <div class="row"><span>Pickups</span><strong>${activeOrders.filter(o => o.fulfillment === "pickup").length}</strong></div>
        <div class="row"><span>Delivery Revenue</span><strong>TT$${activeOrders.filter(o => o.fulfillment === "delivery").reduce((s, o) => s + o.total, 0)}</strong></div>
        <div class="row"><span>Pickup Revenue</span><strong>TT$${activeOrders.filter(o => o.fulfillment === "pickup").reduce((s, o) => s + o.total, 0)}</strong></div>

        <div class="footer">The Club Boils &nbsp;·&nbsp; Arima, Trinidad &nbsp;·&nbsp; @theclub.boils</div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }

  // Mark all active orders as completed
  async function markAllComplete() {
    const confirmed = window.confirm("Mark all active orders as completed? This cannot be undone.");
    if (!confirmed) return;
    setMarkingComplete(true);
    const activeIds = orders.filter(o => ["new","confirmed","ready"].includes(o.status)).map(o => o.id);
    for (const id of activeIds) {
      await supabase.from("orders").update({ status: "completed" }).eq("id", id);
    }
    setOrders(prev => prev.map(o => activeIds.includes(o.id) ? { ...o, status: "completed" as OrderStatus } : o));
    setMarkingComplete(false);

    // Save revenue history
    const weekRevenue = orders.filter(o => activeIds.includes(o.id)).reduce((s, o) => s + o.total, 0);
    const weekLabel = new Date().toLocaleDateString("en-TT", { month: "short", day: "numeric", year: "numeric" });
    const newEntry = { week: weekLabel, revenue: weekRevenue, orders: activeIds.length };
    setRevenueHistory(prev => [newEntry, ...prev.slice(0, 11)]);
    localStorage.setItem("revenue_history", JSON.stringify([newEntry, ...revenueHistory.slice(0, 11)]));
  }

  async function fetchOrders() {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setOrders(data as Order[]);
    setLoading(false);
  }

  useEffect(() => {
    if (authed) {
      fetchOrders();
      fetchSettings();
      fetchReviews();
      const saved = localStorage.getItem("revenue_history");
      if (saved) setRevenueHistory(JSON.parse(saved));
    }
  }, [authed]);

  function handleLogin() {
    if (pwInput === PASSWORD) { setAuthed(true); setPwError(false); }
    else setPwError(true);
  }

  async function advanceStatus(id: string, currentStatus: OrderStatus) {
    const next = STATUS_CONFIG[currentStatus].next;
    if (!next) return;
    await supabase.from("orders").update({ status: next }).eq("id", id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
  }

  async function cancelOrder(id: string) {
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "cancelled" } : o));
  }

  async function deleteOrder(id: string) {
    const confirmed = window.confirm("Are you sure you want to permanently delete this order? This cannot be undone.");
    if (!confirmed) return;
    await supabase.from("orders").delete().eq("id", id);
    setOrders(prev => prev.filter(o => o.id !== id));
    setExpanded(null);
  }

  const filtered = orders.filter(o => {
    const matchStatus = filter === "all" || o.status === filter;
    const matchSearch = search === "" ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.phone.includes(search) ||
      o.id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = {
    all:       orders.length,
    new:       orders.filter(o => o.status === "new").length,
    confirmed: orders.filter(o => o.status === "confirmed").length,
    ready:     orders.filter(o => o.status === "ready").length,
    completed: orders.filter(o => o.status === "completed").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  };

  const totalRevenue  = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const pendingCount  = orders.filter(o => ["new","confirmed","ready"].includes(o.status)).length;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "13px 14px", borderRadius: "4px",
    border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FONT_BODY,
    boxSizing: "border-box", backgroundColor: C.white, color: C.charcoal, outline: "none",
  };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-TT", { dateStyle: "medium", timeStyle: "short" });
  }

  // ── Login ─────────────────────────────────────────────────
  if (!authed) {
    return (
      <main style={{ backgroundColor: C.cream, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, padding: "24px" }}>
        <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "48px 40px", maxWidth: "400px", width: "100%", textAlign: "center" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.16em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "12px" }}>Admin Access</p>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: "26px", fontWeight: "400", color: C.black, marginBottom: "8px" }}>The Club Boils</h1>
          <p style={{ color: C.muted, fontSize: "14px", marginBottom: "32px" }}>Order Management Dashboard</p>
          <div style={{ textAlign: "left" as const, marginBottom: "14px" }}>
            <label style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "8px" }}>Password</label>
            <input
              type="password" value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="Enter password"
              style={{ ...inputStyle, border: pwError ? "1px solid #C0392B" : `1px solid ${C.border}` }}
            />
            {pwError && <p style={{ color: "#C0392B", fontSize: "12px", marginTop: "6px" }}>Incorrect password. Please try again.</p>}
          </div>
          <button onClick={handleLogin} style={{ backgroundColor: C.gold, color: C.white, padding: "13px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "14px", cursor: "pointer", width: "100%" }}>
            Sign In
          </button>
        </div>
      </main>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────
  return (
    <main style={{ backgroundColor: C.cream, minHeight: "100vh", fontFamily: FONT_BODY, color: C.charcoal }}>

      <header style={{ backgroundColor: C.black, padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: "18px", color: C.white }}>The Club Boils</span>
          <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.12em", color: C.gold, textTransform: "uppercase" as const }}>Admin</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <a href="/accounts" style={{ backgroundColor: "transparent", border: `1px solid ${C.gold}`, color: C.gold, padding: "7px 16px", borderRadius: "4px", fontSize: "12px", fontFamily: FONT_BODY, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            📊 Accounts
          </a>
          <button onClick={fetchOrders} style={{ backgroundColor: "transparent", border: `1px solid ${C.gold}`, color: C.gold, padding: "7px 16px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontFamily: FONT_BODY }}>
            ↻ Refresh
          </button>
          <button onClick={() => setAuthed(false)} style={{ backgroundColor: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", padding: "7px 16px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontFamily: FONT_BODY }}>
            Sign Out
          </button>
        </div>
      </header>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "32px" }}>
          {[
            { label: "Total Orders",   value: orders.length   },
            { label: "Pending",        value: pendingCount    },
            { label: "Week's Revenue", value: `TT$${totalRevenue}` },
          ].map(stat => (
            <div key={stat.label} style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "20px 22px" }}>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "8px" }}>{stat.label}</p>
              <p style={{ fontFamily: FONT_DISPLAY, fontSize: "26px", color: C.black }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── STORE SETTINGS ── */}
        <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Store Settings</p>
          <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Orders & Menu Control</h3>

          {/* Orders Open/Closed Toggle */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", backgroundColor: ordersOpen ? "#EAFFF0" : "#FFECEC", borderRadius: "8px", border: `1px solid ${ordersOpen ? "#8FD4A0" : "#F5C6C6"}`, marginBottom: "20px" }}>
            <div>
              <p style={{ fontWeight: "700", fontSize: "16px", color: ordersOpen ? "#1A7A3A" : "#A03030" }}>
                {ordersOpen ? "✅ Orders are OPEN" : "🔒 Orders are CLOSED"}
              </p>
              <p style={{ fontSize: "13px", color: C.muted, marginTop: "4px" }}>
                {ordersOpen ? "Customers can currently place orders" : "Customers will see a closed banner"}
              </p>
            </div>
            <button
              onClick={() => setOrdersOpen(!ordersOpen)}
              style={{ backgroundColor: ordersOpen ? "#A03030" : "#1A7A3A", color: C.white, padding: "10px 20px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer" }}
            >
              {ordersOpen ? "Close Orders" : "Open Orders"}
            </button>
          </div>

          {/* Menu Items */}
          <p style={{ fontFamily: FONT_BODY, fontSize: "12px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "12px" }}>Menu Items</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
            {[
              { key: "menu_solo_shrimp", label: "Solo — Shrimp"         },
              { key: "menu_solo_crab",   label: "Solo — Snow Crab"      },
              { key: "menu_solo_mix",    label: "Solo — Mix"            },
              { key: "menu_duo_shrimp",  label: "Duo — Shrimp"          },
              { key: "menu_duo_crab",    label: "Duo — Snow Crab"       },
              { key: "menu_duo_mix",     label: "Duo — Mix"             },
              { key: "menu_ramen",       label: "Shrimp Alfredo Ramen"  },
              { key: "menu_wings",       label: "Wings Boil"            },
              { key: "menu_sauce",       label: "House Sauce"           },
              { key: "menu_build",       label: "Build Your Own Boil"   },
              { key: "menu_combo",       label: "Club Ramen Wings Combo" },
            ].map(item => (
              <div
                key={item.key}
                onClick={() => setMenuItems(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, cursor: "pointer", backgroundColor: menuItems[item.key] ? C.white : "#FAFAFA" }}
              >
                <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${menuItems[item.key] ? C.gold : C.border}`, backgroundColor: menuItems[item.key] ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {menuItems[item.key] && <span style={{ color: C.white, fontSize: "11px", fontWeight: "700" }}>✓</span>}
                </div>
                <span style={{ fontSize: "13px", color: menuItems[item.key] ? C.charcoal : C.muted, fontWeight: menuItems[item.key] ? "500" : "400" }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Open Days */}
          <p style={{ fontFamily: FONT_BODY, fontSize: "12px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "12px", marginTop: "20px" }}>Open Days</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "20px" }}>
            {([
              { key: "thursday", label: "Thursday" },
              { key: "friday",   label: "Friday"   },
              { key: "saturday", label: "Saturday"  },
            ] as const).map(day => (
              <div
                key={day.key}
                onClick={() => setOpenDays(prev => ({ ...prev, [day.key]: !prev[day.key] }))}
                style={{ padding: "16px", borderRadius: "4px", border: openDays[day.key] ? "2px solid #1A7A3A" : `1px solid ${C.border}`, cursor: "pointer", backgroundColor: openDays[day.key] ? "#EAFFF0" : "#FAFAFA", textAlign: "center" as const }}
              >
                <p style={{ fontWeight: "700", fontSize: "14px", color: openDays[day.key] ? "#1A7A3A" : C.muted }}>{day.label}</p>
                <p style={{ fontSize: "11px", marginTop: "4px", color: openDays[day.key] ? "#1A7A3A" : C.muted }}>{openDays[day.key] ? "✅ Open" : "🔒 Closed"}</p>
              </div>
            ))}
          </div>

          {/* Fan Favourites */}
          <p style={{ fontFamily: FONT_BODY, fontSize: "12px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "12px", marginTop: "20px" }}>Fan Favourites</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
            {[
              { key: "fav_solo_shrimp", label: "Solo — Shrimp"         },
              { key: "fav_solo_crab",   label: "Solo — Snow Crab"      },
              { key: "fav_solo_mix",    label: "Solo — Mix"            },
              { key: "fav_duo_shrimp",  label: "Duo — Shrimp"          },
              { key: "fav_duo_crab",    label: "Duo — Snow Crab"       },
              { key: "fav_duo_mix",     label: "Duo — Mix"             },
              { key: "fav_ramen",       label: "Shrimp Alfredo Ramen"  },
              { key: "fav_wings",       label: "Wings Boil"            },
              { key: "fav_combo",       label: "Ramen Wings Combo"     },
              { key: "fav_build",       label: "Build Your Own Boil"   },
            ].map(item => (
              <div
                key={item.key}
                onClick={() => setFavItems(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "4px", border: favItems[item.key] ? "1px solid #FFD700" : `1px solid ${C.border}`, cursor: "pointer", backgroundColor: favItems[item.key] ? "#FFFBE6" : "#FAFAFA" }}
              >
                <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${favItems[item.key] ? "#FFD700" : C.border}`, backgroundColor: favItems[item.key] ? "#FFD700" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {favItems[item.key] && <span style={{ color: C.black, fontSize: "11px", fontWeight: "700" }}>⭐</span>}
                </div>
                <span style={{ fontSize: "13px", color: favItems[item.key] ? C.charcoal : C.muted, fontWeight: favItems[item.key] ? "500" : "400" }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Save button */}
          <button
            onClick={saveSettings}
            disabled={settingsLoading}
            style={{ backgroundColor: C.gold, color: C.white, padding: "12px 28px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "14px", cursor: "pointer", opacity: settingsLoading ? 0.7 : 1 }}
          >
            {settingsLoading ? "Saving..." : settingsSaved ? "✅ Saved!" : "Save Settings"}
          </button>
        </div>

        {/* ── PENDING REVIEWS ── */}
        <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
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
                        {[1,2,3,4,5].map(star => (
                          <span key={star} style={{ color: star <= review.rating ? C.gold : C.border, fontSize: "14px" }}>★</span>
                        ))}
                      </div>
                    </div>
                    <p style={{ fontSize: "11px", color: C.muted }}>{new Date(review.created_at).toLocaleDateString()}</p>
                  </div>
                  <p style={{ fontSize: "13px", color: C.charcoal, lineHeight: 1.7, marginBottom: "16px", fontStyle: "italic" }}>&ldquo;{review.comment}&rdquo;</p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => approveReview(review.id)} style={{ backgroundColor: "#1A7A3A", color: C.white, padding: "9px 20px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "12px", cursor: "pointer" }}>
                      ✅ Approve
                    </button>
                    <button onClick={() => deleteReview(review.id)} style={{ backgroundColor: C.white, color: "#C0392B", padding: "9px 20px", borderRadius: "4px", border: "1px solid #F5C6C6", fontFamily: FONT_BODY, fontWeight: "500", fontSize: "12px", cursor: "pointer" }}>
                      🗑 Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── PROFIT CALCULATOR ── */}
        <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "32px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Weekly Profit Calculator</p>
          <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Revenue & Expenditure</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "end" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "8px" }}>Total Weekly Expenditure (TT$)</label>
              <input
                type="number"
                value={weeklyExpenditure}
                onChange={e => setWeeklyExpenditure(e.target.value)}
                placeholder="e.g. 2000"
                style={{ width: "100%", padding: "13px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FONT_BODY, boxSizing: "border-box" as const, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "8px" }}>Total Revenue (from orders)</label>
              <div style={{ padding: "13px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "14px", backgroundColor: "#FAFAF8", color: C.charcoal }}>
                TT${totalRevenue}
              </div>
            </div>
          </div>

          {weeklyExpenditure && Number(weeklyExpenditure) > 0 && (() => {
            const exp = Number(weeklyExpenditure);
            const profit = totalRevenue - exp;
            const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : "0";
            const roi    = exp > 0 ? ((profit / exp) * 100).toFixed(1) : "0";
            const isProfit = profit >= 0;
            return (
              <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div style={{ backgroundColor: isProfit ? "#EAFFF0" : "#FFECEC", borderRadius: "4px", padding: "16px", border: `1px solid ${isProfit ? "#8FD4A0" : "#F5C6C6"}` }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: isProfit ? "#1A7A3A" : "#A03030", marginBottom: "6px" }}>Net Profit</p>
                  <p style={{ fontFamily: FONT_DISPLAY, fontSize: "22px", color: isProfit ? "#1A7A3A" : "#A03030" }}>{isProfit ? "+" : ""}TT${profit}</p>
                </div>
                <div style={{ backgroundColor: "#EBF3FF", borderRadius: "4px", padding: "16px", border: "1px solid #B8D4F5" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#1A56A4", marginBottom: "6px" }}>Profit Margin</p>
                  <p style={{ fontFamily: FONT_DISPLAY, fontSize: "22px", color: "#1A56A4" }}>{margin}%</p>
                </div>
                <div style={{ backgroundColor: "#F3ECFF", borderRadius: "4px", padding: "16px", border: "1px solid #C9B3F5" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#6B3FA0", marginBottom: "6px" }}>Return on Cost</p>
                  <p style={{ fontFamily: FONT_DISPLAY, fontSize: "22px", color: "#6B3FA0" }}>{roi}%</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── ADMIN TOOLS ── */}
        <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "6px" }}>Admin Tools</p>
          <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", fontWeight: "400", color: C.black, marginBottom: "20px" }}>Quick Actions</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const }}>
            <button onClick={exportToPDF} style={{ backgroundColor: C.black, color: C.white, padding: "12px 24px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              🖨️ Print Orders
            </button>
            <button onClick={exportFinancialsPDF} style={{ backgroundColor: C.gold, color: C.white, padding: "12px 24px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              📊 Print Financial Report
            </button>
            <button onClick={markAllComplete} disabled={markingComplete} style={{ backgroundColor: "#1A7A3A", color: C.white, padding: "12px 24px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer", opacity: markingComplete ? 0.7 : 1 }}>
              {markingComplete ? "Completing..." : "✅ Mark All Complete"}
            </button>
            <button onClick={fetchOrders} style={{ backgroundColor: C.white, color: C.charcoal, padding: "12px 24px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer" }}>
              ↻ Refresh Orders
            </button>
          </div>
        </div>

        {/* ── REVENUE HISTORY ── */}
        {revenueHistory.length > 0 && (
          <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
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

        {/* Search */}
        <div style={{ marginBottom: "16px" }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or order ID..." style={inputStyle} />
        </div>

        {/* Day filter */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" as const }}>
          {(["All Days", "Thursday", "Friday", "Saturday"] as const).map(day => (
            <button key={day} onClick={() => setSearch(day === "All Days" ? "" : `Day: ${day}`)}
              style={{ padding: "7px 14px", borderRadius: "4px", border: "none", cursor: "pointer", fontFamily: FONT_BODY, fontSize: "12px", fontWeight: "500", backgroundColor: (day === "All Days" && search === "") || search === `Day: ${day}` ? C.gold : C.white, color: (day === "All Days" && search === "") || search === `Day: ${day}` ? C.white : C.charcoal }}>
              {day}
            </button>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" as const }}>
          {(["all","new","confirmed","ready","completed","cancelled"] as const).map(tab => (
            <button key={tab} onClick={() => setFilter(tab)} style={{
              padding: "8px 16px", borderRadius: "4px", border: "none", cursor: "pointer",
              fontFamily: FONT_BODY, fontSize: "13px", fontWeight: filter === tab ? "700" : "400",
              backgroundColor: filter === tab ? C.black : C.white,
              color: filter === tab ? C.white : C.charcoal, transition: "all 0.15s",
            }}>
              {tab === "all" ? "All" : STATUS_CONFIG[tab].label} ({counts[tab]})
            </button>
          ))}
        </div>

        {/* Orders */}
        {loading ? (
          <div style={{ textAlign: "center" as const, padding: "60px 24px", color: C.muted }}>
            <p style={{ fontSize: "14px" }}>Loading orders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "60px 24px", color: C.muted }}>
            <p style={{ fontSize: "32px", marginBottom: "12px" }}>📭</p>
            <p style={{ fontFamily: FONT_DISPLAY, fontSize: "20px", color: C.charcoal, marginBottom: "6px" }}>No orders yet</p>
            <p style={{ fontSize: "14px" }}>Orders from customers will appear here automatically.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {filtered.map(order => {
              const cfg = STATUS_CONFIG[order.status];
              const isExpanded = expanded === order.id;
              return (
                <div key={order.id} style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <div onClick={() => setExpanded(isExpanded ? null : order.id)} style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px", cursor: "pointer", flexWrap: "wrap" as const }}>
                    <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", padding: "4px 10px", borderRadius: "20px", whiteSpace: "nowrap" as const }}>{cfg.label}</span>
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
                    <div style={{ textAlign: "right" as const, minWidth: "120px" }}>
                      <p style={{ fontSize: "11px", color: C.gold, fontWeight: "700" }}>{order.id.slice(0, 8).toUpperCase()}</p>
                      <p style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{formatDate(order.created_at)}</p>
                    </div>
                    <span style={{ color: C.muted, fontSize: "18px" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "20px 20px 24px", backgroundColor: "#FAFAF8" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "6px" }}>Customer</p>
                          <p style={{ fontSize: "14px", fontWeight: "600" }}>{order.name}</p>
                          <a href={`tel:${order.phone}`} style={{ display: "block", fontSize: "14px", color: C.gold, textDecoration: "none", marginTop: "2px" }}>{order.phone}</a>
                          {order.email && <p style={{ fontSize: "13px", color: C.muted, marginTop: "2px" }}>{order.email}</p>}
                        </div>
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "6px" }}>
                            {order.fulfillment === "delivery" ? "Delivery Address" : "Pickup"}
                          </p>
                          <p style={{ fontSize: "14px" }}>{order.fulfillment === "delivery" ? order.address : "Arima — Saturday 12–6PM"}</p>
                        </div>
                      </div>

                      <div style={{ marginBottom: "16px" }}>
                        <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "8px" }}>Order Items</p>
                        <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "14px 16px", display: "grid", gap: "4px" }}>
                          <p style={{ fontSize: "14px", fontWeight: "600" }}>{order.package}</p>
                          {(order.details || []).map((d, i) => <p key={i} style={{ fontSize: "13px", color: C.muted }}>{d}</p>)}
                          <p style={{ fontFamily: FONT_DISPLAY, fontSize: "16px", color: C.black, borderTop: `1px solid ${C.border}`, paddingTop: "10px", marginTop: "6px" }}>
                            Total: TT${order.total}
                            {order.fulfillment === "delivery" && <span style={{ fontSize: "12px", color: C.muted, fontFamily: FONT_BODY }}> (incl. TT$30 delivery)</span>}
                          </p>
                        </div>
                      </div>

                      {order.notes && (
                        <div style={{ marginBottom: "16px" }}>
                          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "6px" }}>Notes / Allergies</p>
                          <div style={{ backgroundColor: "#FFF8E6", border: "1px solid #E8C84A", borderRadius: "4px", padding: "12px 14px", fontSize: "13px", color: "#6B5000" }}>
                            ⚠️ {order.notes}
                          </div>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const }}>
                        {cfg.next && (
                          <button onClick={() => advanceStatus(order.id, order.status)} style={{ backgroundColor: C.gold, color: C.white, padding: "11px 22px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer" }}>
                            {cfg.nextLabel}
                          </button>
                        )}
                        <a href={`tel:${order.phone}`} style={{ backgroundColor: C.white, color: C.charcoal, padding: "11px 22px", borderRadius: "4px", border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontWeight: "500", fontSize: "13px", textDecoration: "none", display: "inline-block" }}>
                          📞 Call Customer
                        </a>
                        {order.status !== "cancelled" && order.status !== "completed" && (
                          <button onClick={() => cancelOrder(order.id)} style={{ backgroundColor: C.white, color: "#C0392B", padding: "11px 22px", borderRadius: "4px", border: "1px solid #F5C6C6", fontFamily: FONT_BODY, fontWeight: "500", fontSize: "13px", cursor: "pointer" }}>
                            Cancel Order
                          </button>
                        )}
                        <button
                          onClick={() => deleteOrder(order.id)}
                          style={{ backgroundColor: "#C0392B", color: C.white, padding: "11px 22px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "13px", cursor: "pointer", marginLeft: "auto" }}
                        >
                          🗑 Delete Order
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
