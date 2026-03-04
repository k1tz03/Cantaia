import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@cantaia/database";

/**
 * Creates a Supabase client for use in Next.js middleware.
 * When getUser() triggers a token refresh, the new cookies
 * are set on both the request (for downstream reads) and the response
 * (so the browser receives the refreshed tokens).
 */
export function createMiddlewareClient(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) {
          // Update request cookies so subsequent reads see the new values
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // Set the updated cookies on the response for the browser
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...(options as Record<string, unknown>),
              maxAge: 60 * 60 * 24 * 7, // 7 days
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
            } as never);
          });
        },
      },
    }
  );

  return { supabase, response };
}
