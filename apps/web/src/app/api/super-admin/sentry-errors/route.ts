import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  // Verify super-admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData } = await (admin.from("users") as any)
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!userData?.is_superadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG || "cantaia";
  const project = process.env.SENTRY_PROJECT || "cantaia-web";

  if (!token) {
    return NextResponse.json({ errors: [], total: 0, configured: false });
  }

  try {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&sort=date&limit=10`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({
        errors: [],
        total: 0,
        configured: true,
        error: "API error",
      });
    }

    const issues = await res.json();

    return NextResponse.json({
      configured: true,
      total: issues.length,
      errors: issues.map((issue: any) => ({
        id: issue.id,
        title: issue.title,
        culprit: issue.culprit,
        count: issue.count,
        lastSeen: issue.lastSeen,
        level: issue.level,
        permalink: issue.permalink,
      })),
    });
  } catch {
    return NextResponse.json({
      errors: [],
      total: 0,
      configured: true,
      error: "Sentry inaccessible",
    });
  }
}
