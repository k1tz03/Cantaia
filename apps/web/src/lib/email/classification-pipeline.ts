// ============================================================
// Cantaia — Shared email classification pipeline
//
// Single implementation of the classification cascade, used by BOTH
// `POST /api/outlook/sync` (interactive) and `GET|POST /api/email/sync/cron`
// (nightly). Before this module the cron only *inserted* emails and never
// classified them, so a user who relied on the scheduled sync woke up to an
// untriaged mailbox (audit2-interconnexions §1).
//
// Levels:
//   L0   price response detected by sender match  (free)
//   L0b  price response detected by SUB- tracking code (free + optional Haiku
//        price extraction) — L0 and L0b share ONE handler so a sender match no
//        longer short-circuits price extraction
//   L1   learned local sender rules               (free)
//   L2   spam / newsletter filter                 (free)
//   L2b  keyword project matching                 (free)
//   L3   Claude classification                    (billed)
//
// Every level that resolves a project_id calls `runPostClassificationFanout()`
// (task creation + auto-archive + plan detection). Previously that fan-out was
// trapped inside the L3 branch, so the better the local learning got, the more
// of the product it silently switched off.
// ============================================================

import type { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  classifyEmail,
  classifyEmailByKeywords,
  isUnknownProjectSubject,
  type ProjectForClassification,
} from "@cantaia/core/ai";
import { isPotentialPlan, detectPlansInEmail, savePlanFromAttachment } from "@cantaia/core/plans";
import { getAttachments as graphGetAttachments } from "@cantaia/core/outlook";
import { trackApiUsage } from "@cantaia/core/tracking";
import {
  checkLocalRules,
  checkRejectRules,
  detectSpamNewsletter,
  getEmailProvider,
  archiveEmail,
  type ArchiveableEmail,
  type ArchiveProjectConfig,
  type EmailConnectionConfig,
} from "@cantaia/core/emails";
import { checkUsageLimit } from "@cantaia/config/plan-features";

type AdminClient = ReturnType<typeof createAdminClient>;

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

export interface ArchiveProjectMeta {
  name: string;
  organization_id: string;
  archive_path: string | null;
  archive_structure: string;
  archive_filename_format: string;
  archive_attachments_mode: string;
}

export interface EmailPrefs {
  auto_dismiss_spam: boolean;
  auto_dismiss_newsletters: boolean;
  auto_move_outlook: boolean;
}

export interface PendingEmail {
  id: string;
  subject: string;
  sender_email: string | null;
  sender_name: string | null;
  body_preview: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  project_id: string | null;
  classification: string | null;
  classification_status: string | null;
  is_processed: boolean | null;
  has_attachments: boolean | null;
  outlook_message_id: string | null;
  recipients: string[] | null;
}

export interface EmailConnectionRecord {
  id: string;
  user_id: string;
  organization_id: string;
  provider: string;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string | null;
  email_address: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  sync_delta_link: string | null;
  total_emails_synced: number;
  created_at: string;
}

export interface AiQuotaInfo {
  current: number;
  limit: number;
  required_plan: string;
}

export interface ClassificationContext {
  admin: AdminClient;
  userId: string;
  organizationId: string | null;
  anthropicApiKey?: string;
  aiQuotaExceeded: boolean;
  aiQuotaInfo: AiQuotaInfo | null;
  graphToken?: string;
  getFullBody: (messageId: string) => Promise<string | undefined>;
  projects: ProjectForClassification[];
  archiveProjectsMap: Map<string, ArchiveProjectMeta>;
  userPrefs: EmailPrefs;
  /** Absolute epoch-ms budget. The loop stops pulling new emails past it. */
  deadlineAt?: number;
  /** Max emails pulled in one pass. */
  limit: number;
}

export interface ClassificationStats {
  emailsClassified: number;
  tasksCreated: number;
  newProjectsSuggested: number;
  emailsArchived: number;
  spamDismissed: number;
  plansSaved: number;
  quotesExtracted: number;
  /** True when the time budget cut the pass short — more emails remain. */
  timedOut: boolean;
  aiClassificationSkipped: boolean;
}

