import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

/**
 * GET /api/mail/image-proxy?url=...
 *
 * Proxies images from authenticated Microsoft Graph / Outlook servers.
 * The browser can't fetch these directly because they need a Bearer token.
 * This route fetches them server-side with the user's token and streams back.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Only proxy Microsoft/Office domains — prevent SSRF
  const ALLOWED_HOSTS = [
    "outlook.office365.com",
    "outlook.office.com",
    "attachments.office.net",
    "graph.microsoft.com",
    "outlook.live.com",
    "content.one.outlook.com",
  ];

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  const isAllowed = ALLOWED_HOSTS.some(
    (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
  );
  if (!isAllowed) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Get Microsoft token
  const tokenResult = await getValidMicrosoftToken(user.id);
  if ("error" in tokenResult) {
    return new NextResponse("Microsoft token unavailable", { status: 502 });
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    });

    if (!res.ok) {
      return new NextResponse("Upstream error", { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    console.error("[image-proxy] Fetch error:", err?.message);
    return new NextResponse("Failed to fetch image", { status: 502 });
  }
}
