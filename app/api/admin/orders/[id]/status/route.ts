import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db } from "@/lib/server/db";
import { cleanText } from "@/lib/validation";

// Order (kitchen/collection) status. Separate from payment status.
// Moving backwards or undoing Collected/Cancelled needs a reason and is audited.
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const b = await readJson(req, 4_000);
  const status = String(b.status);
  if (!["new", "confirmed", "preparing", "ready", "completed", "cancelled"].includes(status)) throw new HttpError(400, "Invalid status.");
  const { data, error } = await db().rpc("set_order_status", {
    p_order_id: id, p_status: status, p_actor: admin.email, p_reason: cleanText(b.reason, 300) || null,
  });
  if (error) {
    if ((error.message || "").includes("CORRECTION_REASON_REQUIRED")) {
      throw new HttpError(409, "Please give a reason for this correction.", "REASON_REQUIRED");
    }
    throw new HttpError(400, "Could not change the status.");
  }
  return json({ result: data });
});
