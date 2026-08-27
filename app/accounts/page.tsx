"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Transaction {
  id: string;
  created_at: string;
  type: "income" | "expense";
  category: string;
  description: string;
  amount: number;
  date: string;
}

const EXPENSE_CATEGORIES = ["Ingredients", "Packaging", "Gas & Transport", "Equipment", "Marketing", "Other"];
const INCOME_CATEGORIES  = ["Orders", "Other Income"];

const C = {
  cream: "#F7F3EC", white: "#FFFFFF", gold: "#B8922A", goldPale: "#F5EDD8",
  black: "#0F0E0C", charcoal: "#2C2A26", muted: "#7A7368", border: "#E4D9C6",
};
const FD = `'Georgia', 'Times New Roman', serif`;
const FB = `'Helvetica Neue', Arial, sans-serif`;
const PASSWORD = "anderson56$";

export default function AccountsPage() {
  const [authed,       setAuthed]       = useState(false);
  const [pwInput,      setPwInput]      = useState("");
  const [pwError,      setPwError]      = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [activeTab,    setActiveTab]    = useState<"overview" | "transactions" | "add" | "receipts">("overview");
  const [viewMode,     setViewMode]     = useState<"weekly" | "monthly">("weekly");
  const [filterType,   setFilterType]   = useState<"all" | "income" | "expense">("all");
  const [filterCat,    setFilterCat]    = useState("all");

  // Add form
  const [newType,        setNewType]        = useState<"income" | "expense">("expense");
  const [newCategory,    setNewCategory]    = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAmount,      setNewAmount]      = useState("");
  const [newDate,        setNewDate]        = useState(new Date().toISOString().split("T")[0]);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);

  // Receipt scanning
  const [receiptTab,     setReceiptTab]     = useState<"manual" | "scan">("manual");
  const [scanning,       setScanning]       = useState(false);
  const [scanResult,     setScanResult]     = useState<{items: {description: string, amount: number, category: string}[], total: number} | null>(null);
  const [scanError,      setScanError]      = useState("");

  async function scanReceipt(file: File) {
    setScanError("");
    setScanResult(null);
    setScanning(true);
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
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: file.type as any, data: base64 }
              },
              {
                type: "text",
                text: `You are analyzing a receipt for a seafood business called The Club Boils in Trinidad.
Extract all line items from this receipt.
For each item, determine the best category from: Ingredients, Packaging, Gas & Transport, Equipment, Marketing, Other.
Return ONLY a JSON object like this, no other text:
{
  "items": [
    {"description": "item name", "amount": 25.50, "category": "Ingredients"}
  ],
  "total": 25.50,
  "date": "YYYY-MM-DD or empty string if not visible"
}`
              }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
      const parsed = JSON.parse(clean);
      setScanResult(parsed);
    } catch (err) {
      setScanError("Could not read receipt. Please try a clearer photo or enter manually.");
    }
    setScanning(false);
  }

  async function saveScanResult() {
    if (!scanResult) return;
    setSaving(true);
    for (const item of scanResult.items) {
      await supabase.from("accounts").insert({
        type: "expense",
        category: item.category,
        description: item.description,
        amount: Math.round(item.amount),
        date: newDate,
      });
    }
    setSaving(false);
    setSaved(true);
    setScanResult(null);
    setTimeout(() => setSaved(false), 3000);
    fetchTransactions();
  }

  async function fetchTransactions() {
    setLoading(true);
    const { data } = await supabase.from("accounts").select("*").order("date", { ascending: false });
    if (data) setTransactions(data as Transaction[]);
    setLoading(false);
  }

  useEffect(() => { if (authed) fetchTransactions(); }, [authed]);

  function handleLogin() {
    if (pwInput === PASSWORD) { setAuthed(true); setPwError(false); }
    else setPwError(true);
  }

  async function addTransaction() {
    if (!newCategory)        { alert("Please select a category."); return; }
    if (!newAmount || isNaN(Number(newAmount))) { alert("Please enter a valid amount."); return; }
    if (!newDate)            { alert("Please select a date."); return; }
    setSaving(true);
    await supabase.from("accounts").insert({
      type: newType,
      category: newCategory,
      description: newDescription.trim() || null,
      amount: Math.round(Number(newAmount)),
      date: newDate,
    });
    setSaving(false); setSaved(true);
    setNewCategory(""); setNewDescription(""); setNewAmount(""); setNewDate(new Date().toISOString().split("T")[0]);
    setTimeout(() => setSaved(false), 3000);
    fetchTransactions();
  }

  async function deleteTransaction(id: string) {
    if (!window.confirm("Delete this transaction?")) return;
    await supabase.from("accounts").delete().eq("id", id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  // ── calculations ────────────────────────────────────────
  function getWeekKey(dateStr: string) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split("T")[0];
  }

  function getMonthKey(dateStr: string) {
    return dateStr.slice(0, 7);
  }

  function groupTransactions() {
    const groups: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      const key = viewMode === "weekly" ? getWeekKey(t.date) : getMonthKey(t.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }

  function formatPeriod(key: string) {
    if (viewMode === "monthly") {
      const [year, month] = key.split("-");
      return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-TT", { month: "long", year: "numeric" });
    }
    const d = new Date(key);
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    return `Week of ${d.toLocaleDateString("en-TT", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-TT", { month: "short", day: "numeric", year: "numeric" })}`;
  }

  const totalIncome   = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netProfit     = totalIncome - totalExpenses;
  const margin        = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : "0";

  const expenseByCategory = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: transactions.filter(t => t.type === "expense" && t.category === cat).reduce((s, t) => s + t.amount, 0),
  })).filter(e => e.total > 0);

  const filtered = transactions.filter(t => {
    const matchType = filterType === "all" || t.type === filterType;
    const matchCat  = filterCat === "all" || t.category === filterCat;
    return matchType && matchCat;
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: "4px",
    border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FB,
    boxSizing: "border-box" as const, backgroundColor: C.white, color: C.charcoal, outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: FB, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em",
    textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px",
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px", borderRadius: "4px", border: "none", cursor: "pointer",
    fontFamily: FB, fontSize: "12px", fontWeight: active ? "700" : "400",
    backgroundColor: active ? C.black : C.white,
    color: active ? C.white : C.charcoal, transition: "all 0.15s",
  });
  const goldBtn: React.CSSProperties = {
    backgroundColor: C.gold, color: C.white, padding: "12px 24px", borderRadius: "4px",
    border: "none", fontFamily: FB, fontWeight: "600", fontSize: "13px", cursor: "pointer",
  };

  // ── Login ─────────────────────────────────────────────
  if (!authed) {
    return (
      <main style={{ backgroundColor: C.cream, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FB, padding: "24px" }}>
        <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "48px 40px", maxWidth: "400px", width: "100%", textAlign: "center" as const }}>
          <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.16em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "12px" }}>Accounts Access</p>
          <h1 style={{ fontFamily: FD, fontSize: "26px", fontWeight: "400", color: C.black, marginBottom: "8px" }}>The Club Boils</h1>
          <p style={{ color: C.muted, fontSize: "14px", marginBottom: "32px" }}>Business Accounts Dashboard</p>
          <div style={{ textAlign: "left" as const, marginBottom: "14px" }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={pwInput} onChange={e => { setPwInput(e.target.value); setPwError(false); }} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Enter password"
              style={{ ...inputStyle, border: pwError ? "1px solid #C0392B" : `1px solid ${C.border}` }} />
            {pwError && <p style={{ color: "#C0392B", fontSize: "12px", marginTop: "6px" }}>Incorrect password.</p>}
          </div>
          <button onClick={handleLogin} style={{ ...goldBtn, width: "100%" }}>Sign In</button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ backgroundColor: C.cream, minHeight: "100vh", fontFamily: FB }}>

      {/* Header */}
      <header style={{ backgroundColor: C.black, padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontFamily: FD, fontSize: "18px", color: C.white }}>The Club Boils</span>
          <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.12em", color: C.gold, textTransform: "uppercase" as const }}>Accounts</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <a href="/admin" style={{ backgroundColor: "transparent", border: `1px solid ${C.gold}`, color: C.gold, padding: "7px 16px", borderRadius: "4px", fontSize: "12px", fontFamily: FB, textDecoration: "none", display: "flex", alignItems: "center" }}>← Orders</a>
          <button onClick={() => setAuthed(false)} style={{ backgroundColor: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", padding: "7px 16px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontFamily: FB }}>Sign Out</button>
        </div>
      </header>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          <button style={tabBtn(activeTab === "overview")}     onClick={() => setActiveTab("overview")}>📊 Overview</button>
          <button style={tabBtn(activeTab === "transactions")} onClick={() => setActiveTab("transactions")}>📋 Transactions</button>
          <button style={tabBtn(activeTab === "add")}          onClick={() => setActiveTab("add")}>+ Add Entry</button>
          <button style={tabBtn(activeTab === "receipts")}     onClick={() => setActiveTab("receipts")}>🧾 Receipts</button>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div>
            {/* View mode toggle */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
              <button style={tabBtn(viewMode === "weekly")}  onClick={() => setViewMode("weekly")}>Weekly</button>
              <button style={tabBtn(viewMode === "monthly")} onClick={() => setViewMode("monthly")}>Monthly</button>
            </div>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: "32px" }}>
              {[
                { label: "Total Revenue",  value: `TT$${totalIncome}`,   color: C.gold    },
                { label: "Total Expenses", value: `TT$${totalExpenses}`, color: "#A03030" },
                { label: "Net Profit",     value: `${netProfit >= 0 ? "+" : ""}TT$${netProfit}`, color: netProfit >= 0 ? "#1A7A3A" : "#A03030" },
                { label: "Profit Margin",  value: `${margin}%`,          color: C.charcoal },
              ].map(card => (
                <div key={card.label} style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "20px" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "8px" }}>{card.label}</p>
                  <p style={{ fontFamily: FD, fontSize: "24px", color: card.color }}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Expenses by category */}
            {expenseByCategory.length > 0 && (
              <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "24px", marginBottom: "24px" }}>
                <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "16px" }}>Expenses by Category</p>
                <div style={{ display: "grid", gap: "10px" }}>
                  {expenseByCategory.sort((a, b) => b.total - a.total).map(e => (
                    <div key={e.cat} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <p style={{ fontSize: "13px", color: C.charcoal, minWidth: "160px" }}>{e.cat}</p>
                      <div style={{ flex: 1, height: "6px", backgroundColor: C.cream, borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((e.total / totalExpenses) * 100)}%`, backgroundColor: C.gold, borderRadius: "3px" }} />
                      </div>
                      <p style={{ fontSize: "13px", fontWeight: "700", color: C.charcoal, minWidth: "80px", textAlign: "right" as const }}>TT${e.total}</p>
                      <p style={{ fontSize: "11px", color: C.muted, minWidth: "40px" }}>{Math.round((e.total / totalExpenses) * 100)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Period breakdown */}
            <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "24px" }}>
              <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.gold, marginBottom: "16px" }}>{viewMode === "weekly" ? "Weekly" : "Monthly"} Breakdown</p>
              {groupTransactions().length === 0 ? (
                <p style={{ color: C.muted, fontSize: "14px" }}>No transactions yet</p>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {groupTransactions().map(([key, txns]) => {
                    const inc = txns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
                    const exp = txns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
                    const net = inc - exp;
                    return (
                      <div key={key} style={{ padding: "16px 20px", backgroundColor: C.cream, borderRadius: "4px", border: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: "8px" }}>
                          <p style={{ fontFamily: FD, fontSize: "16px", color: C.black }}>{formatPeriod(key)}</p>
                          <div style={{ display: "flex", gap: "20px" }}>
                            <div style={{ textAlign: "right" as const }}>
                              <p style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Revenue</p>
                              <p style={{ fontSize: "15px", fontWeight: "700", color: C.gold }}>TT${inc}</p>
                            </div>
                            <div style={{ textAlign: "right" as const }}>
                              <p style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Expenses</p>
                              <p style={{ fontSize: "15px", fontWeight: "700", color: "#A03030" }}>TT${exp}</p>
                            </div>
                            <div style={{ textAlign: "right" as const }}>
                              <p style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Profit</p>
                              <p style={{ fontSize: "15px", fontWeight: "700", color: net >= 0 ? "#1A7A3A" : "#A03030" }}>{net >= 0 ? "+" : ""}TT${net}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TRANSACTIONS TAB ── */}
        {activeTab === "transactions" && (
          <div>
            {/* Filters */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" as const }}>
              <select value={filterType} onChange={e => setFilterType(e.target.value as any)} style={{ ...inputStyle, width: "auto", padding: "8px 14px" }}>
                <option value="all">All Types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "8px 14px" }}>
                <option value="all">All Categories</option>
                {[...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={fetchTransactions} style={{ ...goldBtn, padding: "8px 16px", fontSize: "12px" }}>↻ Refresh</button>
            </div>

            {loading ? (
              <p style={{ color: C.muted, textAlign: "center" as const, padding: "40px" }}>Loading...</p>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px", backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: "32px", marginBottom: "12px" }}>📋</p>
                <p style={{ fontFamily: FD, fontSize: "18px", color: C.charcoal, marginBottom: "6px" }}>No transactions found</p>
                <p style={{ color: C.muted, fontSize: "13px" }}>Add your first entry using the + Add Entry tab</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {filtered.map(t => (
                  <div key={t.id} style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" as const }}>
                    <span style={{ backgroundColor: t.type === "income" ? "#EAFFF0" : "#FFECEC", color: t.type === "income" ? "#1A7A3A" : "#A03030", fontSize: "10px", fontWeight: "700", letterSpacing: "0.08em", padding: "3px 10px", borderRadius: "20px", whiteSpace: "nowrap" as const, textTransform: "uppercase" as const }}>
                      {t.type}
                    </span>
                    <div style={{ flex: 1, minWidth: "150px" }}>
                      <p style={{ fontWeight: "600", fontSize: "14px", color: C.black }}>{t.category}</p>
                      {t.description && <p style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>{t.description}</p>}
                    </div>
                    <p style={{ fontSize: "12px", color: C.muted }}>{new Date(t.date).toLocaleDateString("en-TT", { month: "short", day: "numeric", year: "numeric" })}</p>
                    <p style={{ fontFamily: FD, fontSize: "18px", color: t.type === "income" ? "#1A7A3A" : "#A03030", whiteSpace: "nowrap" as const }}>
                      {t.type === "income" ? "+" : "-"}TT${t.amount}
                    </p>
                    <button onClick={() => deleteTransaction(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", fontSize: "16px", padding: "4px" }}>🗑</button>
                  </div>
                ))}
                {/* Total */}
                <div style={{ backgroundColor: C.black, borderRadius: "4px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{filtered.length} transactions</p>
                  <p style={{ fontFamily: FD, fontSize: "20px", color: C.white }}>
                    Net: TT${filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0) - filtered.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RECEIPTS TAB ── */}
        {activeTab === "receipts" && (
          <div style={{ maxWidth: "640px" }}>
            {/* Tab toggle */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
              <button style={tabBtn(receiptTab === "scan")}   onClick={() => setReceiptTab("scan")}>📷 Scan Receipt</button>
              <button style={tabBtn(receiptTab === "manual")} onClick={() => setReceiptTab("manual")}>✏️ Enter Manually</button>
            </div>

            {/* SCAN TAB */}
            {receiptTab === "scan" && (
              <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "32px" }}>
                <h2 style={{ fontFamily: FD, fontSize: "22px", color: C.black, marginBottom: "8px" }}>Scan a Receipt</h2>
                <p style={{ fontSize: "13px", color: C.muted, marginBottom: "24px" }}>Take a photo of your receipt and Claude AI will automatically extract all the items and amounts.</p>

                <div>
                  <label style={{ fontFamily: FB, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "8px" }}>Receipt Date</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FB, boxSizing: "border-box" as const, marginBottom: "16px" }} />
                </div>

                {/* Upload area */}
                <label style={{ display: "block", border: `2px dashed ${C.border}`, borderRadius: "4px", padding: "40px 20px", textAlign: "center" as const, cursor: "pointer", backgroundColor: "#FAFAF8", marginBottom: "16px" }}>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) scanReceipt(f); }} />
                  {scanning ? (
                    <div>
                      <p style={{ fontSize: "32px", marginBottom: "8px" }}>🔍</p>
                      <p style={{ fontFamily: FD, fontSize: "16px", color: C.black, marginBottom: "4px" }}>Reading receipt...</p>
                      <p style={{ fontSize: "12px", color: C.muted }}>Claude AI is extracting the items</p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "40px", marginBottom: "8px" }}>📷</p>
                      <p style={{ fontFamily: FD, fontSize: "16px", color: C.black, marginBottom: "4px" }}>Tap to upload receipt photo</p>
                      <p style={{ fontSize: "12px", color: C.muted }}>JPG, PNG or HEIC — take a clear photo of the full receipt</p>
                    </div>
                  )}
                </label>

                {scanError && (
                  <div style={{ backgroundColor: "#FFECEC", border: "1px solid #F5C6C6", borderRadius: "4px", padding: "14px", fontSize: "13px", color: "#A03030", marginBottom: "16px" }}>
                    {scanError}
                  </div>
                )}

                {/* Scan result */}
                {scanResult && (
                  <div>
                    <div style={{ backgroundColor: "#EAFFF0", border: "1px solid #8FD4A0", borderRadius: "4px", padding: "16px 20px", marginBottom: "16px" }}>
                      <p style={{ fontSize: "12px", fontWeight: "700", color: "#1A7A3A", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: "12px" }}>Receipt Scanned Successfully!</p>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {scanResult.items.map((item, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: "13px" }}>
                            <div>
                              <p style={{ fontWeight: "600", color: C.black }}>{item.description}</p>
                              <p style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{item.category}</p>
                            </div>
                            <p style={{ fontWeight: "700", color: "#A03030" }}>TT${item.amount}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                        <p style={{ fontWeight: "700", fontSize: "14px", color: C.black }}>Total</p>
                        <p style={{ fontFamily: FD, fontSize: "20px", color: "#A03030" }}>TT${scanResult.total}</p>
                      </div>
                    </div>
                    {saved ? (
                      <div style={{ backgroundColor: "#EAFFF0", border: "1px solid #8FD4A0", borderRadius: "4px", padding: "14px", fontSize: "13px", color: "#1A7A3A", textAlign: "center" as const }}>
                        ✅ All items saved to accounts!
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button onClick={saveScanResult} disabled={saving} style={{ flex: 1, backgroundColor: C.gold, color: C.white, padding: "14px", borderRadius: "4px", border: "none", fontFamily: FB, fontWeight: "600", fontSize: "13px", cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                          {saving ? "Saving..." : `Save All Items to Accounts`}
                        </button>
                        <button onClick={() => setScanResult(null)} style={{ padding: "14px 20px", borderRadius: "4px", border: `1px solid ${C.border}`, backgroundColor: "transparent", fontFamily: FB, fontSize: "13px", cursor: "pointer", color: C.muted }}>
                          Discard
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MANUAL TAB — reuse existing add form */}
            {receiptTab === "manual" && (
              <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "32px" }}>
                <h2 style={{ fontFamily: FD, fontSize: "22px", color: C.black, marginBottom: "24px" }}>Add Receipt Manually</h2>
                <div style={{ display: "grid", gap: "16px" }}>
                  <div>
                    <label style={{ fontFamily: FB, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px" }}>Category *</label>
                    <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FB, boxSizing: "border-box" as const }}>
                      <option value="">Select category...</option>
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontFamily: FB, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px" }}>Description <span style={{ fontWeight: "400", textTransform: "none" as const, letterSpacing: 0 }}>(optional)</span></label>
                    <input type="text" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="e.g. Shrimp from market, packaging bags..." style={{ width: "100%", padding: "12px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FB, boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: FB, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px" }}>Amount (TT$) *</label>
                    <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0" style={{ width: "100%", padding: "12px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FB, boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: FB, fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted, display: "block", marginBottom: "6px" }}>Date *</label>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: "4px", border: `1px solid ${C.border}`, fontSize: "14px", fontFamily: FB, boxSizing: "border-box" as const }} />
                  </div>
                  {saved && (
                    <div style={{ backgroundColor: "#EAFFF0", border: "1px solid #8FD4A0", borderRadius: "4px", padding: "12px 16px", fontSize: "13px", color: "#1A7A3A" }}>
                      ✅ Receipt saved successfully!
                    </div>
                  )}
                  <button onClick={() => {
                    setNewType("expense");
                    addTransaction();
                  }} disabled={saving} style={{ backgroundColor: C.gold, color: C.white, padding: "14px", borderRadius: "4px", border: "none", fontFamily: FB, fontWeight: "600", fontSize: "14px", cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Saving..." : "Save Receipt"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ADD ENTRY TAB ── */}
        {activeTab === "add" && (
          <div style={{ maxWidth: "560px" }}>
            <div style={{ backgroundColor: C.white, borderRadius: "4px", border: `1px solid ${C.border}`, padding: "32px" }}>
              <h2 style={{ fontFamily: FD, fontSize: "22px", color: C.black, marginBottom: "24px" }}>Add Transaction</h2>
              <div style={{ display: "grid", gap: "16px" }}>

                {/* Type toggle */}
                <div>
                  <label style={labelStyle}>Type *</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => { setNewType("income"); setNewCategory(""); }}
                      style={{ flex: 1, padding: "12px", borderRadius: "4px", border: newType === "income" ? "2px solid #1A7A3A" : `1px solid ${C.border}`, backgroundColor: newType === "income" ? "#EAFFF0" : C.white, cursor: "pointer", fontFamily: FB, fontWeight: newType === "income" ? "700" : "400", color: newType === "income" ? "#1A7A3A" : C.muted, fontSize: "13px" }}>
                      💰 Income
                    </button>
                    <button onClick={() => { setNewType("expense"); setNewCategory(""); }}
                      style={{ flex: 1, padding: "12px", borderRadius: "4px", border: newType === "expense" ? "2px solid #A03030" : `1px solid ${C.border}`, backgroundColor: newType === "expense" ? "#FFECEC" : C.white, cursor: "pointer", fontFamily: FB, fontWeight: newType === "expense" ? "700" : "400", color: newType === "expense" ? "#A03030" : C.muted, fontSize: "13px" }}>
                      💸 Expense
                    </button>
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label style={labelStyle}>Category *</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={inputStyle}>
                    <option value="">Select category...</option>
                    {(newType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description <span style={{ fontWeight: "400", textTransform: "none" as const, letterSpacing: 0 }}>(optional)</span></label>
                  <input type="text" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="e.g. Shrimp from market, Packaging bags..." style={inputStyle} />
                </div>

                {/* Amount */}
                <div>
                  <label style={labelStyle}>Amount (TT$) *</label>
                  <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0" style={inputStyle} />
                </div>

                {/* Date */}
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} />
                </div>

                {saved && (
                  <div style={{ backgroundColor: "#EAFFF0", border: "1px solid #8FD4A0", borderRadius: "4px", padding: "12px 16px", fontSize: "13px", color: "#1A7A3A" }}>
                    ✅ Transaction saved successfully!
                  </div>
                )}

                <button onClick={addTransaction} disabled={saving} style={{ ...goldBtn, width: "100%", padding: "14px", fontSize: "14px", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Saving..." : "Add Transaction"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
