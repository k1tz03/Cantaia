import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPriceRequestEmail,
  cleanDescriptionForSupplier,
  formatSupplierDate,
  formatSupplierNumber,
  normalizeSupplierLanguage,
  supplierStrings,
  type SupplierLanguage,
} from "@cantaia/core/submissions";

/**
 * Email preview for one (supplier, lot) pair of a price request.
 * Returns: { subject, body, body_text, to, tracking_code, … }
 *
 *   GET  /api/submissions/[id]/preview-email
 *        ?group=Béton&supplier_id=xxx&language=de&deadline=…&item_ids=a,b
 *        &manual_name=…&manual_email=…&manual_contact=…
 *        (aliases supplier_name_manual / supplier_email_manual accepted)
 *
 *   POST /api/submissions/[id]/preview-email
 *        { material_group, supplier_id?, manual_name?, manual_email?,
 *          manual_contact?, language?, item_ids?, deadline? }
 *        — same aliases accepted; `group` accepted for material_group.
 *
 * A manual supplier is one with no DB row: either `supplier_id` starts with
 * "temp-", or no supplier_id is given at all — the manual_* fields then feed
 * the preview directly (they used to be dropped, so the wizard previewed
 * "Fournisseur" with no address for every manually-added supplier).
 *
 * The preview goes through the SAME templates as send-price-requests
 * (@cantaia/core/submissions/email-templates) — the two used to hold two
 * independent French-only copies that drifted apart, and neither honoured the
 * `language` the wizard sends.
 */

