import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/org-merge
 * Diagnostic: list ALL organizations linked to the current user via:
 * - users table (by auth ID and by email)
 * - email_connections table (connected email accounts)
 * - additional emails passed via ?also_email=xxx query param
 * Shows data counts per org to identify where "lost" data lives.
 *
 * Usage: /api/debug/org-merge?also_email=julien.ray@menetrey-sa.ch
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userProfile } = await admin.from("users").select("is_superadmin").eq("id", user.id).single();
  if (!userProfile?.is_superadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  // Additional emails to search for (comma-separated or multiple params)
  const alsoEmails = searchParams.getAll("also_email").flatMap(e => e.split(",")).filter(Boolean);

  // Current user row by auth ID
  const { data: currentUser } = await admin
    .from("users")
    .select("id, email, organization_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  // All emails to search: current auth email + any additional ones
  const allEmails = [user.email!, ...alsoEmails].filter(Boolean);
  const uniqueEmails = [...new Set(allEmails)];

  // Find ALL user rows matching any of these emails
  const { data: usersByEmail } = await admin
    .from("users")
    .select("id, email, organization_id, first_name, last_name, created_at")
    .in("email", uniqueEmails);

  // Find ALL email_connections for this user (by user_id)
  const { data: connectionsByUserId } = await admin
    .from("email_connections")
    .select("id, email_address, organization_id, provider, status")
    .eq("user_id", user.id);

  // Find ALL email_connections matching any of these emails
  const { data: connectionsByEmail } = await admin
    .from("email_connections")
    .select("id, user_id, email_address, organization_id, provider, status")
    .in("email_address", uniqueEmails);

  // Collect all unique org IDs from all sources
  const orgIds = new Set<string>();
  if (currentUser?.organization_id) orgIds.add(currentUser.organization_id);
  for (const u of usersByEmail || []) {
    if (u.organization_id) orgIds.add(u.organization_id);
  }
  for (const c of connectionsByUserId || []) {
    if (c.organization_id) orgIds.add(c.organization_id);
  }
  for (const c of connectionsByEmail || []) {
    if (c.organization_id) orgIds.add(c.organization_id);
  }

  // Get details for each organization
  const orgDetails = [];
  for (const orgId of orgIds) {
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, subscription_plan, created_at")
      .eq("id", orgId)
      .maybeSingle();

    const { count: projectCount } = await admin
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);

    const { data: projects } = await admin
      .from("projects")
      .select("id, name, code, client_name, city, status")
      .eq("organization_id", orgId);

    const projectIds = (projects || []).map(p => p.id);
    let taskCount = 0;
    let meetingCount = 0;
    if (projectIds.length > 0) {
      const { count: tc } = await admin
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .in("project_id", projectIds);
      taskCount = tc || 0;

      const { count: mc } = await admin
        .from("meetings")
        .select("*", { count: "exact", head: true })
        .in("project_id", projectIds);
      meetingCount = mc || 0;
    }

    // Count users in this org
    const { data: orgUsers } = await admin
      .from("users")
      .select("id, email")
      .eq("organization_id", orgId);

    // Count email connections in this org
    const { data: orgConnections } = await admin
      .from("email_connections")
      .select("id, email_address, provider")
      .eq("organization_id", orgId);

    orgDetails.push({
      org_id: orgId,
      org_name: org?.name || "Unknown",
      subscription_plan: org?.subscription_plan,
      created_at: org?.created_at,
      is_current: orgId === currentUser?.organization_id,
      project_count: projectCount || 0,
      projects: projects || [],
      task_count: taskCount,
      meeting_count: meetingCount,
      users: orgUsers || [],
      email_connections: orgConnections || [],
    });
  }

  // Sort: current org first, then by data richness
  orgDetails.sort((a, b) => {
    if (a.is_current) return -1;
    if (b.is_current) return 1;
    return (b.project_count + b.task_count + b.meeting_count) - (a.project_count + a.task_count + a.meeting_count);
  });

  const hasMultipleOrgs = orgDetails.length > 1;
  const richestOrg = [...orgDetails].sort((a, b) =>
    (b.project_count + b.task_count + b.meeting_count) - (a.project_count + a.task_count + a.meeting_count)
  )[0];

  return NextResponse.json({
    auth_user_id: user.id,
    auth_email: user.email,
    current_user: currentUser,
    organizations: orgDetails,
    recommendation: hasMultipleOrgs
      ? `Multiple organizations found (${orgDetails.length}). The richest org is "${richestOrg?.org_name}" (${richestOrg?.org_id}) with ${richestOrg?.project_count} projects, ${richestOrg?.task_count} tasks, ${richestOrg?.meeting_count} meetings. POST /api/debug/org-merge with { "target_org_id": "${richestOrg?.org_id}" } to merge all data into it.`
      : "Single organization — no merge needed.",
  });
}

