import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * Be precise about what this buys. Next.js inlines its bootstrap script and
 * hydration payload into every page, so scripts need `'unsafe-inline'`. The
 * only way to drop it is a per-request nonce with `'strict-dynamic'`, which
 * would mean middleware on every route (today it runs only under /staff, for
 * the sign-in redirects) and dynamic rendering of every page, since a
 * prerendered page such as / or /privacy cannot carry a per-request nonce. A
 * page missed by either change would have its scripts blocked and never
 * hydrate. Styles need `'unsafe-inline'` for the inline `style` attributes the
 * app renders, which a nonce cannot cover: the status breakdown bars, the
 * progress tracker's columns and the self-contained global error page. That
 * means this policy does **not** stop an injected inline `<script>` element —
 * the application's defence against that remains React escaping every value it
 * renders, with no `dangerouslySetInnerHTML` anywhere in the codebase.
 *
 * What it does stop is worth having: script and connection sources outside this
 * origin, inline event-handler attributes, plugins and embedded objects, frames
 * and workers, `<base>` tag hijacking, form posts to another origin, and
 * framing by any site at all.
 *
 * Development additionally needs `'unsafe-eval'` and a websocket connection for
 * React Fast Refresh; neither is present in a production response.
 */
function contentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // Nothing here, Next.js included, embeds a frame or starts a worker.
    "frame-src 'none'",
    "worker-src 'none'",
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
    // React attaches event handlers from script and never renders `on*`
    // attributes, so inline handlers are refused outright.
    "script-src-attr 'none'",
    isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    // No `upgrade-insecure-requests`: every subresource is a same-origin
    // relative URL, so over HTTPS it changes nothing, while a production build
    // viewed over plain HTTP (a LAN address, or localhost in Safari) would have
    // its /_next/static requests upgraded to https and fail.
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
