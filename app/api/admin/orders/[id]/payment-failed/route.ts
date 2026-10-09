import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db } from "@/lib/server/db";
import { cleanText } from "@/lib/validation";

// Mark a payment as failed/cancelled (only possible when nothing was received).
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const b = await readJson(req, 4_000);
  const { error } = await db().rpc("mark_order_payment_failed", {
    p_order_id: id, p_actor: admin.email, p_note: cleanText(b.note, 300) || null,
  });
  if (error) {
    if ((error.message || "").includes("ORDER_HAS_PAYMENTS")) throw new HttpError(409, "Money has been received for this order. Record a refund instead.");
    throw new HttpError(400, "Could not update the payment status.");
  }
  return json({ ok: true });
});
