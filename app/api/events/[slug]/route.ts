import { handle, json } from "@/lib/server/http";
import { loadVisibleEvent, publicEventInfo, eventDetails, hasEventSession } from "@/lib/server/events";
import { loadSettings } from "@/lib/server/orders";
import { publicMenu } from "@/lib/menu";

// Event page data. Before the access code: school, date, collection window
// and whether ordering is open. After: full details and the live menu.
export const GET = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const ev = await loadVisibleEvent(slug);
  if (!(await hasEventSession(req, ev))) {
    return json({ event: publicEventInfo(ev), access: false });
  }
  const settings = await loadSettings();
  return json({
    event: eventDetails(ev),
    access: true,
    menu: publicMenu(settings, ev.hidden_item_ids).filter(i => i.active),
    serverTime: new Date().toISOString(),
  });
});
