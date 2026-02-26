import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { createMiddlewareClient } from "./lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

const protectedPaths = [
  "/dashboard",
  "/projects",
  "/tasks",
  "/meetings",
  "/settings",
  "/briefing",
  "/direction",
  "/admin",
  "/super-admin",
  "/analytics",
  "/api-costs",
  "/clients",
  "/debug",
  "/logs",
  "/submissions",
  "/mail",
  "/pv",
  "/suppliers",
  "/pricing-intelligence",
  "/plans",
  "/visits",
];

function isProtectedPath(pathname: string): boolean {
  // Strip locale prefix (e.g., /fr/dashboard -> /dashboard)
  const pathWithoutLocale = pathname.replace(/^\/(fr|en|de)/, "");
  return protectedPaths.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + "/")
  );
}

const hasSupabaseConfig =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BASE_DOMAIN = process.env.BASE_DOMAIN || "cantaia.ch";

const RESERVED_SUBDOMAINS = [
  "www", "app", "api", "admin", "super-admin", "superadmin",
  "mail", "smtp", "ftp", "dev", "staging", "test", "demo",
  "help", "support", "docs", "status", "blog", "cdn", "static",
];

/**
 * Resolve subdomain from the request host.
 * In production: "hrs.cantaia.ch" → "hrs"
 * In dev: uses ?org=hrs query param or x-organization-subdomain header
 */
function resolveSubdomain(request: NextRequest): string | null {
  const host = request.headers.get("host") || "";

  // Dev fallback: query param or header
  if (process.env.NODE_ENV === "development" || host.includes("localhost") || host.includes("127.0.0.1")) {
    const devOrg = request.nextUrl.searchParams.get("org")
      || request.headers.get("x-organization-subdomain");
    return devOrg || null;
  }

  // Production: extract subdomain from host
  const baseDomain = BASE_DOMAIN.replace(/^www\./, "");
  if (!host.endsWith(`.${baseDomain}`)) return null;

  const subdomain = host.replace(`.${baseDomain}`, "").split(":")[0];
  if (!subdomain || subdomain === baseDomain || RESERVED_SUBDOMAINS.includes(subdomain)) {
    return null;
  }

  return subdomain;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip intl middleware entirely for API routes — they must not get locale prefixes
  if (pathname.startsWith("/api")) {
    // For API routes, still pass subdomain as header
    const subdomain = resolveSubdomain(request);
    const response = NextResponse.next();
    if (subdomain) {
      response.headers.set("x-organization-subdomain", subdomain);
    }
    return response;
  }

  // Resolve subdomain
  const subdomain = resolveSubdomain(request);

  // Run intl middleware for all non-API routes
  const intlResponse = intlMiddleware(request);

  // Pass subdomain info as response header (accessible by server components)
  if (subdomain) {
    intlResponse.headers.set("x-organization-subdomain", subdomain);
  }

  // Skip Supabase auth if env vars not configured yet
  if (!hasSupabaseConfig) {
    return intlResponse;
  }

  // For protected routes, check Supabase auth session and refresh tokens
  if (isProtectedPath(pathname)) {
    const { supabase, response } = createMiddlewareClient(
      request,
      intlResponse
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const localeMatch = pathname.match(/^\/(fr|en|de)/);
      const locale = localeMatch ? localeMatch[1] : "fr";

      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("redirectTo", pathname);
      if (subdomain) {
        loginUrl.searchParams.set("org", subdomain);
      }
      return NextResponse.redirect(loginUrl);
    }

    if (subdomain) {
      response.headers.set("x-organization-subdomain", subdomain);
    }

    return response;
  }

  // For non-protected routes, still set up cookie handling (no getUser call)
  const { response } = createMiddlewareClient(request, intlResponse);
  if (subdomain) {
    response.headers.set("x-organization-subdomain", subdomain);
  }
  return response;
}

export const config = {
  matcher: [
    // Match all pathnames except for
    // - API routes (handled separately above for auth callback)
    // - _next (Next.js internals)
    // - static files (images, fonts, etc.)
    "/((?!_next|.*\\..*).*)",
  ],
};
