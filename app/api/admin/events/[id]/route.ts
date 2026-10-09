import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db, audit } from "@/lib/server/db";
import { parseEventInput, adminEventView, eventTotals, SCHEDULE_FIELDS, type ReportOrder, type ReportPayment } from "@/lib/server/eventAdmin";
import type { SchoolEventRow } from "@/lib/events";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

async function loadEventById(id: string): Promise<SchoolEventRow> {
  if (!UUID.test(id)) throw new HttpError(404, "Event not found.");
  const { data } = await db().from("school_events").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Event not found.");
  return data as SchoolEventRow;
}

// Event + its orders + payment ledger + dashboard totals.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  const ev = await loadEventById(id);
  const { data: orders, error } = await db().from("orders").select("*").eq("school_event_id", ev.id).order("created_at");
  if (error) throw new HttpError(400, "Could not load orders.");
  const ids = (orders ?? []).map(o => o.id);
  const { data: payments } = ids.length
    ? await db().from("payments").select("*").in("order_id", ids).order("received_at")
    : { data: [] as ReportPayment[] };
  return json({
    event: adminEventView(ev),
    orders: orders ?? [],
    payments: payments ?? [],
    totals: eventTotals((orders ?? []) as ReportOrder[], (payments ?? []) as ReportPayment[]),
  });
});

// Edit settings, open/close/archive. Date or time changes must be confirmed
// and are audited; they never rewrite orders already placed.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const before = await loadEventById(id);
  const b = await readJson(req);

  let update: Record<string, unknown> = {};
  if (b.settings && typeof b.settings === "object") {
    update = { ...parseEventInput(b.settings as Record<string, unknown>) };
    const scheduleChanged = SCHEDULE_FIELDS.some(f =>
      f === "event_date" ? update[f] !== before[f] : new Date(String(update[f])).getTime() !== new Date(before[f]).getTime());
    if (scheduleChanged && b.confirmScheduleChange !== true) {
      throw new HttpError(409, "You are changing the event date or times. Please confirm this change.", "SCHEDULE_CONFIRM_REQUIRED");
    }
  }
  if (b.status !== undefined) {
    if (!["draft", "open", "closed", "archived"].includes(String(b.status))) throw new HttpError(400, "Invalid status.");
    update.status = b.status;
  }
  if (Object.keys(update).length === 0) throw new HttpError(400, "Nothing to change.");

  const { data, error } = await db().from("school_events").update(update).eq("id", id).select("*").single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "That link name is already used by another event.");
    throw new HttpError(400, "Could not save the event.");
  }
  const changed = Object.keys(update).filter(k =>
    JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify((data as Record<string, unknown>)[k]));
  if (changed.length) {
    await audit({
      actor: admin.email,
      action: changed.some(k => (SCHEDULE_FIELDS as readonly string[]).includes(k)) ? "school_event.schedule_changed" : "school_event.updated",
      entityType: "school_event", entityId: id,
      before: Object.fromEntries(changed.map(k => [k, (before as unknown as Record<string, unknown>)[k]])),
      after: Object.fromEntries(changed.map(k => [k, (data as Record<string, unknown>)[k]])),
    });
  }
  return json({ data: adminEventView(data as SchoolEventRow) });
});
