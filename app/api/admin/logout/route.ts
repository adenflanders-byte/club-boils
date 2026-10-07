import { handle, json, assertSameOrigin } from "@/lib/server/http";
import { adminLogout } from "@/lib/server/adminAuth";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const cookie = await adminLogout(req);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
});
