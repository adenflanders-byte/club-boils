"use client";
import { useState } from "react";
import { C, FONT_BODY, FONT_DISPLAY, GOOGLE_FONTS } from "@/components/admin/theme";

// Sign-in for /admin and /accounts using a Supabase Auth admin account.
export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Sign-in failed."); setBusy(false); return; }
      const next = new URLSearchParams(window.location.search).get("next") || "/admin";
      window.location.href = /^\/(admin|accounts)(\/|$)/.test(next) && !next.startsWith("/admin/login") ? next : "/admin";
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: "4px", fontSize: "14px", fontFamily: FONT_BODY,
    backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.white, boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = { fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, display: "block", marginBottom: "8px" };

  return (
    <>
      <style>{`${GOOGLE_FONTS} * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <main style={{ backgroundColor: C.black, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, padding: "24px" }}>
        <form onSubmit={signIn} style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: "8px", border: `1px solid ${C.border}`, padding: "48px 36px", maxWidth: "420px", width: "100%", boxShadow: "0 32px 64px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "8px" }}>
            <span style={{ color: C.gold, fontSize: "28px" }}>♣</span>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: "22px", fontWeight: 600, color: C.white, letterSpacing: "0.06em" }}>THE CLUB BOILS</h1>
          </div>
          <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: C.gold, marginBottom: "36px", textAlign: "center" }}>Admin Sign In</p>
          <div style={{ marginBottom: "16px" }}>
            <label style={lbl} htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={field} />
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={lbl} htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={field} />
          </div>
          {error && <p role="alert" style={{ color: "#E57373", fontSize: "12px", marginBottom: "14px" }}>{error}</p>}
          <button type="submit" disabled={busy} style={{ background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, width: "100%", padding: "14px", borderRadius: "4px", border: "none", fontFamily: FONT_BODY, fontWeight: 700, fontSize: "12px", letterSpacing: "0.12em", cursor: "pointer", textTransform: "uppercase", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </main>
    </>
  );
}
