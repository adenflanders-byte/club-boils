import { handle, json, assertSameOrigin, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db, audit } from "@/lib/server/db";

// Immediately sign out every student on this event (they must re-enter the code).
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { data: ev } = await db().from("school_events").select("id, access_code_version").eq("id", id).maybeSingle();
  if (!ev) throw new HttpError(404, "Event not found.");
  await db().from("school_events").update({ access_code_version: ev.access_code_version + 1 }).eq("id", id);
  await db().from("event_sessions").update({ revoked_at: new Date().toISOString() }).eq("event_id", id).is("revoked_at", null);
  await audit({ actor: admin.email, action: "school_event.sessions_revoked", entityType: "school_event", entityId: id });
  return json({ ok: true });
});
