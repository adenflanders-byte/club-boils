import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db, audit } from "@/lib/server/db";
import { hashAccessCode, accessCodeProblem } from "@/lib/server/crypto";

// Set, replace or disable an event's access code. Only a salted hash is
// stored; the plain code is never saved, logged or returned. Any change
// signs out every student session for the event.
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const b = await readJson<{ code?: unknown; disable?: unknown }>(req, 2_000);
  const { data: ev } = await db().from("school_events").select("id, access_code_version").eq("id", id).maybeSingle();
  if (!ev) throw new HttpError(404, "Event not found.");

  let hash: string | null = null;
  if (b.disable !== true) {
    const problem = accessCodeProblem(b.code);
    if (problem) throw new HttpError(400, problem);
    hash = await hashAccessCode(String(b.code));
  }
  const { error } = await db().from("school_events")
    .update({ access_code_hash: hash, access_code_version: ev.access_code_version + 1 }).eq("id", id);
  if (error) throw new HttpError(400, "Could not save the access code.");
  await db().from("event_sessions").update({ revoked_at: new Date().toISOString() }).eq("event_id", id).is("revoked_at", null);
  await audit({ actor: admin.email, action: hash ? "school_event.access_code_set" : "school_event.access_code_disabled",
    entityType: "school_event", entityId: id, meta: { sessions_revoked: true } });
  return json({ ok: true, hasAccessCode: hash !== null });
});
