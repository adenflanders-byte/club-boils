"use client";
import { useState } from "react";

export default function Test() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("Nothing tapped yet");

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Button Test</h1>
      <p>{text}</p>
      <p>Count: {count}</p>
      
      <br />
      
      {/* Plain HTML button */}
      <button 
        onClick={() => { setCount(c => c + 1); setText("Button 1 worked!"); }}
        style={{ display: "block", width: "100%", padding: "20px", fontSize: "18px", marginBottom: "20px", backgroundColor: "gold", border: "none" }}
      >
        Tap Me (Button)
      </button>

      {/* Div acting as button */}
      <div 
        onClick={() => { setCount(c => c + 1); setText("Div 2 worked!"); }}
        style={{ display: "block", width: "100%", padding: "20px", fontSize: "18px", marginBottom: "20px", backgroundColor: "lightblue", cursor: "pointer" }}
      >
        Tap Me (Div)
      </div>

      {/* Link */}
      <a 
        href="#" 
        onClick={(e) => { e.preventDefault(); setCount(c => c + 1); setText("Link 3 worked!"); }}
        style={{ display: "block", width: "100%", padding: "20px", fontSize: "18px", marginBottom: "20px", backgroundColor: "lightgreen", textDecoration: "none", color: "black" }}
      >
        Tap Me (Link)
      </a>
    </div>
  );
}
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
  const [search,    setSearch]   = useState("");

  // Settings
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [menuItems, setMenuItems] = useState<Record<string, boolean>>({
    menu_solo_shrimp: true, menu_solo_crab: true, menu_solo_mix: true,
    menu_duo_shrimp: true,  menu_duo_crab: true,  menu_duo_mix: true,
    menu_ramen: true, menu_wings: true, menu_sauce: true, menu_build: true,
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved,   setSettingsSaved]   = useState(false);

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
    ];
    for (const update of updates) {
      await supabase.from("settings").update({ value: update.value }).eq("key", update.key);
    }
    setSettingsLoading(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
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

  useEffect(() => { if (authed) { fetchOrders(); fetchSettings(); } }, [authed]);

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

          {/* Save button */}
          <button
            onClick={saveSettings}
            disabled={settingsLoading}
            style={{ backgroundColor: C.gold, color: C.white, padding: "12px 28px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: "600", fontSize: "14px", cursor: "pointer", opacity: settingsLoading ? 0.7 : 1 }}
          >
            {settingsLoading ? "Saving..." : settingsSaved ? "✅ Saved!" : "Save Settings"}
          </button>
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

        {/* Search */}
        <div style={{ marginBottom: "16px" }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or order ID..." style={inputStyle} />
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
