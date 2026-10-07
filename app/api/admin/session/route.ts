import { handle, json } from "@/lib/server/http";
import { getAdmin } from "@/lib/server/adminAuth";

export const GET = handle(async (req: Request) => {
  const admin = await getAdmin(req);
  if (!admin) return json({ authenticated: false }, 401);
  return json({ authenticated: true, email: admin.email });
});
