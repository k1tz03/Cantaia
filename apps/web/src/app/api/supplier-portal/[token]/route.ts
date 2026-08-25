import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  PORTAL_IP_LIMIT,
  portalClientIp,
  supplierPortalClosedReason,
} from "@/lib/submissions/supplier-portal";
import { isValidPortalTokenFormat, normalizeSupplierLanguage } from "@cantaia/core/submissions";
import { notifyUser } from "@cantaia/core/notifications";

/**
 * PUBLIC — supplier portal API. No Supabase session: the opaque
 * `submission_price_requests.portal_token` IS the credential.
 *
 *   GET  /api/supplier-portal/[token]  → items of this package (no other
 *                                        supplier's data, no internal prices)
 *   POST /api/supplier-portal/[token]  → record the offer
 *
 * Hard rules enforced here:
 *   - only the items of THIS price request are ever returned;
 *   - no budget estimate, no competitor price, no internal note leaves;
 *   - prices posted are only accepted for item ids inside `items_requested`;
 *   - rate limited per token (10 submissions / hour, 60 reads / hour).
 */

const SUBMIT_LIMIT = { limit: 10, windowSec: 3600 };
const READ_LIMIT = { limit: 60, windowSec: 3600 };

/** Upper bound for a unit price — guards against typos and abuse. */
const MAX_UNIT_PRICE = 10_000_000;
const MAX_REMARK_LENGTH = 2000;
const MAX_CONDITIONS_LENGTH = 5000;

interface RequestedItem {
  id: string;
  item_number?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
}

interface PortalContext {
  request: any;
  submission: any;
  project: any;
  organizationName: string | null;
  requestedItems: RequestedItem[];
}

/**
 * Resolve a token to its price request + submission + project, or null.
 * Never distinguishes "unknown token" from "token of another org" — the
 * caller returns a flat 404 in both cases.
 */
async function resolvePortalToken(
  admin: ReturnType<typeof createAdminClient>,
  token: string
): Promise<PortalContext | null> {
  const { data: priceRequest, error } = await (admin as any)
    .from("submission_price_requests")
    .select("*")
    .eq("portal_token", token)
    .maybeSingle();

  if (error) {
    console.error("[supplier-portal] price request lookup failed:", error.message);
    return null;
  }
  if (!priceRequest) return null;

  const { data: submission } = await (admin as any)
    .from("submissions")
    .select("id, project_id, file_name, title, deadline")
    .eq("id", priceRequest.submission_id)
    .maybeSingle();

  if (!submission) return null;

  const { data: project } = await (admin as any)
    .from("projects")
    .select("id, name, code, city, organization_id")
    .eq("id", submission.project_id)
    .maybeSingle();

  let organizationName: string | null = null;
  if (project?.organization_id) {
    const { data: org } = await (admin as any)
      .from("organizations")
      .select("name")
      .eq("id", project.organization_id)
      .maybeSingle();
    organizationName = org?.name ?? null;
  }

  const requestedItems: RequestedItem[] = Array.isArray(priceRequest.items_requested)
    ? priceRequest.items_requested
    : [];

  return { request: priceRequest, submission, project, organizationName, requestedItems };
}

/** Display name of the supplier this link was issued to. */
async function resolveSupplierName(
  admin: ReturnType<typeof createAdminClient>,
  priceRequest: any
): Promise<string | null> {
  if (priceRequest.supplier_name_manual) return priceRequest.supplier_name_manual;
  if (!priceRequest.supplier_id) return null;
  const { data } = await (admin as any)
    .from("suppliers")
    .select("company_name, contact_name")
    .eq("id", priceRequest.supplier_id)
    .maybeSingle();
  return data?.company_name ?? null;
}

