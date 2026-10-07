// Input validation shared by the browser (for friendly messages) and the
// server (the real check).

/**
 * Trinidad & Tobago phone numbers: 7 local digits, optionally with the
 * 868 area code or +1 868. Returns "868-XXX-XXXX" or null if invalid.
 */
export function normalizeTTPhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (!/^[\d\s()+.\-]{7,20}$/.test(input.trim())) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1868")) digits = digits.slice(4);
  else if (digits.length === 10 && digits.startsWith("868")) digits = digits.slice(3);
  if (digits.length !== 7) return null;
  if (!/^[2-9]/.test(digits)) return null;
  return `868-${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && input.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}

/** Trim, collapse control characters and cap length. Returns "" for non-strings. */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

export const LIMITS = {
  name: 80, email: 254, notes: 500, address: 300, programme: 80, studentId: 40, reference: 80,
} as const;