function emptyStats(aiSkipped = false): ClassificationStats {
  return {
    emailsClassified: 0,
    tasksCreated: 0,
    newProjectsSuggested: 0,
    emailsArchived: 0,
    spamDismissed: 0,
    plansSaved: 0,
    quotesExtracted: 0,
    timedOut: false,
    aiClassificationSkipped: aiSkipped,
  };
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

/**
 * Lightweight action-signal detection used by the local levels (L1 learned
 * rules, L2b keywords). These levels only decide *which project* an email
 * belongs to — they must not silently downgrade an urgent email to
 * "info_only" (B12).
 */
const ACTION_HINT_PATTERNS: RegExp[] = [
  // FR
  /\b(urgent|urgence|asap|d[eè]s que possible|au plus vite)\b/i,
  /\b(merci de|pri[eè]re de|veuillez|pouvez-vous|pourriez-vous|peux-tu|peux tu)\b/i,
  /\b(relance|rappel|[àa] valider|validation|pour validation|pour approbation|approbation)\b/i,
  /\b(d[ée]lai|[ée]ch[ée]ance|deadline|avant le|d'ici (le|au)|retour attendu|dans l'attente)\b/i,
  /\b(action requise|[àa] faire|[àa] traiter|r[ée]ponse (attendue|souhait[ée]e)|confirmez|confirmer)\b/i,
  /\b(devis|offre de prix|demande de prix|bon de commande|signature|signer)\b/i,
  // DE
  /\b(dringend|bitte um|r[üu]ckmeldung|frist|termin|erinnerung|freigabe|best[äa]tigen)\b/i,
  // EN
  /\b(urgent|asap|please (send|confirm|review|approve)|action required|reply|deadline|due (by|date)|follow[- ]up|reminder)\b/i,
];

export function hasActionHints(subject?: string | null, bodyPreview?: string | null): boolean {
  const text = `${subject || ""} ${bodyPreview || ""}`;
  if (!text.trim()) return false;
  return ACTION_HINT_PATTERNS.some((re) => re.test(text));
}

/** Strip HTML tags from an email body for AI classification. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Logs a failed supabase write instead of dropping it on the floor. */
function reportWriteError(site: string, emailId: string, error: { message?: string } | null): boolean {
  if (!error) return false;
  console.warn(`[classify] write failed (${site}) for email ${emailId}: ${error.message || "unknown error"}`);
  return true;
}

/* ═══════════════════════════════════════════════════════════
   BODY FETCHER
   ═══════════════════════════════════════════════════════════ */

export async function buildBodyFetcher(
  userId: string,
  emailConnection: EmailConnectionRecord | null
): Promise<(messageId: string) => Promise<string | undefined>> {
  if (emailConnection) {
    const provider = getEmailProvider(emailConnection.provider);
    if (provider.getEmailBody) {
      return async (messageId: string) => {
        try {
          const body = await provider.getEmailBody!(emailConnection as unknown as EmailConnectionConfig, messageId);
          if (body.bodyHtml) return stripHtml(body.bodyHtml).substring(0, 10000);
          if (body.bodyText) return body.bodyText.substring(0, 10000);
        } catch {
          /* fall through */
        }
        return undefined;
      };
    }
    return async () => undefined;
  }

  // Legacy: fetch straight from Microsoft Graph
  let graphAccessToken: string | undefined;
  try {
    const tokenResult = await getValidMicrosoftToken(userId);
    graphAccessToken = tokenResult.accessToken || undefined;
  } catch {
    console.warn("[classify] Could not get Microsoft token for full body fetch");
  }

  return async (messageId: string) => {
    if (!graphAccessToken) return undefined;
    try {
      const graphRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=body`,
        { headers: { Authorization: `Bearer ${graphAccessToken}` } }
      );
      if (graphRes.ok) {
        const graphData = await graphRes.json();
        if (graphData.body?.content) {
          return stripHtml(graphData.body.content).substring(0, 10000);
        }
      }
    } catch {
      /* fall through */
    }
    return undefined;
  };
}

/* ═══════════════════════════════════════════════════════════
   AI QUOTA
   ═══════════════════════════════════════════════════════════ */

/**
 * One quota check per pass. A sync can fan out to ~100 Claude calls, so the
 * plan quota is checked up front: when exhausted every AI step is skipped but
 * the free local levels (L0…L2b) keep running.
 */
export async function checkAiQuota(
  admin: AdminClient,
  organizationId: string | null
): Promise<{ exceeded: boolean; info: AiQuotaInfo | null }> {
  if (!organizationId) return { exceeded: false, info: null };
  try {
    const { data: orgPlan } = await (admin as any)
      .from("organizations")
      .select("subscription_plan")
      .eq("id", organizationId)
      .maybeSingle();

    const usageCheck = await checkUsageLimit(
      admin,
      organizationId,
      orgPlan?.subscription_plan || "trial",
      "email_classify"
    );
    if (!usageCheck.allowed) {
      console.warn(
        `[classify] AI quota reached for org ${organizationId} (${usageCheck.current}/${usageCheck.limit}) — AI classification skipped`
      );
      return {
        exceeded: true,
        info: {
          current: usageCheck.current,
          limit: usageCheck.limit,
          required_plan: usageCheck.requiredPlan,
        },
      };
    }
  } catch (quotaErr) {
    // Never block a sync on a quota lookup failure
    console.warn("[classify] Usage limit check failed (non-fatal):", quotaErr);
  }
  return { exceeded: false, info: null };
}

/* ═══════════════════════════════════════════════════════════
   CONTEXT BUILDER
   ═══════════════════════════════════════════════════════════ */

export async function buildClassificationContext(
  admin: AdminClient,
  userId: string,
  opts: {
    organizationId?: string | null;
    connection?: EmailConnectionRecord | null;
    deadlineAt?: number;
    limit?: number;
  } = {}
): Promise<ClassificationContext> {
  const organizationId = opts.organizationId ?? null;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  // Graph token for plan attachment downloads / archiving
  let graphToken: string | undefined;
  try {
    const tokenResult = await getValidMicrosoftToken(userId);
    graphToken = tokenResult.accessToken || undefined;
  } catch {
    /* no token available */
  }

  const getFullBody = await buildBodyFetcher(userId, opts.connection ?? null);

  // Projects available for matching
  let projects: ProjectForClassification[] = [];
  if (organizationId) {
    const { data: projectsData } = await (admin as any)
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, city, client_name")
      .eq("organization_id", organizationId)
      .in("status", ["active", "planning"]);
    projects = (projectsData || []) as ProjectForClassification[];
  }

  // Archive-enabled projects
  const archiveProjectsMap = new Map<string, ArchiveProjectMeta>();
  if (organizationId) {
    const { data: archiveProjects } = await (admin as any)
      .from("projects")
      .select(
        "id, name, organization_id, archive_path, archive_structure, archive_filename_format, archive_attachments_mode, archive_enabled"
      )
      .eq("organization_id", organizationId)
      .eq("archive_enabled", true);

    for (const ap of archiveProjects || []) {
      archiveProjectsMap.set(ap.id, {
        name: ap.name,
        organization_id: ap.organization_id,
        archive_path: ap.archive_path,
        archive_structure: ap.archive_structure || "by_category",
        archive_filename_format: ap.archive_filename_format || "date_sender_subject",
        archive_attachments_mode: ap.archive_attachments_mode || "subfolder",
      });
    }
  }

  // User email preferences (auto-dismiss decisions)
  let userPrefs: EmailPrefs = {
    auto_dismiss_spam: true,
    auto_dismiss_newsletters: false,
    auto_move_outlook: false,
  };
  const { data: prefs } = await (admin as any)
    .from("email_preferences")
    .select("auto_dismiss_spam, auto_dismiss_newsletters, auto_move_outlook")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefs) userPrefs = prefs;

  const quota = anthropicApiKey
    ? await checkAiQuota(admin, organizationId)
    : { exceeded: false, info: null };

  return {
    admin,
    userId,
    organizationId,
    anthropicApiKey,
    aiQuotaExceeded: quota.exceeded,
    aiQuotaInfo: quota.info,
    graphToken,
    getFullBody,
    projects,
    archiveProjectsMap,
    userPrefs,
    deadlineAt: opts.deadlineAt,
    limit: opts.limit ?? 100,
  };
}

/* ═══════════════════════════════════════════════════════════
   POST-CLASSIFICATION FAN-OUT
   ═══════════════════════════════════════════════════════════ */

export interface FanoutTask {
  title: string;
  priority?: string | null;
  assigned_to_name?: string | null;
  assigned_to_company?: string | null;
  due_date?: string | null;
}

export interface FanoutResult {
  taskCreated: boolean;
  archived: boolean;
  plansSaved: number;
}

/**
 * Everything that must happen once an email has been attached to a project,
 * regardless of WHICH level resolved it: task creation, auto-archiving to
 * Storage, and plan-attachment detection.
 *
 * Called by L0/L0b, L1, L2b and L3 — see the module header.
 * Never throws: a fan-out failure must not lose the classification itself.
 */
export async function runPostClassificationFanout(params: {
  admin: AdminClient;
  graphToken?: string | null;
  email: PendingEmail;
  projectId: string | null;
  classification: string | null;
  confidence?: number | null;
  userId: string;
  organizationId: string | null;
  archiveProjectsMap: Map<string, ArchiveProjectMeta>;
  projects: ProjectForClassification[];
  /** Only L3 produces a task candidate today. */
  task?: FanoutTask | null;
  /** Which level triggered the fan-out (logging only). */
  level: string;
}): Promise<FanoutResult> {
  const {
    admin,
    graphToken,
    email,
    projectId,
    classification,
    userId,
    organizationId,
    archiveProjectsMap,
    projects,
    task,
    level,
  } = params;

  const result: FanoutResult = { taskCreated: false, archived: false, plansSaved: 0 };
  if (!projectId) return result;

  const senderEmail = email.sender_email || "";

  // ── 1. Task creation ──────────────────────────────────────
  if (task?.title) {
    try {
      const { error: taskErr } = await (admin as any).from("tasks").insert({
        project_id: projectId,
        created_by: userId,
        title: task.title,
        priority: task.priority || "medium",
        source: "email" as const,
        source_id: email.id,
        source_reference: `Email: ${email.subject}`,
        assigned_to_name: task.assigned_to_name,
        assigned_to_company: task.assigned_to_company,
        due_date: task.due_date,
      });
      if (!reportWriteError(`${level}/task-insert`, email.id, taskErr)) {
        result.taskCreated = true;
      }
    } catch (taskErr) {
      console.warn(`[classify] ${level} task creation failed for ${email.id}:`, taskErr);
    }
  }

  // ── 2. Auto-archive (.eml → Storage) ──────────────────────
  const archiveProject = archiveProjectsMap.get(projectId);
  if (archiveProject) {
    try {
      const archiveableEmail: ArchiveableEmail = {
        id: email.id,
        outlook_message_id: email.outlook_message_id || null,
        subject: email.subject,
        sender_email: senderEmail,
        sender_name: email.sender_name || null,
        recipients: email.recipients || null,
        received_at: email.received_at,
        body_text: email.body_text || null,
        body_html: email.body_html || null,
        body_preview: email.body_preview || null,
        classification: classification || null,
        has_attachments: email.has_attachments || false,
      };

      const archiveProjectConfig: ArchiveProjectConfig = {
        id: projectId,
        name: archiveProject.name,
        organization_id: archiveProject.organization_id,
        archive_path: archiveProject.archive_path,
        archive_structure: archiveProject.archive_structure || "by_category",
        archive_filename_format: archiveProject.archive_filename_format || "date_sender_subject",
        archive_attachments_mode: archiveProject.archive_attachments_mode || "subfolder",
      };

      const archiveResult = await archiveEmail(
        admin,
        archiveableEmail,
        archiveProjectConfig,
        graphToken || null
      );

      // Drop any previous failed/pending record for this email
      const { error: delErr } = await (admin as any)
        .from("email_archives")
        .delete()
        .eq("email_id", email.id)
        .eq("project_id", projectId)
        .in("status", ["pending", "failed"]);
      reportWriteError(`${level}/archive-cleanup`, email.id, delErr);

      const { error: archiveInsertErr } = await (admin as any).from("email_archives").insert({
        email_id: email.id,
        project_id: projectId,
        organization_id: archiveProject.organization_id,
        local_path: archiveResult.storage_path,
        folder_name: archiveResult.folder_name,
        file_name: archiveResult.file_name,
        storage_path: archiveResult.storage_path,
        storage_bucket: "email-archives",
        file_size: archiveResult.file_size,
        attachments_saved: archiveResult.attachments_saved,
        status: archiveResult.status,
        error_message: archiveResult.error_message || null,
        archived_at: archiveResult.status === "saved" ? new Date().toISOString() : null,
      });
      reportWriteError(`${level}/archive-insert`, email.id, archiveInsertErr);

      if (archiveResult.status === "saved" && !archiveInsertErr) result.archived = true;
    } catch (archiveErr) {
      console.warn(`[classify] ${level} auto-archive failed for email ${email.id}:`, archiveErr);
    }
  }

  // ── 3. Plan attachment detection ──────────────────────────
  if (email.has_attachments && email.outlook_message_id && graphToken) {
    try {
      const attachments = await graphGetAttachments(graphToken, email.outlook_message_id);
      const potentialPlans = attachments.filter((a) =>
        isPotentialPlan({ id: a.id, name: a.name, contentType: a.contentType, size: a.size })
      );

      if (potentialPlans.length > 0) {
        const project = projects.find((p) => p.id === projectId);
        const detections = await detectPlansInEmail(
          email.id,
          potentialPlans.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size })),
          {
            sender_email: senderEmail,
            sender_name: email.sender_name || "",
            subject: email.subject,
            body_excerpt: email.body_preview || "",
            project_name: project?.name || "",
            project_code: project?.code || "",
            lots_list: "",
            existing_plans_summary: "",
          }
        );

        for (let i = 0; i < detections.length; i++) {
          const det = detections[i];
          if (det.is_plan && det.confidence >= 0.7) {
            const att = potentialPlans[i];
            const saved = await savePlanFromAttachment({
              supabase: admin,
              graphAccessToken: graphToken,
              messageId: email.outlook_message_id,
              attachment: { id: att.id, name: att.name, contentType: att.contentType, size: att.size },
              detection: det,
              emailId: email.id,
              projectId,
              organizationId: organizationId || "",
              userId,
            });
            if (saved) result.plansSaved++;
          }
        }
      }
    } catch (planErr) {
      console.warn(`[classify] ${level} plan detection failed for email ${email.id}:`, planErr);
    }
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════
   PRICE-REQUEST RESOLUTION (L0 + L0b share this)
   ═══════════════════════════════════════════════════════════ */

interface ResolvedPriceRequest {
  id: string;
  submission_id: string | null;
  project_id: string | null;
  items_requested: any[] | null;
  sent_at: string | null;
  tracking_code?: string | null;
  /** How it was matched, for the audit trail written to ai_reasoning. */
  via: string;
  /** SUB- code that matched (L0b only) — handed to the extraction pipeline. */
  matchedTrackingCode: string | null;
}

/**
 * D-FIX2 — L0 (sender match) and L0b (SUB- tracking code) both resolve a
 * `submission_price_requests` row. Previously L0 `continue`d before L0b ran, so
 * a sender-matched supplier reply never had its prices extracted, and L0 wrote
 * `linked_price_request_id` (a FK on the dead `price_requests` table) with a
 * `submission_price_requests` id → 23503 swallowed → the email stayed
 * unclassified and re-failed on every subsequent sync.
 */
async function resolvePriceRequest(
  admin: AdminClient,
  organizationId: string,
  email: PendingEmail
): Promise<ResolvedPriceRequest | null> {
  // tracking_code / material_group / supplier_email_manual / suppliers are
  // base 049 columns — safe to select explicitly; they feed the extraction
  // pipeline and the "offer received" notification.
  const selectCols =
    "id, submission_id, project_id, supplier_id, items_requested, sent_at, tracking_code, material_group, supplier_email_manual, suppliers(company_name)";

  // ── L0b: SUB- tracking code (most reliable → checked first) ──
  try {
    const { extractSubmissionTrackingCodes } = await import("@cantaia/core/submissions");
    let subCodes = extractSubmissionTrackingCodes(`${email.subject || ""} ${email.body_preview || ""}`);

    // Tracking codes usually live in the quoted footer — search the stored
    // bodies. body_text is the short preview; body_html holds the full body.
    if (subCodes.length === 0) {
      const { data: fullEmail } = await (admin as any)
        .from("email_records")
        .select("body_text, body_html")
        .eq("id", email.id)
        .maybeSingle();
      if (fullEmail?.body_text) subCodes = extractSubmissionTrackingCodes(fullEmail.body_text);
      if (subCodes.length === 0 && fullEmail?.body_html) {
        const stripped = fullEmail.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        subCodes = extractSubmissionTrackingCodes(stripped);
      }
    }

    if (subCodes.length > 0) {
      // CRITIQUE (cross-tenant) — the tracking code alone is NOT a credential:
      // the lookup is scoped to the mailbox owner's organization via the
      // submissions → projects join, so a code guessed (or forwarded) from
      // another org can never resolve here. `status = 'sent'` keeps every
      // later email of the same thread from re-flipping an already-responded
      // request and duplicating its quotes.
      const { data: priceRequest, error: prLookupErr } = await (admin as any)
        .from("submission_price_requests")
        .select(`${selectCols}, submissions!inner(projects!inner(organization_id))`)
        .eq("tracking_code", subCodes[0])
        .eq("status", "sent")
        .eq("submissions.projects.organization_id", organizationId)
        .maybeSingle();
      if (prLookupErr) {
        console.warn("[classify] L0b price request lookup failed:", prLookupErr.message);
      }
      if (priceRequest) {
        return { ...priceRequest, via: `tracking code ${subCodes[0]}`, matchedTrackingCode: subCodes[0] };
      }
    }
  } catch (l0bErr) {
    console.warn("[classify] L0b tracking-code detection error:", l0bErr);
  }

  // ── L0: sender-email match fallback ──
  try {
    const { detectPriceResponse } = await import("@cantaia/core/submissions");
    const priceMatch = await detectPriceResponse(admin, organizationId, {
      body: email.body_preview || "",
      sender_email: email.sender_email || "",
      subject: email.subject || "",
    });

    if (priceMatch && priceMatch.source === "submission_price_requests") {
      const { data: priceRequest } = await (admin as any)
        .from("submission_price_requests")
        .select(selectCols)
        .eq("id", priceMatch.priceRequestId)
        .maybeSingle();
      if (priceRequest) {
        return { ...priceRequest, via: "sender email", matchedTrackingCode: null };
      }
    }
  } catch (l0Err) {
    console.warn("[classify] L0 sender detection error:", l0Err);
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════
   MAIN CASCADE
   ═══════════════════════════════════════════════════════════ */

/**
 * Classify every pending email of a user. Safe to call from a request handler
 * or from a cron worker — the only difference is the time budget.
 */
export async function classifyPendingEmails(ctx: ClassificationContext): Promise<ClassificationStats> {
  const {
    admin,
    userId,
    organizationId,
    anthropicApiKey,
    aiQuotaExceeded,
    graphToken,
    getFullBody,
    projects,
    archiveProjectsMap,
    userPrefs,
    deadlineAt,
    limit,
  } = ctx;

  const stats = emptyStats(aiQuotaExceeded);

  // Only classify emails with no classification_status (newly synced) or
  // explicitly "unprocessed" (a previous attempt failed). This prevents L1
  // learned rules from overriding a correct AI classification when the same
  // sender writes about several projects.
  const { data: unprocessedEmails, error: pendingErr } = await (admin as any)
    .from("email_records")
    // body_text / body_html are required by archiveEmail() — without them the
    // generated .eml was truncated to the 500-char preview (B2).
    .select(
      "id, subject, sender_email, sender_name, body_preview, body_text, body_html, received_at, project_id, classification, classification_status, is_processed, has_attachments, outlook_message_id, recipients"
    )
    .eq("user_id", userId)
    .eq("is_processed", false)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (pendingErr) {
    console.warn(`[classify] could not load pending emails for ${userId}: ${pendingErr.message}`);
    return stats;
  }

  const pending = (unprocessedEmails || []) as PendingEmail[];
  if (process.env.NODE_ENV === "development") {
    console.log(`[classify] ${pending.length} unprocessed emails, ${projects.length} projects available`);
  }

  for (const email of pending) {
    if (deadlineAt && Date.now() > deadlineAt) {
      stats.timedOut = true;
      console.warn(`[classify] time budget exhausted for user ${userId} — stopping pass`);
      break;
    }

    try {
      // Already classified by a previous pass
      if (email.classification_status && email.classification_status !== "unprocessed") {
        continue;
      }

      const senderEmail = email.sender_email || "";

      // ═══════════════════════════════════════════════════════
      // LEVEL 0 / 0b: PRICE REQUEST RESPONSE
      // ═══════════════════════════════════════════════════════
      if (organizationId) {
        const priceRequest = await resolvePriceRequest(admin, organizationId, email);

        if (priceRequest) {
          // ── Price extraction (runs for BOTH match methods) ──
          // AUDIT 08/2026 — goes through the SHARED receive-quote pipeline
          // (processQuoteFromEmail): full body + PDF and Excel/CSV attachments
          // via Graph, idempotent quote upsert (migration 103), `offer_parse`
          // metering BEFORE any AI call, and the "offer received" notification.
          // The old inline Haiku block only read the body and blindly appended
          // duplicate quote rows. Insufficient credits do NOT block reception:
          // the request is still flipped to "responded" below — only the AI
          // extraction is skipped.
          let quotesInserted = 0;
          const requestedItems = (priceRequest.items_requested as any[]) || [];

          if (requestedItems.length > 0 && anthropicApiKey) {
            try {
              const { processQuoteFromEmail } = await import(
                "@/app/api/submissions/_shared/quote-extraction"
              );
              const quoteOutcome = await processQuoteFromEmail(email.id, {
                admin,
                trackingCode: priceRequest.matchedTrackingCode ?? priceRequest.tracking_code ?? null,
                priceRequest,
              });

              if (quoteOutcome.processed) {
                quotesInserted = quoteOutcome.quotes_extracted || 0;
              } else if (quoteOutcome.reason === "usage_limit") {
                console.warn(
                  `[classify] L0b extraction skipped for email ${email.id}: offer_parse credits/quota exhausted — request still marked responded`
                );
              } else if (quoteOutcome.reason) {
                console.warn(
                  `[classify] L0b extraction did not run for email ${email.id}: ${quoteOutcome.reason}` +
                    (quoteOutcome.error ? ` (${quoteOutcome.error})` : "")
                );
              }
            } catch (extractErr) {
              console.warn("[classify] L0b price extraction failed (non-fatal):", extractErr);
            }
          }

          // Resolve the project: the request row first, then its submission.
          let priceProjectId: string | null = priceRequest.project_id || null;
          if (!priceProjectId && priceRequest.submission_id) {
            const { data: submission } = await (admin as any)
              .from("submissions")
              .select("project_id")
              .eq("id", priceRequest.submission_id)
              .maybeSingle();
            priceProjectId = submission?.project_id || null;
          }

          // NOTE: `linked_price_request_id` is deliberately NOT written — it is
          // a FK on the legacy `price_requests` table (migration 022) and the
          // id we hold belongs to `submission_price_requests`.
          const { error: l0UpdateErr } = await (admin as any)
            .from("email_records")
            .update({
              classification: "action_required",
              project_id: priceProjectId,
              classification_status: "auto_classified",
              email_category: "price_response",
              ai_reasoning: `Level 0: price request matched via ${priceRequest.via}. ${quotesInserted} prix extraits.`,
              price_extracted: quotesInserted > 0,
            })
            .eq("id", email.id);
          reportWriteError("L0/email-update", email.id, l0UpdateErr);

          // Status FIRST, in its own statement: a database missing the 082
          // metric columns (or the 103 link column) must still record that the
          // supplier responded — the old monolithic update lost everything to
          // one rejected column.
          const { error: prStatusErr } = await (admin as any)
            .from("submission_price_requests")
            .update({ status: "responded" })
            .eq("id", priceRequest.id);
          reportWriteError("L0/price-request-status", email.id, prStatusErr);

          if (!prStatusErr) {
            // 082 scoring metrics — tolerated (idempotent re-write when the
            // extraction pipeline already persisted them).
            const responseReceivedAt = new Date().toISOString();
            let responseTimeDays: number | null = null;
            if (priceRequest.sent_at) {
              const sentMs = new Date(priceRequest.sent_at).getTime();
              responseTimeDays = Math.round(((Date.now() - sentMs) / (1000 * 60 * 60 * 24)) * 10) / 10;
            }
            const { error: prMetricsErr } = await (admin as any)
              .from("submission_price_requests")
              .update({
                response_received_at: responseReceivedAt,
                response_time_days: responseTimeDays,
              })
              .eq("id", priceRequest.id);
            if (prMetricsErr) {
              console.warn(
                `[classify] response metrics not persisted for request ${priceRequest.id} ` +
                  "(apply migration 082_submission_price_requests_response_columns.sql):",
                prMetricsErr.message
              );
            }

            // 103 — remember WHICH email answered this request, so a later
            // manual re-extraction finds its source without an ilike sweep.
            const { error: prLinkErr } = await (admin as any)
              .from("submission_price_requests")
              .update({ responded_email_id: email.id })
              .eq("id", priceRequest.id);
            if (prLinkErr) {
              console.warn(
                `[classify] responded_email_id not persisted for request ${priceRequest.id} ` +
                  "(apply migration 103_receive_quote_integrity.sql):",
                prLinkErr.message
              );
            }
          }

          // D-FIX1 — the fan-out now runs here too (archiving + plan detection
          // for supplier quote attachments, which is exactly where plans land).
          const fanout = await runPostClassificationFanout({
            admin,
            graphToken,
            email,
            projectId: priceProjectId,
            classification: "action_required",
            userId,
            organizationId,
            archiveProjectsMap,
            projects,
            level: "L0",
          });
          if (fanout.taskCreated) stats.tasksCreated++;
          if (fanout.archived) stats.emailsArchived++;
          stats.plansSaved += fanout.plansSaved;

          stats.quotesExtracted += quotesInserted;
          stats.emailsClassified++;
          continue;
        }
      }

      // ═══════════════════════════════════════════════════════
      // LEVEL 1: LOCAL LEARNED RULES (free)
      // ═══════════════════════════════════════════════════════
      if (organizationId) {
        const localMatch = await checkLocalRules(admin, organizationId, senderEmail);
        if (localMatch) {
          // B12: a learned sender rule only tells us WHICH project — never
          // downgrade an existing classification.
          const l1Classification =
            email.classification ||
            (hasActionHints(email.subject, email.body_preview) ? "action_required" : "info_only");

          const { error: l1Err } = await (admin as any)
            .from("email_records")
            .update({
              project_id: localMatch.projectId,
              classification: l1Classification,
              ai_classification_confidence: Math.round(localMatch.confidence * 100),
              ai_project_match_confidence: Math.round(localMatch.confidence * 100),
              ai_reasoning: "Classified by learned local rule (no AI call)",
              classification_status: "auto_classified",
              email_category: "project",
            })
            .eq("id", email.id);
          reportWriteError("L1/email-update", email.id, l1Err);

          const fanout = await runPostClassificationFanout({
            admin,
            graphToken,
            email,
            projectId: localMatch.projectId,
            classification: l1Classification,
            confidence: localMatch.confidence,
            userId,
            organizationId,
            archiveProjectsMap,
            projects,
            level: "L1",
          });
          if (fanout.taskCreated) stats.tasksCreated++;
          if (fanout.archived) stats.emailsArchived++;
          stats.plansSaved += fanout.plansSaved;

          stats.emailsClassified++;
          continue;
        }

        // ── L1b: règles REJECT (signal négatif appris — gratuit) ──
        // AUDIT 08/2026 — les règles reject (project_id NULL, écrites par
        // learnFromClassificationAction depuis toujours) n'étaient JAMAIS
        // lues : un expéditeur rejeté 10 fois repartait quand même en
        // classification IA. Un reject fiable (≥2 rejets, fiabilité ≥0.7)
        // court-circuite désormais projet ET appel IA.
        const rejectMatch = await checkRejectRules(admin, organizationId, senderEmail);
        if (rejectMatch) {
          const { error: l1bErr } = await (admin as any)
            .from("email_records")
            .update({
              project_id: null,
              classification: email.classification || "info_only",
              email_category: "personal",
              ai_classification_confidence: Math.round(rejectMatch.confidence * 100),
              ai_reasoning: `Expéditeur rejeté ${rejectMatch.timesConfirmed}× par l'utilisateur (règle ${rejectMatch.ruleType}) — pas un email projet`,
              classification_status: "auto_classified",
            })
            .eq("id", email.id);
          reportWriteError("L1b/email-update", email.id, l1bErr);

          stats.emailsClassified++;
          continue;
        }
      }

      // ═══════════════════════════════════════════════════════
      // LEVEL 2: SPAM / NEWSLETTER FILTER (free)
      // ═══════════════════════════════════════════════════════
      const spamCheck = detectSpamNewsletter({
        from_email: senderEmail,
        subject: email.subject,
        body_preview: email.body_preview || "",
      });

      if (spamCheck.detected) {
        const shouldAutoDismiss =
          (spamCheck.type === "spam" && userPrefs.auto_dismiss_spam) ||
          (spamCheck.type === "newsletter" && userPrefs.auto_dismiss_newsletters);

        // D-FIX7 — terminal state in BOTH directions:
        //  • auto-dismissed  → is_processed true + classification 'archived'
        //    (out of the buckets AND out of the badge)
        //  • kept            → classification 'info_only', is_processed false
        //    (visible in the "Infos" bucket, counted by the badge)
        // Before this, a kept spam email had classification NULL: invisible in
        // every bucket yet still counted by the sidebar badge — a permanently
        // lying counter.
        const { error: l2Err } = await (admin as any)
          .from("email_records")
          .update({
            email_category: spamCheck.type === "spam" ? "spam" : "newsletter",
            ai_classification_confidence: Math.round(spamCheck.confidence * 100),
            ai_reasoning: spamCheck.reason,
            classification_status: "auto_classified",
            ...(shouldAutoDismiss
              ? { is_processed: true, classification: "archived" as const }
              : { classification: email.classification || ("info_only" as const) }),
          })
          .eq("id", email.id);
        reportWriteError("L2/email-update", email.id, l2Err);

        stats.emailsClassified++;
        if (shouldAutoDismiss) stats.spamDismissed++;
        continue;
      }

      // ═══════════════════════════════════════════════════════
      // LEVEL 2b: LOCAL KEYWORD CLASSIFICATION (free)
      // ═══════════════════════════════════════════════════════
      if (projects.length > 0) {
        const keywordMatch = classifyEmailByKeywords(
          {
            subject: email.subject,
            sender_email: senderEmail,
            sender_name: email.sender_name || undefined,
            body_preview: email.body_preview || undefined,
            recipients: email.recipients || [],
          },
          projects
        );

        if (keywordMatch && keywordMatch.confidence >= 0.6) {
          // B12: keyword matching identifies the project, not the urgency.
          const l2bClassification =
            email.classification ||
            (hasActionHints(email.subject, email.body_preview) ? "action_required" : "info_only");

          const { error: l2bErr } = await (admin as any)
            .from("email_records")
            .update({
              project_id: keywordMatch.projectId,
              classification: l2bClassification,
              ai_classification_confidence: Math.round(keywordMatch.confidence * 100),
              ai_project_match_confidence: Math.round(keywordMatch.confidence * 100),
              classification_status: "auto_classified",
              email_category: "project",
              ai_reasoning: `Local keyword match: ${keywordMatch.reasons.join(", ")}`,
            })
            .eq("id", email.id);
          reportWriteError("L2b/email-update", email.id, l2bErr);

          const fanout = await runPostClassificationFanout({
            admin,
            graphToken,
            email,
            projectId: keywordMatch.projectId,
            classification: l2bClassification,
            confidence: keywordMatch.confidence,
            userId,
            organizationId,
            archiveProjectsMap,
            projects,
            level: "L2b",
          });
          if (fanout.taskCreated) stats.tasksCreated++;
          if (fanout.archived) stats.emailsArchived++;
          stats.plansSaved += fanout.plansSaved;

          stats.emailsClassified++;
          continue;
        }
      }

      // Subject clearly names a project we do not know → skip the AI call.
      // D-FIX7: give it a terminal, VISIBLE classification instead of leaving
      // `classification` NULL (invisible in every bucket, counted by the badge).
      if (isUnknownProjectSubject(email.subject, projects)) {
        const { error: skipErr } = await (admin as any)
          .from("email_records")
          .update({
            classification_status: "auto_classified",
            classification: email.classification || "info_only",
            email_category: "project",
            ai_reasoning: "Skipped AI: subject names a project unknown to this organisation",
          })
          .eq("id", email.id);
        reportWriteError("skip-ai/email-update", email.id, skipErr);
        stats.emailsClassified++;
        continue;
      }

      // ═══════════════════════════════════════════════════════
      // LEVEL 3: CLAUDE AI CLASSIFICATION (billed)
      // ═══════════════════════════════════════════════════════
      if (!anthropicApiKey || aiQuotaExceeded) {
        // No AI key, or the org's monthly AI quota is exhausted (B6):
        // keep it in the manual classification queue.
        const { error: noAiErr } = await (admin as any)
          .from("email_records")
          .update({ classification_status: "unprocessed" })
          .eq("id", email.id);
        reportWriteError("L3/quota-skip", email.id, noAiErr);
        continue;
      }

      let bodyFull: string | undefined;
      if (email.outlook_message_id) {
        try {
          bodyFull = await getFullBody(email.outlook_message_id);
        } catch (bodyErr) {
          console.warn("[classify] Full body fetch error:", bodyErr);
        }
      }

      const result = await classifyEmail(
        anthropicApiKey,
        {
          sender_email: senderEmail,
          sender_name: email.sender_name || "",
          subject: email.subject,
          body_preview: email.body_preview || "",
          body_full: bodyFull,
          received_at: email.received_at,
          recipients: email.recipients || [],
        },
        projects,
        undefined,
        (usage) => {
          trackApiUsage({
            supabase: admin,
            userId,
            organizationId: organizationId ?? "",
            actionType: "email_classify",
            apiProvider: "anthropic",
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            metadata: { email_id: email.id },
          });
        }
      );

      const confidencePercent = Math.round(result.confidence * 100);

      // Enriched L3 signals persisted in suggested_project_data
      const enrichedSignals: Record<string, unknown> = {};
      if (result.prices_detected && result.prices_detected.length > 0) {
        enrichedSignals.prices_detected = result.prices_detected;
      }
      if (result.deadlines_detected && result.deadlines_detected.length > 0) {
        enrichedSignals.deadlines_detected = result.deadlines_detected;
      }
      if (result.supplier_match) enrichedSignals.supplier_match = result.supplier_match;
      if (result.delay_detected) enrichedSignals.delay_detected = result.delay_detected;
      if (result.order_confirmation) enrichedSignals.order_confirmation = result.order_confirmation;
      const hasEnrichedSignals = Object.keys(enrichedSignals).length > 0;

      if (result.match_type === "existing_project") {
        const isAutoClassified = result.confidence >= 0.85;
        const { error: l3Err } = await (admin as any)
          .from("email_records")
          .update({
            project_id: result.project_id || null,
            classification: result.classification || "info_only",
            ai_summary: result.summary_fr,
            ai_classification_confidence: result.classification_confidence || confidencePercent,
            ai_project_match_confidence: confidencePercent,
            classification_status: isAutoClassified ? "auto_classified" : "suggested",
            email_category: "project",
            ai_reasoning: result.reasoning || null,
            ...(hasEnrichedSignals ? { suggested_project_data: enrichedSignals } : {}),
          })
          .eq("id", email.id);
        reportWriteError("L3/existing-project", email.id, l3Err);
      } else if (result.match_type === "new_project") {
        const newProjectData = {
          ...(result.suggested_project || {}),
          ...(hasEnrichedSignals ? enrichedSignals : {}),
        };
        const { error: l3NewErr } = await (admin as any)
          .from("email_records")
          .update({
            project_id: null,
            classification: result.classification || "action_required",
            ai_summary: result.summary_fr,
            ai_classification_confidence: result.classification_confidence || confidencePercent,
            ai_project_match_confidence: 0,
            classification_status: "new_project_suggested",
            email_category: "project",
            suggested_project_data: Object.keys(newProjectData).length > 0 ? newProjectData : null,
            ai_reasoning: result.reasoning || null,
          })
          .eq("id", email.id);
        reportWriteError("L3/new-project", email.id, l3NewErr);
        stats.newProjectsSuggested++;
      } else {
        // no_project — personal, admin, etc.
        const isLowConfidence = result.confidence < 0.5;
        const { error: l3NoneErr } = await (admin as any)
          .from("email_records")
          .update({
            project_id: null,
            classification: "info_only",
            ai_summary: result.summary_fr,
            ai_classification_confidence: confidencePercent,
            ai_project_match_confidence: 0,
            classification_status: isLowConfidence ? "unprocessed" : "classified_no_project",
            email_category: result.email_category || "personal",
            ai_reasoning: result.reasoning || null,
            ...(hasEnrichedSignals ? { suggested_project_data: enrichedSignals } : {}),
          })
          .eq("id", email.id);
        reportWriteError("L3/no-project", email.id, l3NoneErr);
      }

      stats.emailsClassified++;

      // Learn from a high-confidence AI classification. Only ONE confirmation
      // per email — the old double-confirm promoted sender rules to
      // times_confirmed=2 instantly, capturing every future email from that
      // sender regardless of content.
      if (result.confidence >= 0.85 && result.project_id && organizationId) {
        try {
          const { learnFromClassificationAction } = await import("@cantaia/core/emails");
          await learnFromClassificationAction({
            supabase: admin,
            organizationId,
            senderEmail,
            subject: email.subject,
            projectId: result.project_id,
            action: "confirm",
          });
        } catch {
          /* learning must never block the sync */
        }
      }

      const fanout = await runPostClassificationFanout({
        admin,
        graphToken,
        email,
        projectId: result.project_id || null,
        classification: result.classification || null,
        confidence: result.confidence,
        userId,
        organizationId,
        archiveProjectsMap,
        projects,
        task:
          result.contains_task && result.task?.title
            ? {
                title: result.task.title,
                priority: result.task.priority || "medium",
                assigned_to_name: result.task.assigned_to_name,
                assigned_to_company: result.task.assigned_to_company,
                due_date: result.task.due_date,
              }
            : null,
        level: "L3",
      });
      if (fanout.taskCreated) stats.tasksCreated++;
      if (fanout.archived) stats.emailsArchived++;
      stats.plansSaved += fanout.plansSaved;
    } catch (err) {
      console.error(`[classify] Failed to classify email ${email.id} ("${email.subject}"):`, err);
      const { error: failErr } = await (admin as any)
        .from("email_records")
        .update({ classification_status: "unprocessed" })
        .eq("id", email.id);
      reportWriteError("catch/mark-unprocessed", email.id, failErr);
    }
  }

  return stats;
}

