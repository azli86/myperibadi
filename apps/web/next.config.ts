import type { NextConfig } from "next";

const apiInternalOrigin = process.env.WEB_API_INTERNAL_ORIGIN || "http://127.0.0.1:8023";

// Local/dev over plain HTTP (phone LAN): do NOT force HTTPS or HSTS.
// Production keeps upgrade-insecure-requests + HSTS.
const isProdSecure = process.env.NODE_ENV === "production";

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // Cloudflare Turnstile requires challenges.cloudflare.com (+ static CDN assets)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://www.google.com https://www.gstatic.com https://apis.google.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://challenges.cloudflare.com",
  "font-src 'self' data: blob: https://fonts.gstatic.com https://challenges.cloudflare.com https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  // Dev: allow http/ws for LAN phone testing (http://192.168.x.x:3000)
  isProdSecure
    ? "connect-src 'self' https: wss: blob: data:"
    : "connect-src 'self' http: https: ws: wss: blob: data:",
  "frame-src 'self' blob: data: https://challenges.cloudflare.com https://www.google.com https://www.recaptcha.net https://www.openstreetmap.org https://*.firebaseapp.com https:",
  "child-src 'self' blob: https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isProdSecure ? ["upgrade-insecure-requests"] : []),
];

const securityHeaders = [
  ...(isProdSecure
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self)",
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
      {
        source: "/build-version.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
      {
        source: "/offline",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
      {
        source: "/assets/videos/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/mcp",
          destination: `${apiInternalOrigin}/mcp`,
        },
        {
          source: "/api/realtime",
          destination: `${apiInternalOrigin}/api/realtime`, // SSE realtime (keep /api prefix)
        },
        {
          source: "/api/bank-reconciliation/parse",
          destination: `${apiInternalOrigin}/api/bank-reconciliation/parse`, // exact multipart upload proxy
        },
        {
          source: "/api/transcribe",
          destination: `${apiInternalOrigin}/api/transcribe`, // voice transcription proxy (keep /api prefix)
        },
        {
          source: "/api/whatsapp/webhook",
          destination: "/_not-found",
        },
        {
          source: "/api/internal/whatsapp/:path*",
          destination: "/_not-found",
        },
      ],
      afterFiles: [
        {
          source: "/p/:token",
          destination: `${apiInternalOrigin}/p/:token`,
        },
        {
          source: "/api/:path*",
          destination: `${apiInternalOrigin}/:path*`, // Proxy to Backend Server
        },
      ],
      fallback: [],
    }
  },
};

export default nextConfig;