// ─────────────────────────────────────────────────────────────
// GET — items of this package
// ─────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isValidPortalTokenFormat(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ipLimit = await rateLimit(`portal:ip:${portalClientIp(request)}`, PORTAL_IP_LIMIT);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit);

  const limit = await rateLimit(`supplier-portal-read:${token}`, READ_LIMIT);
  if (!limit.allowed) return rateLimitResponse(limit);

  const admin = createAdminClient();
  const ctx = await resolvePortalToken(admin, token);
  if (!ctx) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supplierName = await resolveSupplierName(admin, ctx.request);

  // Existing portal answer (so the supplier can review / correct it).
  // Only quotes attached to THIS request are ever read.
  const { data: existingQuotes } = await (admin as any)
    .from("submission_quotes")
    .select("item_id, unit_price_ht, supplier_remarks")
    .eq("request_id", ctx.request.id);

  const previous: Record<string, { unit_price_ht: number | null; remarks: string | null }> = {};
  for (const q of existingQuotes || []) {
    if (!q.item_id) continue;
    previous[q.item_id] = {
      unit_price_ht: q.unit_price_ht != null ? Number(q.unit_price_ht) : null,
      remarks: q.supplier_remarks ?? null,
    };
  }

  // Record the first open (best effort — never blocks the read).
  if (!ctx.request.portal_opened_at) {
    const { error: openError } = await (admin as any)
      .from("submission_price_requests")
      .update({ portal_opened_at: new Date().toISOString() })
      .eq("id", ctx.request.id);
    if (openError) {
      console.warn("[supplier-portal] portal_opened_at not persisted:", openError.message);
    }
  }

  return NextResponse.json({
    success: true,
    language: normalizeSupplierLanguage(ctx.request.language),
    status: ctx.request.status,
    already_submitted: !!ctx.request.portal_submitted_at,
    submitted_at: ctx.request.portal_submitted_at ?? null,
    tracking_code: ctx.request.tracking_code,
    material_group: ctx.request.material_group,
    deadline: ctx.request.deadline || ctx.submission.deadline || null,
    currency: "CHF",
    project: {
      name: ctx.project?.name ?? null,
      city: ctx.project?.city ?? null,
    },
    organization_name: ctx.organizationName,
    supplier_name: supplierName,
    contact_name: ctx.request.portal_contact_name ?? null,
    conditions_text: ctx.request.conditions_text ?? null,
    // Deliberately narrowed: no cfc_code, no budget, no competitor data.
    items: ctx.requestedItems.map((i) => ({
      id: i.id,
      item_number: i.item_number ?? null,
      description: i.description ?? null,
      unit: i.unit ?? null,
      quantity: i.quantity != null ? Number(i.quantity) : null,
      previous_unit_price_ht: previous[i.id]?.unit_price_ht ?? null,
      previous_remarks: previous[i.id]?.remarks ?? null,
    })),
  });
}

// ─────────────────────────────────────────────────────────────
// POST — record the offer
// ─────────────────────────────────────────────────────────────

interface PostedLine {
  item_id: string;
  unit_price_ht: number | string | null;
  remarks?: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isValidPortalTokenFormat(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ipLimit = await rateLimit(`portal:ip:${portalClientIp(request)}`, PORTAL_IP_LIMIT);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit);

  const limit = await rateLimit(`supplier-portal:${token}`, SUBMIT_LIMIT);
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: {
    lines?: PostedLine[];
    conditions_text?: string | null;
    contact_name?: string | null;
    attachment?: { file_url: string; file_name: string } | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ctx = await resolvePortalToken(admin, token);
  if (!ctx) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Closed portal: the lot is awarded, or the deadline is > 7 days past.
  // 410 + { error: "closed", reason } — the public page shows a clean message.
  const closedReason = await supplierPortalClosedReason(
    admin,
    ctx.request,
    ctx.submission.deadline
  );
  if (closedReason) {
    return NextResponse.json({ error: "closed", reason: closedReason }, { status: 410 });
  }

  // The only attachment path a supplier may reference is one this very
  // request's upload endpoint issued (supplier-portal/<submission>/<request>/…).
  if (body.attachment?.file_url) {
    const requiredPrefix = `supplier-portal/${ctx.request.submission_id}/`;
    if (
      typeof body.attachment.file_url !== "string" ||
      !body.attachment.file_url.startsWith(requiredPrefix)
    ) {
      return NextResponse.json({ error: "invalid_attachment" }, { status: 400 });
    }
  }

  const allowedIds = new Set(ctx.requestedItems.map((i) => i.id));
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (lines.length === 0) {
    return NextResponse.json({ error: "no_lines" }, { status: 400 });
  }
  if (lines.length > allowedIds.size) {
    return NextResponse.json({ error: "too_many_lines" }, { status: 400 });
  }

  // ── Validate every posted line ────────────────────────────
  const quantityById = new Map<string, number | null>();
  for (const i of ctx.requestedItems) {
    quantityById.set(i.id, i.quantity != null ? Number(i.quantity) : null);
  }

  const accepted: Array<{
    item_id: string;
    unit_price_ht: number;
    total_ht: number | null;
    supplier_remarks: string | null;
  }> = [];
  // "I do not quote this item, and here is why" — the remark is kept as a
  // price-less quote row so the comparison table shows it (it used to be
  // silently dropped).
  const remarkOnly: Array<{ item_id: string; supplier_remarks: string }> = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line || typeof line.item_id !== "string" || !allowedIds.has(line.item_id)) {
      return NextResponse.json({ error: "unknown_item" }, { status: 400 });
    }
    if (seen.has(line.item_id)) {
      return NextResponse.json({ error: "duplicate_item" }, { status: 400 });
    }
    seen.add(line.item_id);

