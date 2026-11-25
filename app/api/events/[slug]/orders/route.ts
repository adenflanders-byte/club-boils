import { handle, json, readJson } from "@/lib/server/http";
import { loadVisibleEvent, requireEventSession } from "@/lib/server/events";
import { placeEventOrder } from "@/lib/server/orders";
import { sendNewOrderNotification } from "@/lib/server/orderNotifications";
import { after } from "next/server";

// School-event checkout. Requires a valid event session; the cutoff is
// enforced here and again by the database.
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const ev = await loadVisibleEvent(slug);
  await requireEventSession(req, ev);
  const body = await readJson(req);
  const placed = await placeEventOrder(ev, body);
  const { receipt, notification } = placed;
  if (notification) after(() => sendNewOrderNotification(notification));
  return json({ order: receipt }, receipt.duplicate ? 200 : 201);
});
