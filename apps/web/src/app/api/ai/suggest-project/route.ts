import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const body = await req.json();
  const { recipients, subject, body_preview } = body as {
    recipients?: string[];
    subject?: string;
    body_preview?: string;
  };

  if (!subject && !recipients?.length) {
    return NextResponse.json({ project_id: null });
  }

  // Get user profile
  const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();
  if (!profile?.organization_id) return NextResponse.json({ project_id: null });

  // Get org projects
  const { data: projects } = await admin
    .from("projects")
    .select("id, name, code, email_keywords, email_senders, client_name")
    .eq("organization_id", profile.organization_id)
    .in("status", ["active", "planning"]);

  if (!projects?.length) return NextResponse.json({ project_id: null });

  // Simple keyword matching first (fast, no AI needed)
  for (const project of projects) {
    const keywords = project.email_keywords || [];
    const senders = project.email_senders || [];
    const textToSearch = [subject, body_preview, ...(recipients || [])].join(" ").toLowerCase();

    // Check if any recipient matches project senders
    if (recipients?.some((r) => senders.some((s: string) => r.toLowerCase().includes(s.toLowerCase())))) {
      return NextResponse.json({ project_id: project.id, project_name: project.name, confidence: 0.9, method: "sender_match" });
    }

    // Check keywords
    if (keywords.some((kw: string) => textToSearch.includes(kw.toLowerCase()))) {
      return NextResponse.json({ project_id: project.id, project_name: project.name, confidence: 0.8, method: "keyword_match" });
    }

    // Check project name/code in subject
    if (subject && (subject.toLowerCase().includes(project.name.toLowerCase()) || (project.code && subject.toLowerCase().includes(project.code.toLowerCase())))) {
      return NextResponse.json({ project_id: project.id, project_name: project.name, confidence: 0.85, method: "name_match" });
    }
  }

  // No match found via keywords — return null (skip AI to save costs)
  return NextResponse.json({ project_id: null });
}
