import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractTasks } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["email_id"]);
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 503 }
    );
  }

  const adminClient = createAdminClient();

  // Get the email
  const { data: email, error: emailError } = await adminClient
    .from("email_records")
    .select("*")
    .eq("id", body.email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Get project context if email is assigned to one
  let projectContext = { name: "Non classé" };
  if (email.project_id) {
    const { data: project } = await adminClient
      .from("projects")
      .select("name")
      .eq("id", email.project_id)
      .maybeSingle();
    if (project) {
      projectContext = { name: project.name };
    }
  }

  // Get user org for tracking
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const result = await extractTasks(
    anthropicApiKey,
    {
      sender_email: email.sender_email,
      sender_name: email.sender_name || "",
      subject: email.subject,
      body: email.body_preview || "",
    },
    projectContext,
    undefined,
    (usage) => {
      trackApiUsage({
        supabase: adminClient,
        userId: user.id,
        organizationId: userOrg?.organization_id ?? "",
        actionType: "task_extract",
        apiProvider: "anthropic",
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        metadata: { email_id: body.email_id },
      });
    }
  );

  return NextResponse.json({ success: true, tasks: result.tasks });
}
