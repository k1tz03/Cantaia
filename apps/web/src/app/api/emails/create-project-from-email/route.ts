import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProjectStatus } from "@cantaia/database";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * POST /api/emails/create-project-from-email
 * Creates a new project from an email's suggested_project_data:
 * 1. Creates the project in the projects table
 * 2. Creates a project_member for the current user (as owner)
 * 3. Updates the email with the new project_id and classification_status = "confirmed"
 * 4. Adds extracted contacts to the project's email_senders array
 */
export async function POST(request: NextRequest) {
  console.log("[emails/create-project-from-email] Starting...");

  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get user's organization_id
  const admin = createAdminClient();
  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select("organization_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (userErr || !userRow) {
    console.log("[emails/create-project-from-email] ERROR: User not found:", userErr?.message);
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  if (!userRow.organization_id) {
    console.log("[emails/create-project-from-email] ERROR: User has no organization_id");
    return NextResponse.json(
      { error: "No organization associated with your account." },
      { status: 400 }
    );
  }

  // 3. Parse body
  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["email_id"]);
  if (requiredError || !body?.project?.name) {
    return NextResponse.json(
      { error: "email_id and project.name are required" },
      { status: 400 }
    );
  }

  const { email_id, project: projectInput } = body as {
    email_id: string;
    project: {
      name: string;
      code?: string;
      client_name?: string;
      city?: string;
    };
  };

  // 4. Verify the email belongs to this user and fetch suggested data
  const { data: email, error: fetchErr } = await admin
    .from("emails")
    .select("id, user_id, sender_email, suggested_project_data")
    .eq("id", email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !email) {
    console.log("[emails/create-project-from-email] Email not found:", email_id, fetchErr?.message);
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // 5. Collect email_senders from extracted contacts + email sender
  const emailSenders: string[] = [];
  const senderEmail = email.sender_email?.toLowerCase();
  if (senderEmail) {
    emailSenders.push(senderEmail);
  }

  const suggestedData = (email as Record<string, unknown>).suggested_project_data as {
    extracted_contacts?: { email: string }[];
  } | null;

  if (suggestedData?.extracted_contacts) {
    for (const contact of suggestedData.extracted_contacts) {
      const contactEmail = contact.email?.toLowerCase();
      if (contactEmail && !emailSenders.includes(contactEmail)) {
        emailSenders.push(contactEmail);
      }
    }
  }

  // 6. Create the project
  const projectData = {
    organization_id: userRow.organization_id,
    created_by: user.id,
    name: projectInput.name,
    code: projectInput.code || null,
    client_name: projectInput.client_name || null,
    city: projectInput.city || "Lausanne",
    status: "active" as ProjectStatus,
    currency: "CHF",
    color: "#6366F1",
    email_keywords: [] as string[],
    email_senders: emailSenders,
  };

  console.log("[emails/create-project-from-email] Creating project:", JSON.stringify(projectData));

  const { data: project, error: insertErr } = await admin
    .from("projects")
    .insert(projectData)
    .select()
    .single();

  if (insertErr) {
    console.error("[emails/create-project-from-email] ERROR creating project:", insertErr.message);
    return NextResponse.json(
      { error: `Failed to create project: ${insertErr.message}` },
      { status: 500 }
    );
  }

  console.log("[emails/create-project-from-email] Project created:", project.id, project.name);

  // 7. Create project_member (user as owner)
  const { error: memberErr } = await admin
    .from("project_members")
    .insert({
      project_id: project.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberErr) {
    console.error("[emails/create-project-from-email] WARNING: Failed to create project_member:", memberErr.message);
  } else {
    console.log("[emails/create-project-from-email] Project member created: user", user.id, "as owner of", project.id);
  }

  // 8. Update the email with the new project_id and confirm classification
  const { error: emailUpdateErr } = await admin
    .from("emails")
    .update({
      project_id: project.id,
      classification_status: "confirmed",
    } as Record<string, unknown>)
    .eq("id", email_id);

  if (emailUpdateErr) {
    console.error("[emails/create-project-from-email] WARNING: Failed to update email:", emailUpdateErr.message);
  } else {
    console.log("[emails/create-project-from-email] Email updated with project_id:", project.id);
  }

  return NextResponse.json({ success: true, project });
}
