import { handle, json, readJson } from "@/lib/server/http";
import { adminLogin } from "@/lib/server/adminAuth";

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ email?: unknown; password?: unknown }>(req, 2_000);
  const { cookie, email } = await adminLogin(req, body.email, body.password);
  return json({ ok: true, email }, 200, { "Set-Cookie": cookie });
});
