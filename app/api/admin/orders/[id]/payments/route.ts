import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db } from "@/lib/server/db";
import { cleanText, LIMITS } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// Payment ledger for one order.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  const { data, error } = await db().from("payments").select("*").eq("order_id", id).order("received_at");
  if (error) throw new HttpError(400, "Could not load payments.");
  return json({ data });
});

// Record money received (or refunded). Creates a ledger entry and an audit
// entry in one database transaction; never edits the order total.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const b = await readJson(req, 4_000);

  const kind = b.kind === "refund" ? "refund" : "payment";
  const method = ["cash", "bank_transfer", "online_provider", "other"].includes(String(b.method)) ? String(b.method) : null;
  if (!method) throw new HttpError(400, "Choose how the money was received.");
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) throw new HttpError(400, "Enter a valid amount.");
  const receivedAt = typeof b.receivedAt === "string" && !Number.isNaN(Date.parse(b.receivedAt)) ? new Date(b.receivedAt) : new Date();
  if (receivedAt.getTime() > Date.now() + 5 * 60_000) throw new HttpError(400, "The date received cannot be in the future.");
  const idem = typeof b.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(b.idempotencyKey) ? b.idempotencyKey : null;
  if (!idem) throw new HttpError(400, "Invalid request. Refresh and try again.");

  const { data, error } = await db().rpc("record_order_payment", {
    p_order_id: id, p_kind: kind, p_method: method, p_amount: amount, p_received_at: receivedAt.toISOString(),
    p_reference: cleanText(b.reference, LIMITS.reference), p_note: cleanText(b.note, LIMITS.notes),
    p_actor: admin.email, p_idempotency_key: idem,
  });
  if (error) {
    const m = error.message || "";
    if (m.includes("REFUND_EXCEEDS_PAID")) throw new HttpError(409, "A refund cannot be more than the amount paid.");
    if (m.includes("ORDER_CANCELLED")) throw new HttpError(409, "This order is cancelled. Reopen it before recording a payment.");
    if (m.includes("ORDER_NOT_FOUND")) throw new HttpError(404, "Order not found.");
    throw new HttpError(400, "Could not record the payment.");
  }
  return json({ result: data });
});
