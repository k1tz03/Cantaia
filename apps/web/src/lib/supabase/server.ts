import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@cantaia/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                maxAge: 60 * 60 * 24 * 7, // 7 days
                sameSite: "lax" as const,
                secure: process.env.NODE_ENV === "production",
                httpOnly: true,
                path: "/",
              })
            );
          } catch {
            // Server Components can't set cookies — ignore
          }
        },
      },
    }
  );
}
