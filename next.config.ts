import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * Be precise about what this buys. Next.js inlines its hydration payload and a
 * small bootstrap script, so scripts need `'unsafe-inline'` unless every
 * response is rendered with a per-request nonce. Styles need it for the inline
 * `style` attributes the app renders: the status breakdown bars, the progress
 * tracker's columns and the self-contained global error page. That means this
 * policy does **not** stop an injected inline script — the application's
 * defence against that remains React escaping every value it renders, with no
 * `dangerouslySetInnerHTML` anywhere in the codebase.
 *
 * What it does stop is worth having: script and connection sources outside this
 * origin, plugins and embedded objects, `<base>` tag hijacking, form posts to
 * another origin, and framing by any site at all.
 *
 * Development additionally needs `'unsafe-eval'` and a websocket connection for
 * React Fast Refresh; neither is present in a production response.
 */
function contentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    // next/font self-hosts Inter and JetBrains Mono at build time, so no
    // third-party font origin is needed.
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
  ];

  return directives.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Redundant with frame-ancestors for modern browsers, kept for older ones.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Only meaningful over HTTPS, and actively unhelpful on a local http origin,
  // so it is sent in production only. No preload: that is a decision for
  // whoever owns the domain, not a default.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=15552000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    dirs: ["src", "prisma", "scripts"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
