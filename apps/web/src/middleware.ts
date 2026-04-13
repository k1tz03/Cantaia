import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { createMiddlewareClient } from "./lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

const protectedPaths = [
  "/action-board",
  "/dashboard",
  "/projects",
  "/tasks",
  "/settings",
  "/briefing",
  "/direction",
  "/admin",
  "/super-admin",
  "/submissions",
  "/mail",
  "/calendar",
  "/pv",
  "/pv-chantier",
  "/suppliers",
  "/plans",
  "/visits",
  "/chat",
  "/support",
  "/cantaia-prix",
  "/site-reports",
  "/onboarding",
];

// ─── Pre-launch teaser gate ─────────────────────────────────────────────
// Every unauthenticated visitor is redirected to /{locale}/soon until
// launch day. Julien bypasses with ?preview=<CANTAIA_PREVIEW_SECRET>.
const BYPASS_COOKIE = "cantaia_preview";
const BYPASS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Paths that must remain reachable even when the teaser gate is active.
// (Auth routes so the bypass + existing logins keep working; public-share
// routes so already-distributed links don't 404; the teaser page itself
// so we don't create a redirect loop.)
const TEASER_ALLOWLIST_REGEX =
  /^\/(fr|en|de)\/(soon|login|register|forgot-password|reset-password|admin-consent)(\/.*)?$/;

// Public sub-routes under app/[locale]/(public)/* that pre-date the teaser
// (shared plannings, shared reports, portal PIN gate). We leave them open.
const TEASER_PUBLIC_ROUTES_REGEX = /^\/(fr|en|de)\/(planning|portal)\/[^/]+/;

// API routes that must never be gated (already excluded via early return,
// but kept here as a reference for the allowlist intent).
// - /api/waitlist/subscribe — teaser form submit
// - /api/auth/* — OAuth callbacks
// - /api/portal/* — PIN auth for field crew

/**
 * Constant-time string comparison, Edge-runtime compatible.
 * Never short-circuits on mismatch — always scans both strings fully
 * so timing cannot reveal how many characters matched.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Detects a Supabase auth session by looking for the `sb-*-auth-token`
 * cookie (set by @supabase/ssr). We do NOT call getUser() here — that
 * would add a DB round-trip to every public request. The cookie presence
 * is sufficient because:
 *   (1) It's httpOnly and same-site, so it can't be spoofed trivially,
 *   (2) Any protected route already re-validates via supabase.auth.getUser(),
 *   (3) Worst case of a stale cookie is a logged-out user sees the real
 *       homepage — no security regression.
 */
function hasSupabaseSession(request: NextRequest): boolean {
  for (const cookie of request.cookies.getAll()) {
    if (/^sb-.*-auth-token(\.\d+)?$/.test(cookie.name) && cookie.value) {
      return true;
    }
  }
  return false;
}

/**
 * Handles the teaser gate for unauthenticated public traffic.
 *
 * Returns:
 *   - NextResponse to short-circuit the middleware (redirect / cookie set)
 *   - null to let the normal middleware chain continue
 */
function handleTeaserGate(
  request: NextRequest,
  pathname: string,
): NextResponse | null {
  const previewSecret = process.env.CANTAIA_PREVIEW_SECRET;

  // Dev ergonomics: if no secret is configured we disable the gate
  // entirely so local dev and CI don't need the env var.
  if (!previewSecret) return null;

  // 1. `?preview=<secret>` → validate, set cookie, strip query, redirect.
  const previewParam = request.nextUrl.searchParams.get("preview");
  if (previewParam !== null) {
    if (timingSafeEqual(previewParam, previewSecret)) {
      const cleanUrl = new URL(request.nextUrl);
      cleanUrl.searchParams.delete("preview");
      const res = NextResponse.redirect(cleanUrl, 307);
      res.cookies.set(BYPASS_COOKIE, "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: BYPASS_COOKIE_MAX_AGE,
      });
      return res;
    }
    // Wrong secret → fall through to normal gate (don't hint at existence).
  }

  // 2. Already bypassed via cookie → no gate.
  if (request.cookies.get(BYPASS_COOKIE)?.value === "1") return null;

  // 3. Logged-in Supabase user → no gate.
  if (hasSupabaseSession(request)) return null;

  // 4. Teaser page itself, auth routes, and pre-existing public shares
  //    must not be gated (would cause redirect loops or break shared links).
  if (TEASER_ALLOWLIST_REGEX.test(pathname)) return null;
  if (TEASER_PUBLIC_ROUTES_REGEX.test(pathname)) return null;

  // 5. Everything else → redirect to the teaser.
  const localeMatch = pathname.match(/^\/(fr|en|de)(\/|$)/);
  const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;
  const target = new URL(`/${locale}/soon`, request.url);
  return NextResponse.redirect(target, 307);
}

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

const BASE_DOMAIN = process.env.BASE_DOMAIN || "cantaia.io";

const RESERVED_SUBDOMAINS = [
  "www", "app", "api", "admin", "super-admin", "superadmin",
  "mail", "smtp", "ftp", "dev", "staging", "test", "demo",
  "help", "support", "docs", "status", "blog", "cdn", "static",
];

/**
 * Resolve subdomain from the request host.
 * In production: "hrs.cantaia.io" → "hrs"
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

  // ─── Pre-launch teaser gate ───────────────────────────────
  // Runs before intl + auth so every unauthenticated visitor lands on
  // /{locale}/soon. Returns null when the request is already authorized
  // (bypass cookie, Supabase session, or allowlisted path).
  const teaserResponse = handleTeaserGate(request, pathname);
  if (teaserResponse) {
    if (subdomain) {
      teaserResponse.headers.set("x-organization-subdomain", subdomain);
    }
    return teaserResponse;
  }

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
    // - Next.js special image convention routes (opengraph-image, icon, apple-icon, favicon, sitemap, robots)
    "/((?!_next|.*\\..*|opengraph-image|apple-icon|icon|favicon\\.ico|sitemap\\.xml|robots\\.txt|manifest\\.json).*)",
  ],
};
