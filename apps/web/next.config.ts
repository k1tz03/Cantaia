import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  eslint: {
    // Lint is handled separately in CI (pnpm lint) — not during next build
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["@cantaia/ui", "@cantaia/core", "@cantaia/database"],
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.sentry.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https: http:",
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
