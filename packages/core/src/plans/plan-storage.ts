// ============================================================
// Cantaia — Plan Storage Service
// Downloads email attachments from Graph API, uploads to Supabase Storage,
// and creates plan_registry + plan_versions records
// ============================================================

import type { PlanDetectionResult } from "./plan-detector";

export interface SavePlanInput {
  supabase: any; // SupabaseClient (admin)
  graphAccessToken: string;
  messageId: string;
  attachment: {
    id: string;
    name: string;
    contentType: string;
    size: number;
  };
  detection: PlanDetectionResult;
  emailId: string;
  projectId: string;
  organizationId: string;
  userId: string;
}

export interface SavePlanResult {
  planId: string;
  versionId: string;
  fileUrl: string;
  isNewVersion: boolean;
}

/**
 * Save a plan attachment from an email to Supabase Storage + DB.
 * 1. Download attachment content from Graph API
 * 2. Upload to Supabase Storage (plans/{orgId}/{projectId}/{filename})
 * 3. Check if plan_registry already exists (same plan_number + project_id)
 * 4. Create/update plan_registry + plan_versions
 * 5. Dedup: skip if source_email_id already exists for this email
 */
export async function savePlanFromAttachment(
  input: SavePlanInput
): Promise<SavePlanResult | null> {
  const {
    supabase,
    graphAccessToken,
    messageId,
    attachment,
    detection,
    emailId,
    projectId,
    organizationId,
    userId,
  } = input;

  const planNumber = detection.plan_number || attachment.name.replace(/\.[^.]+$/, "");
  const planTitle = detection.plan_title || attachment.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  const versionCode = detection.version_code || "A";

  // ── Dedup: check if this email already produced a plan version ──
  const { data: existingVersion } = await supabase
    .from("plan_versions")
    .select("id")
    .eq("source_email_id", emailId)
    .eq("file_name", attachment.name)
    .maybeSingle();

  if (existingVersion) {
    console.log(`[savePlan] Skip: already saved from email ${emailId} — ${attachment.name}`);
    return null;
  }

  // ── 1. Download attachment from Graph API ──
  let contentBytes: string;
  try {
    const url = `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachment.id}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${graphAccessToken}` },
    });
    if (!res.ok) {
      console.error(`[savePlan] Graph fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    contentBytes = data.contentBytes;
    if (!contentBytes) {
      console.error(`[savePlan] No contentBytes in attachment response`);
      return null;
    }
  } catch (err) {
    console.error(`[savePlan] Graph download error:`, err);
    return null;
  }

  // ── 2. Upload to Supabase Storage ──
  const buffer = Buffer.from(contentBytes, "base64");
  const storagePath = `${organizationId}/${projectId}/${attachment.name}`;

  const { error: uploadError } = await supabase.storage
    .from("plans")
    .upload(storagePath, buffer, {
      contentType: attachment.contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error(`[savePlan] Storage upload error:`, uploadError);
    return null;
  }

  const { data: publicUrlData } = supabase.storage
    .from("plans")
    .getPublicUrl(storagePath);
  const fileUrl = publicUrlData?.publicUrl || "";

  // ── 3. Check if plan_registry already exists ──
  const { data: existingPlan } = await supabase
    .from("plan_registry")
    .select("id")
    .eq("project_id", projectId)
    .eq("plan_number", planNumber)
    .maybeSingle();

  let planId: string;
  let isNewVersion = false;

  if (existingPlan) {
    // Existing plan — mark old versions as not current
    planId = existingPlan.id;
    isNewVersion = true;

    await supabase
      .from("plan_versions")
      .update({ is_current: false })
      .eq("plan_id", planId)
      .eq("is_current", true);

    console.log(`[savePlan] Existing plan ${planNumber} — adding new version ${versionCode}`);
  } else {
    // New plan
    const { data: newPlan, error: planError } = await supabase
      .from("plan_registry")
      .insert({
        project_id: projectId,
        organization_id: organizationId,
        plan_number: planNumber,
        plan_title: planTitle,
        discipline: detection.discipline || null,
        cfc_code: detection.cfc_code || null,
        lot_name: detection.lot_name || null,
        zone: detection.zone || null,
        scale: detection.scale || null,
        author_company: detection.author_company || null,
        status: "active",
        created_by: userId,
      })
      .select("id")
      .single();

    if (planError || !newPlan) {
      console.error(`[savePlan] plan_registry insert error:`, planError);
      return null;
    }

    planId = newPlan.id;
    console.log(`[savePlan] New plan ${planNumber} created: ${planId}`);
  }

  // ── 4. Create plan_versions record ──
  const { data: version, error: versionError } = await supabase
    .from("plan_versions")
    .insert({
      plan_id: planId,
      project_id: projectId,
      organization_id: organizationId,
      version_code: versionCode,
      version_number: isNewVersion ? await getNextVersionNumber(supabase, planId) : 1,
      version_date: new Date().toISOString().split("T")[0],
      file_url: fileUrl,
      file_name: attachment.name,
      file_size: attachment.size,
      file_type: attachment.contentType,
      source: "email",
      source_email_id: emailId,
      received_at: new Date().toISOString(),
      ai_detected: true,
      ai_confidence: detection.confidence,
      ai_changes_detected: detection.changes_description || null,
      is_current: true,
      validation_status: "pending",
    })
    .select("id")
    .single();

  if (versionError || !version) {
    console.error(`[savePlan] plan_versions insert error:`, versionError);
    return null;
  }

  console.log(`[savePlan] Version ${versionCode} saved: ${version.id} → ${fileUrl}`);

  return {
    planId,
    versionId: version.id,
    fileUrl,
    isNewVersion,
  };
}

async function getNextVersionNumber(supabase: any, planId: string): Promise<number> {
  const { data } = await supabase
    .from("plan_versions")
    .select("version_number")
    .eq("plan_id", planId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version_number || 0) + 1;
}