    const remarks =
      typeof line.remarks === "string" && line.remarks.trim()
        ? line.remarks.trim().slice(0, MAX_REMARK_LENGTH)
        : null;

    // A blank price is a legitimate "I do not quote this item".
    if (line.unit_price_ht === null || line.unit_price_ht === undefined || line.unit_price_ht === "") {
      if (remarks) remarkOnly.push({ item_id: line.item_id, supplier_remarks: remarks });
      continue;
    }

    const price = typeof line.unit_price_ht === "string"
      ? Number(line.unit_price_ht.replace(/[’'\s]/g, "").replace(",", "."))
      : Number(line.unit_price_ht);

    if (!Number.isFinite(price) || price < 0 || price > MAX_UNIT_PRICE) {
      return NextResponse.json(
        { error: "invalid_price", item_id: line.item_id },
        { status: 400 }
      );
    }

    const qty = quantityById.get(line.item_id) ?? null;
    accepted.push({
      item_id: line.item_id,
      unit_price_ht: price,
      total_ht: qty != null && Number.isFinite(qty) ? price * qty : null,
      supplier_remarks: remarks,
    });
  }

  if (accepted.length === 0) {
    return NextResponse.json({ error: "no_prices" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // ── Replace any previous answer for this request ──────────
  // A supplier may re-open the link and correct their prices; keeping both
  // versions would double-count them in the comparison table.
  const { error: deleteError } = await (admin as any)
    .from("submission_quotes")
    .delete()
    .eq("request_id", ctx.request.id);

  if (deleteError) {
    console.error("[supplier-portal] failed to clear previous quotes:", deleteError.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const rows = [
    ...accepted.map((a) => ({
      request_id: ctx.request.id,
      submission_id: ctx.request.submission_id,
      item_id: a.item_id,
      unit_price_ht: a.unit_price_ht as number | null,
      total_ht: a.total_ht,
      currency: "CHF",
      // Typed by the supplier themselves — no extraction uncertainty.
      confidence: 1,
      supplier_remarks: a.supplier_remarks,
      source: "portal",
      extracted_at: now,
    })),
    // Price-less rows carrying only the supplier's remark for that item.
    ...remarkOnly.map((r) => ({
      request_id: ctx.request.id,
      submission_id: ctx.request.submission_id,
      item_id: r.item_id,
      unit_price_ht: null as number | null,
      total_ht: null,
      currency: "CHF",
      confidence: 1,
      supplier_remarks: r.supplier_remarks,
      source: "portal",
      extracted_at: now,
    })),
  ];

  let { error: insertError } = await (admin as any).from("submission_quotes").insert(rows);

  // Graceful degradation when migration 099 has not been applied yet.
  if (insertError && /source/i.test(insertError.message || "")) {
    console.warn("[supplier-portal] submission_quotes.source missing — apply migration 099");
    const withoutSource = rows.map((row) => {
      const copy: Record<string, unknown> = { ...row };
      delete copy.source;
      return copy;
    });
    const retry = await (admin as any).from("submission_quotes").insert(withoutSource);
    insertError = retry.error;
  }

  if (insertError) {
    console.error("[supplier-portal] quote insert failed:", insertError.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Flag the quoted items
  const { error: itemStatusError } = await (admin as any)
    .from("submission_items")
    .update({ status: "quoted" })
    .in("id", accepted.map((a) => a.item_id));
  if (itemStatusError) {
    console.warn("[supplier-portal] item status not updated:", itemStatusError.message);
  }

  // ── Update the price request ──────────────────────────────
  const conditions =
    typeof body.conditions_text === "string" && body.conditions_text.trim()
      ? body.conditions_text.trim().slice(0, MAX_CONDITIONS_LENGTH)
      : null;

  let responseTimeDays: number | null = null;
  if (ctx.request.sent_at) {
    const deltaMs = new Date(now).getTime() - new Date(ctx.request.sent_at).getTime();
    responseTimeDays = Math.round((deltaMs / 86_400_000) * 10) / 10;
  }

  // Core state first — this one must land (same split as receive-quote so a
  // database missing migration 082/099 still records the response).
  const coreUpdate: Record<string, unknown> = { status: "responded" };
  if (conditions) coreUpdate.conditions_text = conditions;

  const { error: statusError } = await (admin as any)
    .from("submission_price_requests")
    .update(coreUpdate)
    .eq("id", ctx.request.id);

  if (statusError) {
    console.error("[supplier-portal] failed to mark request responded:", statusError.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Metrics + portal bookkeeping — degrade gracefully.
  const metaUpdate: Record<string, unknown> = {
    response_received_at: now,
    response_time_days: responseTimeDays,
    portal_submitted_at: now,
    response_source: "portal",
  };
  if (typeof body.contact_name === "string" && body.contact_name.trim()) {
    metaUpdate.portal_contact_name = body.contact_name.trim().slice(0, 200);
  }
  if (body.attachment?.file_url) {
    const existing = Array.isArray(ctx.request.attachments) ? ctx.request.attachments : [];
    metaUpdate.attachments = [
      ...existing,
      {
        file_url: body.attachment.file_url,
        file_name: body.attachment.file_name || "offre.pdf",
        source: "portal",
        uploaded_at: now,
      },
    ];
  }

  const { error: metaError } = await (admin as any)
    .from("submission_price_requests")
    .update(metaUpdate)
    .eq("id", ctx.request.id);

  if (metaError) {
    console.warn(
      "[supplier-portal] portal metadata not persisted (apply migrations 082 / 099):",
      metaError.message
    );
  }

  // Supplier scoring — never blocks the supplier's submission.
  if (ctx.request.supplier_id && ctx.project?.organization_id) {
    try {
      const { recalculateAndPersistScore } = await import("@cantaia/core/suppliers");
      await recalculateAndPersistScore(
        ctx.request.supplier_id,
        ctx.project.organization_id,
        admin
      );
    } catch (err) {
      console.warn("[supplier-portal] score recalculation failed (non-fatal):", err);
    }
  }

  // "Offre reçue" notification to whoever sent the request — best effort,
  // never blocks the supplier's submission.
  try {
    await notifyOfferReceived(admin, ctx, accepted.length);
  } catch (err) {
    console.warn("[supplier-portal] offer_received notification failed (non-fatal):", err);
  }

  return NextResponse.json({
    success: true,
    lines_recorded: accepted.length,
    remarks_recorded: remarkOnly.length,
    submitted_at: now,
  });
}

/**
 * Emails the requester that this supplier's offer just arrived.
 * Recipient resolution: submission_price_requests.sent_by (migration 104) →
 * submissions.user_id → projects.created_by. Every step is tolerant of an
 * older schema (a failed lookup falls through, it never throws to the caller).
 */
async function notifyOfferReceived(
  admin: ReturnType<typeof createAdminClient>,
  ctx: PortalContext,
  linesRecorded: number
): Promise<void> {
  let recipientId: string | null = ctx.request.sent_by ?? null;

  if (!recipientId) {
    const { data: sub } = await (admin as any)
      .from("submissions")
      .select("user_id")
      .eq("id", ctx.request.submission_id)
      .maybeSingle();
    recipientId = sub?.user_id ?? null;
  }

  if (!recipientId && ctx.project?.id) {
    const { data: proj } = await (admin as any)
      .from("projects")
      .select("created_by")
      .eq("id", ctx.project.id)
      .maybeSingle();
    recipientId = proj?.created_by ?? null;
  }

  if (!recipientId) return;

  const supplierName = (await resolveSupplierName(admin, ctx.request)) || "Un fournisseur";
  const materialGroup = ctx.request.material_group || "Divers";
  const projectName = ctx.project?.name || ctx.submission?.title || "";

  await notifyUser(admin as any, {
    userId: recipientId,
    event: "offer_received",
    subject: `Offre reçue — ${supplierName} (${materialGroup})`,
    title: "Nouvelle offre fournisseur",
    body:
      `${supplierName} a soumis son offre pour le lot « ${materialGroup} »` +
      `${projectName ? ` du projet ${projectName}` : ""} via le portail fournisseur ` +
      `(${linesRecorded} prix saisi${linesRecorded > 1 ? "s" : ""}).`,
    ctaLabel: "Voir la comparaison",
    ctaPath: `/submissions/${ctx.request.submission_id}`,
  });
}
