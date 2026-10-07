import { handle, json, readJson } from "@/lib/server/http";
import { loadVisibleEvent, grantEventAccess } from "@/lib/server/events";

// Checks the event access code on the server (rate-limited). The code is
// never logged or echoed back.
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const ev = await loadVisibleEvent(slug);
  const body = await readJson<{ code?: unknown }>(req, 2_000);
  const cookie = await grantEventAccess(req, ev, body.code);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
});
