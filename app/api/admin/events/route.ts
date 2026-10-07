import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db, audit } from "@/lib/server/db";
import { parseEventInput, adminEventView } from "@/lib/server/eventAdmin";
import type { SchoolEventRow } from "@/lib/events";

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const { data, error } = await db().from("school_events").select("*").order("event_date", { ascending: false });
  if (error) throw new HttpError(400, "Could not load events.");
  return json({ data: (data as SchoolEventRow[]).map(adminEventView) });
});

// New events always start as drafts with no access code.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin(req);
  const input = parseEventInput(await readJson(req));
  const { data, error } = await db().from("school_events").insert({ ...input, status: "draft" }).select("*").single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "That link name is already used by another event.");
    throw new HttpError(400, "Could not create the event.");
  }
  await audit({ actor: admin.email, action: "school_event.created", entityType: "school_event", entityId: data.id, after: adminEventView(data) });
  return json({ data: adminEventView(data as SchoolEventRow) }, 201);
});
