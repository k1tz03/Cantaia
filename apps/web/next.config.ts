import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// `next dev` (Turbopack/webpack HMR + React Refresh) evaluates code through
// eval(), so 'unsafe-eval' is required locally — but NEVER in production.
// 'unsafe-inline' stays in both: Next.js injects inline bootstrap scripts and
// we do not emit per-request nonces (that would require middleware-generated
// CSP headers and `next/script` nonce plumbing on every page).
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  isDev ? "'unsafe-eval'" : null,
  "https://js.stripe.com https://*.sentry.io",
]
  .filter(Boolean)
  .join(" ");

const nextConfig: NextConfig = {
  eslint: {
    // Lint is handled separately in CI (pnpm lint) — not during next build
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    "@cantaia/ui",
    "@cantaia/core",
    "@cantaia/database",
    // 3D viewer stack — ships ES modules, needs transpile to avoid
    // "Cannot use import statement outside a module" at build time even though
    // the <Canvas> is dynamic({ ssr: false }). Added in ADR-001 (3D spike W1-W3).
    "three",
    "@react-three/fiber",
    "@react-three/drei",
  ],
  serverExternalPackages: ["ffmpeg-static", "pdf-parse", "pdfjs-dist", "@react-pdf/renderer", "@react-pdf/pdfkit", "@react-pdf/yoga"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      // Redirect www to canonical apex domain
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cantaia.io" }],
        destination: "https://cantaia.io/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // No `http:` — remote images must be served over TLS. `https:` stays
              // broad because email HTML embeds arbitrary third-party image hosts.
              "img-src 'self' data: blob: https:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.sentry.io https://api.stripe.com https://login.microsoftonline.com https://graph.microsoft.com",
              "frame-src 'self' https://js.stripe.com https://*.supabase.co https://*.supabase.in",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'self' https://*.supabase.co https://*.supabase.in",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