/* ═══════════════════════════════════════════════════════════
   SNOOZE RESET
   ═══════════════════════════════════════════════════════════ */

/** Reset expired snoozes back to the decision queue. Scoped to one user when
 *  `userId` is given, otherwise platform-wide (cron). Never throws. */
export async function resetExpiredSnoozes(admin: AdminClient, userId?: string): Promise<number> {
  try {
    const now = new Date().toISOString();
    let query = (admin as any)
      .from("email_records")
      .select("id")
      .eq("triage_status", "snoozed")
      .not("snooze_until", "is", null)
      .lt("snooze_until", now)
      .limit(500);
    if (userId) query = query.eq("user_id", userId);

    const { data: expiredSnoozes, error: selectErr } = await query;
    if (selectErr) {
      console.warn("[classify] Snooze lookup failed (non-fatal):", selectErr.message);
      return 0;
    }

    const expiredIds = (expiredSnoozes || []).map((e: { id: string }) => e.id);
    if (expiredIds.length === 0) return 0;

    const { error: resetErr } = await (admin as any)
      .from("email_records")
      .update({
        triage_status: "unprocessed",
        snooze_until: null,
        process_action: null,
        is_processed: false,
      })
      .in("id", expiredIds);

    if (resetErr) {
      console.warn("[classify] Snooze reset failed (non-fatal):", resetErr.message);
      return 0;
    }
    return expiredIds.length;
  } catch (snoozeErr) {
    console.warn("[classify] Snooze reset skipped (non-fatal):", snoozeErr);
    return 0;
  }
}
