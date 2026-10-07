import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
// connect-src: own origin + Supabase (Realtime later, https + wss).
const connect = [
  "'self'",
  ...(supabase ? [supabase, supabase.replace(/^http/, "ws")] : []),
  ...(isDev ? ["ws:"] : []), // HMR
];

// ponytail: 'unsafe-inline' scripts because Next emits inline bootstrap
// scripts and nonces need dynamic rendering via proxy.ts; move to nonce CSP
// (docs/01-app/02-guides/content-security-policy) if user-generated HTML ever appears.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'", // sprites/UI use style={{}}; fonts self-hosted by next/font
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connect.join(" ")}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Painted art never changes under the same name in a deploy for long: cache hard, revalidate in the background.
        source: "/art/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
