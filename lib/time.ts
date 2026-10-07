// Trinidad & Tobago time helpers. America/Port_of_Spain is UTC-4 all year
// (no daylight saving), but formatting still goes through Intl so labels
// are correct whatever timezone the server or browser runs in.
export const TT_TZ = "America/Port_of_Spain";
const TT_OFFSET_MS = -4 * 60 * 60 * 1000;

/** YYYY-MM-DD of `d` in Trinidad. */
export function ttDateString(d: Date = new Date()): string {
  return new Date(d.getTime() + TT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday) of `d` in Trinidad. */
export function ttDayOfWeek(d: Date = new Date()): number {
  return new Date(d.getTime() + TT_OFFSET_MS).getUTCDay();
}

/** The instant of a Trinidad wall-clock time, e.g. ttInstant("2026-10-15", 9, 30). */
export function ttInstant(dateStr: string, hours: number, minutes = 0): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hours, minutes) - TT_OFFSET_MS);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function formatTT(d: Date | string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleString("en-US", { timeZone: TT_TZ, ...opts });
}
export const formatTTTime = (d: Date | string) => formatTT(d, { hour: "numeric", minute: "2-digit" });
export const formatTTDateLong = (d: Date | string) => formatTT(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const formatTTDateTime = (d: Date | string) =>
  formatTT(d, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Format a YYYY-MM-DD date (no time) as e.g. "Thursday, October 15, 2026". */
export function formatDateOnly(dateStr: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) {
  return ttInstant(dateStr, 12).toLocaleDateString("en-US", { timeZone: TT_TZ, ...opts });
}

// ── Regular (non-event) ordering days ────────────────────────────────────
export type OrderDay = "thursday" | "friday" | "saturday";
export const ORDER_DAYS: { key: OrderDay; name: string; dow: number }[] = [
  { key: "thursday", name: "Thursday", dow: 4 },
  { key: "friday",   name: "Friday",   dow: 5 },
  { key: "saturday", name: "Saturday", dow: 6 },
];
/** Orders for a day close at 8:00 PM Trinidad time the night before. */
export const REGULAR_CUTOFF_HOUR = 20;

/**
 * The date an order for `day` would be fulfilled if placed at `now`:
 * the next such weekday (tomorrow at the earliest) whose 8 PM cutoff the
 * night before has not passed. Returns null if that day is switched off.
 */
export function regularFulfilmentFor(day: OrderDay, now: Date, openDays: Record<OrderDay, boolean>):
  { date: string; cutoff: Date } | null {
  if (!openDays[day]) return null;
  const target = ORDER_DAYS.find(d => d.key === day)!;
  const today = ttDateString(now);
  for (let ahead = 1; ahead <= 7; ahead++) {
    const date = addDays(today, ahead);
    if (ttDayOfWeek(ttInstant(date, 12)) !== target.dow) continue;
    const cutoff = ttInstant(addDays(date, -1), REGULAR_CUTOFF_HOUR);
    if (cutoff.getTime() > now.getTime()) return { date, cutoff };
    return null; // this week's slot has closed
  }
  return null;
}
