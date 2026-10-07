import { handle, json, assertSameOrigin, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db } from "@/lib/server/db";

// Copy an event's settings into a new draft (no orders, payments, sessions or code).
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { data, error } = await db().rpc("duplicate_school_event", { p_event_id: id, p_actor: admin.email });
  if (error) throw new HttpError(400, "Could not duplicate the event.");
  return json({ id: data }, 201);
});