interface PreviewParams {
  group: string | null;
  supplierId: string | null;
  deadline: string | null;
  manualName: string | null;
  manualEmail: string | null;
  manualContact: string | null;
  language: string | null;
  itemIds: string[] | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function buildPreviewResponse(
  submissionId: string,
  userId: string,
  p: PreviewParams
): Promise<NextResponse> {
  const admin = createAdminClient();

  const group = p.group;
  const supplierId = p.supplierId;

  // A preview needs a lot, and either a DB supplier or manual supplier data.
  if (!group || (!supplierId && !p.manualName && !p.manualEmail)) {
    return NextResponse.json(
      { error: "group and supplier_id (or manual_name/manual_email) required" },
      { status: 400 }
    );
  }

  // Get user profile first — the org is needed for every check below.
  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("first_name, last_name, email, organization_id, job_title")
    .eq("id", userId)
    .maybeSingle();

  if (!userProfile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get submission with project info
  const { data: submission } = await admin
    .from("submissions")
    .select("*, projects!submissions_project_id_fkey(id, name, code, client_name, city, organization_id)")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  // Anti-IDOR: UNCONDITIONAL — a submission with no project (or whose project
  // belongs to another org) is never previewable.
  const proj = (submission as any).projects;
  if (!proj?.organization_id || proj.organization_id !== userProfile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get supplier — from DB (org-scoped) or manual params
  const isManual = !supplierId || supplierId.startsWith("temp-");
  let supplier: { company_name: string; contact_name: string | null; email: string | null };

  if (isManual) {
    supplier = {
      company_name: p.manualName || "Fournisseur",
      contact_name: p.manualContact || null,
      email: p.manualEmail || null,
    };
  } else {
    const { data: dbSupplier } = await admin
      .from("suppliers")
      .select("company_name, contact_name, email")
      .eq("id", supplierId)
      .eq("organization_id", userProfile.organization_id)
      .maybeSingle();

    if (!dbSupplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    supplier = dbSupplier;
  }

  // Get org name
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", userProfile.organization_id)
    .maybeSingle();

  // Get items for this group, optionally filtered by item_ids
  const itemIdsFilter = p.itemIds && p.itemIds.length > 0 ? new Set(p.itemIds) : null;

  const { data: allItems } = await (admin as any)
    .from("submission_items")
    .select("*")
    .eq("submission_id", submissionId);

  let groupItems = (allItems || []).filter((i: any) => i.material_group === group);
  if (itemIdsFilter) {
    groupItems = groupItems.filter((i: any) => itemIdsFilter.has(i.id));
  }

  // Generate preview tracking code
  const shortId = submissionId.slice(0, 4).toUpperCase();
  const groupSlug = group
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .slice(0, 15);
  const trackingCode = `SUB-${shortId}-${groupSlug}-XXXXXX`;

  const language: SupplierLanguage = normalizeSupplierLanguage(p.language);
  const s = supplierStrings(language);

  const projectName = (submission as any).projects?.name || "Projet";
  const projectCode = (submission as any).projects?.code;
  const senderName = `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim();

  const deadline = p.deadline;

  // The portal link is minted at send time (one token per real request), so
  // the preview shows a placeholder block instead of a dead URL.
  const { subject: templateSubject, html } = buildPriceRequestEmail({
    contactName: supplier.contact_name,
    projectName,
    materialGroup: group,
    items: groupItems,
    trackingCode,
    portalUrl: process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/${language}/offre/…`
      : null,
    deadline,
    senderName,
    senderCompany: org?.name || "",
    senderTitle: userProfile?.job_title || null,
    language,
  });

  const subject = projectCode
    ? templateSubject.replace(projectName, `${projectName} (${projectCode})`)
    : templateSubject;

  // ── Plain-text mirror for the editable textarea ────────────
  const contactFirstName = supplier.contact_name?.split(/\s+/)[0] || null;
  const deadlineStr = formatSupplierDate(deadline, language);

  const colWidths = { num: 6, desc: 40, unit: 8, qty: 10 };
  const pad = (v: string, w: number) => (v.length >= w ? v.slice(0, w) : v + " ".repeat(w - v.length));
  const padR = (v: string, w: number) => (v.length >= w ? v.slice(0, w) : " ".repeat(w - v.length) + v);
  const separator = "-".repeat(colWidths.num + colWidths.desc + colWidths.unit + colWidths.qty + 9);
  const textTable = [
    `${pad(s.colNumber, colWidths.num)} | ${pad(s.colDescription, colWidths.desc)} | ${pad(s.colUnit, colWidths.unit)} | ${padR(s.colQuantity, colWidths.qty)}`,
    separator,
    ...groupItems.map((i: any) => {
      const num = (i.item_number || "-").slice(0, colWidths.num);
      const desc = cleanDescriptionForSupplier(i.description || "").slice(0, colWidths.desc);
      const unit = (i.unit || "-").slice(0, colWidths.unit);
      const qty = i.quantity != null ? formatSupplierNumber(Number(i.quantity), language, 0) : "-";
      return `${pad(num, colWidths.num)} | ${pad(desc, colWidths.desc)} | ${pad(unit, colWidths.unit)} | ${padR(qty, colWidths.qty)}`;
    }),
  ].join("\n");

  // `stripTags` keeps the plain-text mirror readable: the template fragments
  // carry <strong> markers that must not leak into a textarea.
  const stripTags = (v: string) => v.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

  const bodyText = [
    `${s.greeting(contactFirstName)},`,
    stripTags(s.prIntro(projectName, group)),
    textTable,
    stripTags(s.prDeadline(deadlineStr)),
    s.prAvailable,
    `${s.closing}\n${senderName}${userProfile?.job_title ? `\n${userProfile.job_title}` : ""}\n${org?.name || ""}`,
  ]
    .join("\n\n")
    .trim();

  return NextResponse.json({
    success: true,
    subject,
    body: html,
    body_text: bodyText,
    language,
    to: supplier.email,
    supplier_name: supplier.company_name,
    tracking_code: trackingCode,
    items_count: groupItems.length,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = request.nextUrl.searchParams;
    const itemIdsParam = q.get("item_ids");

    return await buildPreviewResponse(submissionId, user.id, {
      group: asString(q.get("group")) || asString(q.get("material_group")),
      supplierId: asString(q.get("supplier_id")),
      deadline: asString(q.get("deadline")),
      manualName: asString(q.get("manual_name")) || asString(q.get("supplier_name_manual")),
      manualEmail: asString(q.get("manual_email")) || asString(q.get("supplier_email_manual")),
      manualContact: asString(q.get("manual_contact")),
      language: asString(q.get("language")),
      itemIds: itemIdsParam ? itemIdsParam.split(",").filter(Boolean) : null,
    });
  } catch (err: any) {
    console.error("[preview-email] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const rawItemIds = body.item_ids;
    const itemIds = Array.isArray(rawItemIds)
      ? rawItemIds.filter((v): v is string => typeof v === "string" && !!v)
      : typeof rawItemIds === "string" && rawItemIds
        ? rawItemIds.split(",").filter(Boolean)
        : null;

    return await buildPreviewResponse(submissionId, user.id, {
      group: asString(body.material_group) || asString(body.group),
      supplierId: asString(body.supplier_id),
      deadline: asString(body.deadline),
      manualName: asString(body.manual_name) || asString(body.supplier_name_manual),
      manualEmail: asString(body.manual_email) || asString(body.supplier_email_manual),
      manualContact: asString(body.manual_contact),
      language: asString(body.language),
      itemIds,
    });
  } catch (err: any) {
    console.error("[preview-email] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