/**
 * POST /api/debug/org-merge
 * Merge all data from ALL other organizations into target_org_id.
 * Body: { target_org_id: string }
 *
 * This merges across different emails (handles the case where
 * signup email ≠ connected email provider).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userProfile } = await admin.from("users").select("is_superadmin").eq("id", user.id).single();
  if (!userProfile?.is_superadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { target_org_id } = body;
  if (!target_org_id) {
    return NextResponse.json({ error: "target_org_id required" }, { status: 400 });
  }

  const log: string[] = [];

  // Validate target org exists
  const { data: targetOrg } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", target_org_id)
    .maybeSingle();
  if (!targetOrg) {
    return NextResponse.json({ error: "Target organization not found" }, { status: 404 });
  }
  log.push(`Target org: "${targetOrg.name}" (${target_org_id})`);

  // Also search additional emails (for cross-email merges)
  const alsoEmails = (body.also_emails || []) as string[];
  const uniqueEmails = [...new Set([user.email!, ...alsoEmails].filter(Boolean))];

  // Collect ALL org IDs linked to this user (same logic as GET)
  const { data: currentUser } = await admin
    .from("users")
    .select("id, email, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: usersByEmail } = await admin
    .from("users")
    .select("id, email, organization_id")
    .in("email", uniqueEmails);

  const { data: connectionsByUserId } = await admin
    .from("email_connections")
    .select("organization_id")
    .eq("user_id", user.id);

  const { data: connectionsByEmail } = await admin
    .from("email_connections")
    .select("user_id, organization_id")
    .in("email_address", uniqueEmails);

  const sourceOrgIds = new Set<string>();
  if (currentUser?.organization_id && currentUser.organization_id !== target_org_id) {
    sourceOrgIds.add(currentUser.organization_id);
  }
  for (const u of usersByEmail || []) {
    if (u.organization_id && u.organization_id !== target_org_id) {
      sourceOrgIds.add(u.organization_id);
    }
  }
  for (const c of [...(connectionsByUserId || []), ...(connectionsByEmail || [])]) {
    if (c.organization_id && c.organization_id !== target_org_id) {
      sourceOrgIds.add(c.organization_id);
    }
  }

  if (sourceOrgIds.size === 0) {
    return NextResponse.json({ message: "No other organizations to merge from.", log });
  }

  log.push(`Found ${sourceOrgIds.size} source org(s) to merge: ${Array.from(sourceOrgIds).join(", ")}`);

  // Move data from each source org to target
  for (const sourceOrgId of sourceOrgIds) {
    // Move projects
    const { data: movedProjects, error: projErr } = await admin
      .from("projects")
      .update({ organization_id: target_org_id } as any)
      .eq("organization_id", sourceOrgId)
      .select("id, name");
    if (projErr) {
      log.push(`ERROR moving projects from ${sourceOrgId}: ${projErr.message}`);
    } else {
      log.push(`Moved ${movedProjects?.length || 0} projects from ${sourceOrgId}`);
    }

    // Move email_connections
    const { data: movedConns } = await admin
      .from("email_connections")
      .update({ organization_id: target_org_id } as any)
      .eq("organization_id", sourceOrgId)
      .select("id");
    log.push(`Moved ${movedConns?.length || 0} email_connections from ${sourceOrgId}`);
  }

  // Update current user's org to target
  await admin
    .from("users")
    .update({ organization_id: target_org_id } as any)
    .eq("id", user.id);
  log.push(`Set current user (${user.id}) org to ${target_org_id}`);

  // Migrate data from ALL other user rows to current auth user
  const allOtherUserIds = new Set<string>();
  for (const u of usersByEmail || []) {
    if (u.id !== user.id) allOtherUserIds.add(u.id);
  }
  // Also include user_ids from email_connections linked to our email
  for (const c of connectionsByEmail || []) {
    if (c.user_id !== user.id) allOtherUserIds.add(c.user_id);
  }

  for (const oldUserId of allOtherUserIds) {
    await admin.from("project_members").update({ user_id: user.id } as any).eq("user_id", oldUserId);
    await admin.from("tasks").update({ assigned_to: user.id } as any).eq("assigned_to", oldUserId);
    await admin.from("tasks").update({ created_by: user.id } as any).eq("created_by", oldUserId);
    await admin.from("email_records").update({ user_id: user.id } as any).eq("user_id", oldUserId);
    await admin.from("meetings").update({ created_by: user.id } as any).eq("created_by", oldUserId);
    await admin.from("email_connections").update({ user_id: user.id } as any).eq("user_id", oldUserId);
    await admin.from("users").delete().eq("id", oldUserId);
    log.push(`Migrated data and removed old user ${oldUserId}`);
  }

  // Clean up empty source orgs
  for (const sourceOrgId of sourceOrgIds) {
    const { count: remainingProjects } = await admin
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", sourceOrgId);
    const { count: remainingUsers } = await admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", sourceOrgId);

    if ((remainingProjects || 0) === 0 && (remainingUsers || 0) === 0) {
      await admin.from("organizations").delete().eq("id", sourceOrgId);
      log.push(`Deleted empty org ${sourceOrgId}`);
    }
  }

  return NextResponse.json({ success: true, log });
}
