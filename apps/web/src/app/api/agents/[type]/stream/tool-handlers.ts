// ============================================================
// Custom Tool Handlers — Server-side execution of Cantaia custom tools
// Called by the stream route when the agent invokes a custom tool.
// Each handler accesses Supabase via admin client (bypass RLS).
//
// SECURITY: Never trust agent-supplied user_id or organization_id.
//           Always use ctx.userId / ctx.organizationId (from auth).
//           Always verify org ownership before reads AND writes.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentType } from "@cantaia/core/agents";

interface ToolContext {
  userId: string;
  organizationId: string;
  sessionId: string; // Internal DB session ID
  admin: SupabaseClient;
}

/**
 * Execute a custom tool and return the result string.
 * This is the single dispatch point for all custom tools across all agents.
 */
export async function executeCustomTool(
  _agentType: AgentType,
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string | Record<string, unknown>> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return { error: true, message: `Unknown custom tool: ${toolName}` };
  }
  return handler(input, ctx);
}

// ── SSRF Protection — only allow Supabase storage URLs ──────

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "") ?? "";
    return supabaseHost.length > 0 && parsed.hostname.endsWith(supabaseHost.split("/")[0]);
  } catch {
    return false;
  }
}

// ── Tool Handler Registry ─────────────────────────────────

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext
) => Promise<string | Record<string, unknown>>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // ── Submission Analyzer Tools ──────────────────────────

  fetch_submission_file: async (input, ctx) => {
    const submissionId = input.submission_id as string;

    // Get submission (no join — avoids ambiguous FK with portal_submission_id)
    const { data: submission, error } = await (ctx.admin as any)
      .from("submissions")
      .select("id, title, file_url, file_name, file_type, project_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (error || !submission) {
      console.error("[tool:fetch_submission_file] Query error:", error?.message);
      return { error: true, message: `Submission ${submissionId} not found` };
    }

    // IDOR check via project
    if (submission.project_id) {
      const { data: project } = await (ctx.admin as any)
        .from("projects")
        .select("organization_id")
        .eq("id", submission.project_id)
        .maybeSingle();
      if (!project || project.organization_id !== ctx.organizationId) {
        return { error: true, message: "Access denied" };
      }
    }

    if (!submission.file_url) {
      return { error: true, message: "No file attached to this submission" };
    }

    // Download file from Storage
    const bucket = "submissions";
    const filePath = submission.file_url.replace(/^.*\/submissions\//, "");

    const { data: fileData, error: dlError } = await ctx.admin.storage
      .from(bucket)
      .download(filePath);

    if (dlError || !fileData) {
      return { error: true, message: `Failed to download file: ${dlError?.message}` };
    }

    // Extract text based on file type
    // Prefer extension from filename (reliable), fall back to MIME type detection
    const ext = submission.file_name?.split(".").pop()?.toLowerCase() || "";
    const mime = (submission.file_type || "").toLowerCase();
    const buffer = Buffer.from(await fileData.arrayBuffer());

    let extractedText = "";

    if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          const lines = csv.split("\n").filter((l: string) => l.replace(/,/g, "").trim().length > 0);
          if (lines.length > 0) {
            extractedText += `\n=== Sheet: ${sheetName} ===\n${lines.join("\n")}`;
          }
        }
      } catch (e: any) {
        console.warn("[fetch_submission_file] Excel parse failed:", e.message);
      }
    } else if (ext === "pdf" || mime.includes("pdf")) {
      // Try pdfjs text extraction first (fast, no API cost)
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          const text = textContent.items
            .map((item: any) => ("str" in item ? item.str : ""))
            .join(" ");
          if (text.trim()) pages.push(text);
        }
        extractedText = pages.join("\n\n");
      } catch (e: any) {
        console.warn("[fetch_submission_file] pdfjs parse failed:", e.message);
      }

      // Check if PDF is scanned (< 100 meaningful chars) → use Anthropic Vision OCR
      const meaningfulChars = (extractedText.match(/[a-zA-Z0-9àâäéèêëîïôöùûüçæœ]/gi) || []).length;
      if (meaningfulChars < 100) {
        console.log(`[fetch_submission_file] PDF has ${meaningfulChars} meaningful chars — using Vision OCR`);
        try {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const response = await client.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 16000,
            messages: [{
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: buffer.toString("base64"),
                  },
                } as any,
                {
                  type: "text",
                  text: "Extrais TOUT le texte de ce document PDF de soumission de construction. Retourne uniquement le texte brut fidèlement, ligne par ligne, sans résumé ni reformulation. Inclus tous les numéros de postes, descriptions, unités et quantités.",
                },
              ],
            }],
          });
          const visionText = response.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n");
          if (visionText.length > extractedText.length) {
            extractedText = visionText;
            console.log(`[fetch_submission_file] Vision OCR: ${visionText.length} chars extracted`);
          }
        } catch (e: any) {
          console.warn("[fetch_submission_file] Vision OCR failed:", e.message);
        }
      }
    } else {
      extractedText = buffer.toString("utf-8");
    }

    if (extractedText.length === 0) {
      return {
        error: true,
        message: `Le fichier "${submission.file_name}" n'a produit aucun texte extractible. Le document est peut-être vide ou dans un format non supporté.`,
      };
    }

    return {
      file_name: submission.file_name,
      file_type: ext || mime,
      text_length: extractedText.length,
      content: extractedText.slice(0, 200_000), // 200K chars max (~50K tokens)
    };
  },

  get_submission_context: async (input, ctx) => {
    const submissionId = input.submission_id as string;

    // Separate queries to avoid ambiguous FK (portal_submission_id)
    const { data: submission, error } = await (ctx.admin as any)
      .from("submissions")
      .select("id, title, reference, status, deadline, project_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (error || !submission) {
      console.error("[tool:get_submission_context] Query error:", error?.message);
      return { error: true, message: "Submission not found" };
    }

    // Fetch project separately for IDOR check + context
    let projectData: { name: string; code: string } | null = null;
    if (submission.project_id) {
      const { data: project } = await (ctx.admin as any)
        .from("projects")
        .select("name, code, organization_id")
        .eq("id", submission.project_id)
        .maybeSingle();
      if (!project || project.organization_id !== ctx.organizationId) {
        return { error: true, message: "Access denied" };
      }
      projectData = { name: project.name, code: project.code };
    }

    // Get existing items count
    const { count: itemsCount } = await (ctx.admin as any)
      .from("submission_items")
      .select("id", { count: "exact", head: true })
      .eq("submission_id", submissionId);

    // Get existing lots
    const { data: lots } = await (ctx.admin as any)
      .from("submission_lots")
      .select("id, title, lot_number, cfc_code")
      .eq("submission_id", submissionId);

    return {
      submission: {
        id: submission.id,
        title: submission.title,
        reference: submission.reference,
        status: submission.status,
        deadline: submission.deadline,
      },
      project: projectData || { name: "Unknown", code: "" },
      existing_items_count: itemsCount || 0,
      existing_lots: lots || [],
    };
  },

  save_analysis_result: async (input, ctx) => {
    const submissionId = input.submission_id as string;
    let items: any[];

    try {
      items = typeof input.items === "string" ? JSON.parse(input.items as string) : input.items;
    } catch {
      return { error: true, message: "Invalid items JSON" };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return { error: true, message: "Items array is empty" };
    }

    // Verify org ownership (separate queries to avoid ambiguous FK)
    const { data: submission } = await (ctx.admin as any)
      .from("submissions")
      .select("id, project_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission) {
      return { error: true, message: "Submission not found" };
    }

    if (submission.project_id) {
      const { data: project } = await (ctx.admin as any)
        .from("projects")
        .select("organization_id")
        .eq("id", submission.project_id)
        .maybeSingle();
      if (!project || project.organization_id !== ctx.organizationId) {
        return { error: true, message: "Access denied" };
      }
    }

    // Map agent output fields to actual DB columns.
    // CRITICAL column names (must match DB schema exactly):
    //   - "designation" (agent prompt) → "description" (DB)
    //   - "cfc_code" (agent prompt) → "cfc_subcode" (DB — NOT cfc_code!)
    //   - "project_id" must be included (required by DB)
    const dbItems = items.map((item: any, idx: number) => ({
      submission_id: submissionId,
      project_id: submission.project_id,
      item_number: item.item_number || String(idx + 1),
      description: item.designation || item.description || "",
      unit: item.unit || null,
      quantity: item.quantity != null ? Number(item.quantity) : null,
      cfc_subcode: item.cfc_code || item.cfc_subcode || null,
      material_group: item.material_group || "Divers",
      product_name: item.product_name || null,
      status: "pending",
      metadata: {
        lot_number: item.lot_number || null,
        lot_title: item.lot_title || null,
        chapter_number: item.chapter_number || null,
        chapter_title: item.chapter_title || null,
        source: "managed-agent",
      },
    }));

    // Delete existing items first (they're stale from a previous analysis)
    await (ctx.admin as any)
      .from("submission_items")
      .delete()
      .eq("submission_id", submissionId);

    // Insert new items
    const { error: insertError } = await (ctx.admin as any)
      .from("submission_items")
      .insert(dbItems);

    if (insertError) {
      // Mark submission as error since old items were already deleted
      await (ctx.admin as any)
        .from("submissions")
        .update({
          analysis_status: "error",
          analysis_error: `Sauvegarde échouée: ${insertError.message}`,
        })
        .eq("id", submissionId);
      return { error: true, message: `Insert failed: ${insertError.message}` };
    }

    // Update submission status — use "done" to match existing UI convention
    // Also clear stale budget estimates (items have changed)
    await (ctx.admin as any)
      .from("submissions")
      .update({
        analysis_status: "done",
        analysis_error: null,
        budget_estimate: null,
        budget_estimated_at: null,
      })
      .eq("id", submissionId);

    return {
      success: true,
      items_saved: dbItems.length,
      message: `${dbItems.length} postes sauvegardés pour la soumission ${submissionId}`,
    };
  },

  // ── Briefing Generator Tools ────────────────────────────

  fetch_cantaia_context: async (_input, ctx) => {
    // FIX #4: Never trust agent-supplied user_id/organization_id
    const userId = ctx.userId;
    const orgId = ctx.organizationId;
    const today = new Date().toISOString().slice(0, 10);

    // Parallel fetch of all context sources
    const [emailsRes, tasksRes, meetingsRes, projectsRes, submissionsRes] =
      await Promise.all([
        // Unread/action-required emails from last 24h
        (ctx.admin as any)
          .from("email_records")
          .select("id, subject, sender_name, sender_email, classification, ai_summary, received_at")
          .eq("user_id", userId)
          .in("classification", ["action_required", "urgent"])
          .gte("received_at", new Date(Date.now() - 86400000).toISOString())
          .order("received_at", { ascending: false })
          .limit(20),

        // Open tasks (created by OR assigned to user) — all priorities for accurate stats
        (ctx.admin as any)
          .from("tasks")
          .select("id, title, status, priority, due_date, project_id")
          .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
          .in("status", ["todo", "in_progress", "waiting"])
          .order("due_date", { ascending: true })
          .limit(50),

        // FIX #11: Today's meetings — scoped to org via project join
        (ctx.admin as any)
          .from("meetings")
          .select("id, title, meeting_date, location, projects!inner(name, organization_id)")
          .eq("projects.organization_id", orgId)
          .gte("meeting_date", `${today}T00:00:00`)
          .lte("meeting_date", `${today}T23:59:59`)
          .limit(10),

        // Active projects
        (ctx.admin as any)
          .from("projects")
          .select("id, name, code, status, client_name, city")
          .eq("organization_id", orgId)
          .in("status", ["active", "planning"])
          .limit(20),

        // Submission deadlines in the next 7 days — scoped to org
        (ctx.admin as any)
          .from("submissions")
          .select("id, title, deadline, status, projects!inner(name, organization_id)")
          .eq("projects.organization_id", orgId)
          .gte("deadline", today)
          .lte("deadline", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
          .in("status", ["draft", "sent", "responses"])
          .limit(10),
      ]);

    return {
      date: today,
      emails: emailsRes.data || [],
      urgent_tasks: tasksRes.data || [],
      meetings_today: meetingsRes.data || [],
      active_projects: projectsRes.data || [],
      upcoming_submission_deadlines: submissionsRes.data || [],
    };
  },

  save_briefing: async (input, ctx) => {
    // FIX #4: Never trust agent-supplied user_id
    const userId = ctx.userId;
    const orgId = ctx.organizationId;
    const briefingDate = input.briefing_date as string;
    let content: any;

    try {
      content = typeof input.content === "string" ? JSON.parse(input.content as string) : input.content;
    } catch {
      return { error: true, message: "Invalid content JSON" };
    }

    // Ensure mode is set to "ai" for agent-generated briefings
    if (content && typeof content === "object") {
      content.mode = "ai";
    }

    const { error } = await (ctx.admin as any)
      .from("daily_briefings")
      .upsert(
        {
          user_id: userId,
          organization_id: orgId,
          briefing_date: briefingDate,
          content,
          mode: "ai",
          is_sent: false,
        },
        { onConflict: "user_id,briefing_date" }
      );

    if (error) {
      return { error: true, message: `Save failed: ${error.message}` };
    }

    return { success: true, message: `Briefing saved for ${briefingDate}` };
  },

  // ── Email Classifier Tools ──────────────────────────────

  get_projects_list: async (_input, ctx) => {
    // FIX #4: Never trust agent-supplied organization_id
    const orgId = ctx.organizationId;

    const { data: projects } = await (ctx.admin as any)
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, client_name, status")
      .eq("organization_id", orgId)
      .in("status", ["active", "planning"]);

    return { projects: projects || [] };
  },

  fetch_emails_batch: async (input, ctx) => {
    // FIX #4: Never trust agent-supplied user_id
    const userId = ctx.userId;
    const batchSize = Math.min(Number(input.batch_size) || 50, 200);
    const mode = (input.mode as string) || "pending";

    let query = (ctx.admin as any)
      .from("email_records")
      .select("id, subject, sender_email, sender_name, recipients, received_at, body_preview, body_text, has_attachments, classification, classification_status")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(batchSize);

    // "pending" mode: only unclassified emails; "all" mode: ALL recent emails (for reclassification)
    if (mode !== "all") {
      query = query.or("classification_status.is.null,classification_status.eq.pending");
    }

    const { data: emails } = await query;

    return {
      emails: emails || [],
      count: emails?.length || 0,
      mode,
    };
  },

  save_classifications: async (input, ctx) => {
    let classifications: any[];
    try {
      classifications = typeof input.classifications === "string"
        ? JSON.parse(input.classifications as string)
        : input.classifications;
    } catch {
      return { error: true, message: "Invalid classifications JSON" };
    }

    if (!Array.isArray(classifications)) {
      return { error: true, message: "Classifications must be an array" };
    }

    let saved = 0;
    let errors = 0;

    for (const c of classifications) {
      const { error } = await (ctx.admin as any)
        .from("email_records")
        .update({
          project_id: c.project_id || null,
          classification: c.classification,
          ai_classification_confidence: c.confidence,
          ai_summary: c.ai_summary,
          ai_reasoning: c.ai_reasoning,
          classification_status: "classified",
          is_processed: true,
        })
        .eq("id", c.email_id)
        .eq("user_id", ctx.userId); // Scoped to auth user

      if (error) errors++;
      else saved++;
    }

    return { success: true, saved, errors, total: classifications.length };
  },

  // ── Plan Estimator Tools ────────────────────────────────

  fetch_plan_image: async (input, ctx) => {
    const planId = input.plan_id as string;

    // FIX #7: Order plan_versions by version_number DESC to get latest
    // NOTE: Do NOT filter on is_current_version — that flag marks the plan_registry
    // record itself as current vs superseded, not the version. Filtering on it would
    // silently reject valid plans. The version selection is handled by ORDER BY below.
    const { data: plan } = await (ctx.admin as any)
      .from("plan_registry")
      .select("id, plan_title, organization_id, plan_versions(file_url, file_type, version_number)")
      .eq("id", planId)
      .order("version_number", { referencedTable: "plan_versions", ascending: false })
      .maybeSingle();

    if (!plan || plan.organization_id !== ctx.organizationId) {
      return { error: true, message: "Plan not found or access denied" };
    }

    const version = plan.plan_versions?.[0];
    if (!version?.file_url) {
      return { error: true, message: "No file for this plan version" };
    }

    // Download from storage — use robust URL parsing (same pattern as fetch_file_content)
    let bucket = "plans";
    let objectPath = version.file_url;
    const PLAN_BUCKETS = ["submissions", "plans", "audio"];
    for (const b of PLAN_BUCKETS) {
      if (version.file_url.includes(`/${b}/`) || version.file_url.startsWith(`${b}/`)) {
        bucket = b;
        const idx = version.file_url.indexOf(`${b}/`);
        objectPath = version.file_url.slice(idx + b.length + 1);
        break;
      }
    }

    const { data: fileData, error: dlError } = await ctx.admin.storage
      .from(bucket)
      .download(objectPath);

    if (dlError || !fileData) {
      return { error: true, message: `Download failed (bucket=${bucket}): ${dlError?.message}` };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64 = buffer.toString("base64");

    // Detect MIME type from file_type field or filename extension
    const ft = (version.file_type || "").toLowerCase();
    let mimeType = "image/jpeg"; // safe default for Claude Vision
    if (ft.includes("png")) mimeType = "image/png";
    else if (ft.includes("gif")) mimeType = "image/gif";
    else if (ft.includes("webp")) mimeType = "image/webp";
    else if (ft.includes("pdf")) mimeType = "application/pdf";

    return {
      plan_title: plan.plan_title,
      image_base64: `data:${mimeType};base64,${base64}`,
      file_type: version.file_type,
    };
  },

  query_reference_prices: async (_input, ctx) => {
    // FIX #4: Never trust agent-supplied organization_id
    const orgId = ctx.organizationId;
    let items: any[];

    try {
      items = typeof _input.items === "string" ? JSON.parse(_input.items as string) : _input.items;
    } catch {
      return { error: true, message: "Invalid items JSON" };
    }

    // Import the price resolver from core
    const { resolvePrice } = await import("@cantaia/core/plans/estimation");

    const currentQuarter = `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;

    const results = await Promise.all(
      items.map(async (item: any) => {
        try {
          const price = await resolvePrice({
            cfc_code: item.cfc_code || "",
            description: item.description || "",
            unite: item.unit || "",
            region: item.region || "Genève",
            quarter: currentQuarter,
            org_id: orgId,
            supabase: ctx.admin,
          });
          return { ...item, price };
        } catch (err) {
          return { ...item, price: null, error: err instanceof Error ? err.message : "Unknown" };
        }
      })
    );

    return { prices: results };
  },

  save_estimation: async (input, ctx) => {
    const planId = input.plan_id as string;
    let result: any;

    try {
      result = typeof input.result === "string" ? JSON.parse(input.result as string) : input.result;
    } catch {
      return { error: true, message: "Invalid result JSON" };
    }

    // FIX #1: IDOR check — verify org ownership before writing
    const { data: plan } = await (ctx.admin as any)
      .from("plan_registry")
      .select("organization_id")
      .eq("id", planId)
      .maybeSingle();

    if (!plan || plan.organization_id !== ctx.organizationId) {
      return { error: true, message: "Plan not found or access denied" };
    }

    const { error } = await (ctx.admin as any)
      .from("plan_estimates")
      .insert({
        plan_id: planId,
        estimate_result: result,
        grand_total: result.grand_total || 0,
        confidence_summary: result.confidence || {},
        created_at: new Date().toISOString(),
      });

    if (error) {
      return { error: true, message: `Save failed: ${error.message}` };
    }

    return { success: true, message: "Estimation saved" };
  },

  // ── Price Extractor Tools ───────────────────────────────

  fetch_file_content: async (input, ctx) => {
    const fileUrl = input.file_url as string;
    const fileType = input.file_type as string;

    // Download from Supabase Storage or URL
    let buffer: Buffer;

    if (fileUrl.startsWith("http")) {
      // FIX #2: SSRF protection — only allow Supabase storage URLs
      if (!isAllowedUrl(fileUrl)) {
        return { error: true, message: "URL not in allowed domains. Use Supabase storage paths instead." };
      }
      const response = await fetch(fileUrl);
      if (!response.ok) {
        return { error: true, message: `Download failed: ${response.status}` };
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Storage path — detect bucket from path segment.
      // NOTE: "price-imports" is NOT a bucket — it's a path prefix inside the "plans" bucket.
      // Paths from upload-for-extraction look like: "plans/price-imports/{orgId}/{batchId}/{file}"
      const KNOWN_BUCKETS = ["submissions", "plans", "audio", "support", "chat-attachments"];
      let bucket = "plans"; // default fallback
      let objectPath = fileUrl;

      for (const b of KNOWN_BUCKETS) {
        if (fileUrl.includes(`/${b}/`) || fileUrl.startsWith(`${b}/`)) {
          bucket = b;
          // Extract the path AFTER the bucket name
          const idx = fileUrl.indexOf(`${b}/`);
          objectPath = fileUrl.slice(idx + b.length + 1);
          break;
        }
      }

      // Security: verify price-import paths contain the requesting org's ID
      if (objectPath.startsWith("price-imports/") && ctx.organizationId) {
        if (!objectPath.startsWith(`price-imports/${ctx.organizationId}/`)) {
          return { error: true, message: "Access denied: file belongs to another organization" };
        }
      }

      const { data, error } = await ctx.admin.storage.from(bucket).download(objectPath);
      if (error || !data) {
        return { error: true, message: `Storage download failed (bucket=${bucket}): ${error?.message}` };
      }
      buffer = Buffer.from(await data.arrayBuffer());
    }

    // Parse based on type — normalize MIME types to extensions
    const ft = (fileType || "").toLowerCase();
    let text = "";

    switch (true) {
      case ft === "pdf" || ft.includes("pdf"): {
        try {
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
          const pages: string[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pages.push(content.items.map((item: any) => item.str || "").join(" "));
          }
          text = pages.join("\n\n");
        } catch (e: any) {
          console.warn("[fetch_file_content] pdfjs parse failed:", e.message);
        }
        break;
      }
      case ft === "xlsx" || ft === "xls" || ft.includes("spreadsheet") || ft.includes("excel"): {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "buffer" });
        for (const name of wb.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
          const lines = csv.split("\n").filter((l: string) => l.replace(/,/g, "").trim());
          if (lines.length > 1) text += `\n=== ${name} ===\n${lines.join("\n")}`;
        }
        break;
      }
      case ft === "msg": {
        const { default: MsgReader } = await import("@kenjiuno/msgreader");
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const reader = new MsgReader(arrayBuffer as ArrayBuffer);
        const msg = reader.getFileData();
        text = `From: ${(msg as any).senderName} <${(msg as any).senderEmail}>\nSubject: ${(msg as any).subject}\n\n${(msg as any).body || ""}`;
        break;
      }
      default:
        text = buffer.toString("utf-8");
    }

    return {
      file_type: fileType,
      text_length: text.length,
      content: text.slice(0, 200_000),
    };
  },

  save_extracted_prices: async (input, ctx) => {
    // FIX #4: Never trust agent-supplied organization_id
    const orgId = ctx.organizationId;
    let prices: any[];

    try {
      prices = typeof input.prices === "string" ? JSON.parse(input.prices as string) : input.prices;
    } catch {
      return { error: true, message: "Invalid prices JSON" };
    }

    // Deduplication: fetch existing entries for this org to skip duplicates.
    // Match on (supplier_name, normalized_description, unit) — same price from same supplier = duplicate.
    // NOTE: Cap at 20K rows. For orgs with >20K ingested lines, some duplicates may slip through.
    // A DB-level unique constraint would be more robust but requires a migration.
    let existingKeys = new Set<string>();
    try {
      const { data: existing } = await (ctx.admin as any)
        .from("ingested_offer_lines")
        .select("supplier_name, normalized_description, unit")
        .eq("organization_id", orgId)
        .limit(20_000);
      if (existing?.length) {
        existingKeys = new Set(
          existing.map((e: any) =>
            `${(e.supplier_name || "").toLowerCase()}|${e.normalized_description || ""}|${(e.unit || "").toLowerCase()}`
          )
        );
      }
    } catch {
      // Non-fatal: proceed without dedup if query fails
    }

    const rows = prices
      .map((p: any) => ({
        organization_id: orgId,
        supplier_name: p.supplier_name,
        description: p.description,
        normalized_description: p.description?.toLowerCase().trim(),
        unit: p.unit,
        quantity: p.quantity,
        unit_price: p.unit_price,
        total_price: p.total_price,
        cfc_code: p.cfc_code,
        source: "managed_agent",
        source_file: p.source_file,
        imported_at: new Date().toISOString(),
      }))
      .filter((row: any) => {
        const key = `${(row.supplier_name || "").toLowerCase()}|${row.normalized_description || ""}|${(row.unit || "").toLowerCase()}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key); // Also dedup within the current batch
        return true;
      });

    if (rows.length === 0) {
      return { success: true, saved: 0, skipped_duplicates: prices.length };
    }

    const { error } = await (ctx.admin as any)
      .from("ingested_offer_lines")
      .insert(rows);

    if (error) {
      return { error: true, message: `Insert failed: ${error.message}` };
    }

    const skipped = prices.length - rows.length;
    return { success: true, saved: rows.length, ...(skipped > 0 ? { skipped_duplicates: skipped } : {}) };
  },
};
