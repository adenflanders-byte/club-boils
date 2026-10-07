import type { CSSProperties } from "react";

export const C = {
  cream: "#FAF8F3", white: "#FFFFFF", gold: "#C4952A", goldDim: "rgba(196,149,42,0.12)",
  black: "#0A0A0A", charcoal: "#1C1C1C", muted: "#6B6560", border: "rgba(196,149,42,0.2)",
  green: "#1A7A3A", greenBg: "#EAFFF0", red: "#A03030", redBg: "#FFECEC", amber: "#B8600A", amberBg: "#FFF8EC",
  blue: "#1A56A4", blueBg: "#EBF3FF", purple: "#6B3FA0", purpleBg: "#F3ECFF",
};
export const FONT_DISPLAY = `'Cinzel', serif`;
export const FONT_BODY = `'Inter', sans-serif`;
export const GOOGLE_FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap');`;

export const input: CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "4px", border: `1px solid ${C.border}`,
  fontSize: "13px", fontFamily: FONT_BODY, boxSizing: "border-box", backgroundColor: C.white, color: C.charcoal,
};
export const label: CSSProperties = {
  fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, display: "block", marginBottom: "6px",
};
export const btn: CSSProperties = {
  backgroundColor: C.white, color: C.charcoal, padding: "9px 16px", borderRadius: "4px", border: `1px solid ${C.border}`,
  fontFamily: FONT_BODY, fontWeight: 600, fontSize: "12px", cursor: "pointer",
};
export const goldBtn: CSSProperties = {
  ...btn, background: `linear-gradient(135deg, ${C.gold}, #E8B84B)`, color: C.black, border: "none", fontWeight: 700,
};
export const pill = (color: string, bg: string): CSSProperties => ({
  backgroundColor: bg, color, fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", whiteSpace: "nowrap", display: "inline-block",
});

export const PAYMENT_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  pending_payment: { color: C.amber, bg: C.amberBg },
  awaiting_bank_transfer_verification: { color: C.blue, bg: C.blueBg },
  paid: { color: C.green, bg: C.greenBg },
  partially_paid: { color: C.purple, bg: C.purpleBg },
  refunded: { color: C.muted, bg: "#F1EFEA" },
  failed_or_cancelled: { color: C.red, bg: C.redBg },
};
