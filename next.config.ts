import type { NextConfig } from "next";

const noIndex = { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" };
const security = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: security },
      { source: "/school-orders/:path*", headers: [noIndex, { key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/admin/:path*", headers: [noIndex] },
      { source: "/admin", headers: [noIndex] },
      { source: "/accounts", headers: [noIndex] },
      { source: "/api/:path*", headers: [noIndex] },
    ];
  },
};

export default nextConfig;
