// ============================================================
// Cantaia — Plan Storage Service
// Downloads email attachments from Graph API, uploads to Supabase Storage,
// and creates plan_registry + plan_versions records
// ============================================================

import type { PlanDetectionResult } from "./plan-detector";

/** Signed-URL lifetime for browser display of a plan file (1 hour). */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Date du jour au format `YYYY-MM-DD` en heure d'Europe/Zurich.
 *
 * `new Date().toISOString().split("T")[0]` renvoie la date UTC : un plan reçu
 * entre minuit et ~2h heure de Zurich était daté de la veille. On passe par
 * `Intl` (locale `en-CA` → `YYYY-MM-DD`) dans le fuseau du produit.
 */
function zurichDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Extrait `{ bucket, path }` d'une valeur `file_url` stockée.
 *
 * Le bucket `plans` est PRIVÉ (migration 112). On continue de stocker une chaîne
 * au format `/storage/v1/object/public/plans/<path>` (compatibilité avec les
 * parseurs serveur d'estimation/scene qui font `storage.download()`), mais elle
 * n'est plus servie publiquement : toute consultation navigateur passe par une
 * URL signée fraîche mintée ici.
 */
function parseStorageRef(fileUrl: string): { bucket: string; path: string } | null {
  const match = fileUrl.match(
    /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/?]+)\/(.+?)(?:\?|$)/
  );
  if (match) {
    let path = match[2];
    try {
      path = decodeURIComponent(path);
    } catch {
      /* déjà décodé */
    }
    return { bucket: match[1], path };
  }
  // Repli : chemin relatif brut (pas d'URL) — on suppose le bucket `plans`.
  if (fileUrl && !fileUrl.includes("://")) {
    return { bucket: "plans", path: fileUrl.replace(/^\/+/, "") };
  }
  return null;
}

/**
 * Mint une URL signée courte durée pour l'affichage navigateur d'un fichier de
 * plan. Retourne `null` si la référence est illisible ou si Supabase refuse.
 *
 * `supabase` DOIT être un client admin (service role) : le bucket est privé.
 */
export async function createSignedPlanUrl(
  supabase: any,
  fileUrl: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const ref = parseStorageRef(fileUrl);
  if (!ref) return null;
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, expiresIn);
  if (error || !data?.signedUrl) {
    console.error(`[plan-storage] createSignedUrl failed for ${ref.path}:`, error?.message);
    return null;
  }
  return data.signedUrl;
}

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
  // Scopé org : deux tenants pourraient théoriquement partager un emailId de
  // provenance (données de test, migration) — on ne veut jamais qu'une dedup
  // traverse la frontière d'organisation.
  const { data: existingVersion } = await supabase
    .from("plan_versions")
    .select("id")
    .eq("organization_id", organizationId)
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
  // Chemin HORODATÉ : `upsert:true` écrasait le binaire de la version
  // précédente quand deux fichiers portaient le même nom sanitisé (fréquent :
  // "plan.pdf" réémis en indice B). L'ancienne version pointait alors vers le
  // binaire de la nouvelle. On horodate donc le chemin et on interdit l'upsert.
  const buffer = Buffer.from(contentBytes, "base64");
  const sanitizedName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${organizationId}/${projectId}/${Date.now()}_${sanitizedName}`;

  const { error: uploadError } = await supabase.storage
    .from("plans")
    .upload(storagePath, buffer, {
      contentType: attachment.contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error(`[savePlan] Storage upload error:`, uploadError);
    return null;
  }

  // Bucket `plans` privé (migration 112) : on stocke la chaîne au format public
  // (les téléchargeurs serveur la parsent puis lisent via storage.download()),
  // mais le navigateur ne reçoit QUE des URLs signées (createSignedPlanUrl).
  const { data: publicUrlData } = supabase.storage
    .from("plans")
    .getPublicUrl(storagePath);
  const fileUrl = publicUrlData?.publicUrl || "";

  // ── 3. Check if plan_registry already exists ──
  const { data: existingPlan } = await supabase
    .from("plan_registry")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("plan_number", planNumber)
    .maybeSingle();

  let planId: string;
  let isNewVersion = false;

  if (existingPlan) {
    // Existing plan — mark old versions as not current.
    // On DÉMOTE avant d'insérer (invariant "une seule version courante"). Si
    // l'insert échoue plus bas, on restaure la version précédente (voir le
    // rollback après l'insert) pour ne pas laisser le plan sans version courante.
    planId = existingPlan.id;
    isNewVersion = true;

    const { error: demoteErr } = await supabase
      .from("plan_versions")
      .update({ is_current: false })
      .eq("plan_id", planId)
      .eq("is_current", true);

    if (demoteErr) {
      console.error(`[savePlan] demote current version error:`, demoteErr);
      return null;
    }

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
  const nextVersionNumber = isNewVersion ? await getNextVersionNumber(supabase, planId) : 1;

  const { data: version, error: versionError } = await supabase
    .from("plan_versions")
    .insert({
      plan_id: planId,
      project_id: projectId,
      organization_id: organizationId,
      version_code: versionCode,
      version_number: nextVersionNumber,
      version_date: zurichDateString(),
      file_url: fileUrl,
      file_name: attachment.name,
      file_size: attachment.size,
      file_type: attachment.contentType,
      source: "email",
      source_email_id: emailId,
      received_at: new Date().toISOString(),
      // Détection heuristique (regex de nom de fichier), PAS une analyse IA :
      // voir plan-detector.detectPlansInEmail. On ne prétend pas à une
      // confiance "IA" — le champ reste renseigné pour le tri, mais ai_detected
      // est false tant qu'aucun appel modèle n'a réellement statué.
      ai_detected: false,
      ai_confidence: detection.confidence,
      ai_changes_detected: detection.changes_description || null,
      is_current: true,
      validation_status: "pending",
    })
    .select("id")
    .single();

  if (versionError || !version) {
    console.error(`[savePlan] plan_versions insert error:`, versionError);
    // Rollback : on avait démoté l'ancienne version courante. Sans elle et sans
    // la nouvelle, le plan n'aurait plus AUCUNE version courante — toutes les
    // lectures `.eq("is_current", true).maybeSingle()` en aval échoueraient.
    if (isNewVersion) {
      await supabase
        .from("plan_versions")
        .update({ is_current: true })
        .eq("plan_id", planId)
        .eq("version_number", nextVersionNumber - 1);
    }
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
