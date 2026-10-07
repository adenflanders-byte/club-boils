import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

// Runs before /admin, /accounts and the admin API. Rejects requests without a
// validly signed, unexpired admin session cookie. (Each API route also checks
// the session against the database, so revoked sessions are refused there.)

function hasValidAdminCookie(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  const token = req.cookies.get("cb_admin")?.value;
  if (!secret || !token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const [kind, , exp] = Buffer.from(body, "base64url").toString().split("|");
  return kind === "admin" && Number(exp) * 1000 > Date.now();
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/admin/login";
  const isAuthApi = pathname === "/api/admin/login" || pathname === "/api/admin/logout" || pathname === "/api/admin/session";
  if (isLoginPage || isAuthApi) return NextResponse.next();

  if (hasValidAdminCookie(req)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in again.", code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/accounts", "/accounts/:path*", "/api/admin/:path*"],
};
