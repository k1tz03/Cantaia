import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/suppliers/:id/history
 * Returns a chronological timeline of all interactions with this supplier:
 * - supplier_offers (received offers)
 * - price_requests (sent price requests) via both legacy and enhanced tables
 * - email_records (emails from supplier)
 * Ordered by date desc, limited to 20 items by default.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: supplierId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  // Verify supplier belongs to user's org and get their email
  const { data: supplier } = await (adminClient as any)
    .from("suppliers")
    .select("id, email, company_name")
    .eq("id", supplierId)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  type TimelineItem = {
    id: string;
    type: "offer" | "request" | "email";
    date: string;
    description: string;
    meta?: Record<string, unknown>;
  };

  const items: TimelineItem[] = [];

  // 1. Supplier offers
  try {
    const { data: offers } = await (adminClient as any)
      .from("supplier_offers")
      .select("id, received_at, created_at, total_amount, currency, status, submission_id, submissions(title)")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (offers) {
      for (const o of offers) {
        const submTitle = (o as any).submissions?.title || "Sans titre";
        const amount = o.total_amount
          ? `CHF ${new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2 }).format(o.total_amount)}`
          : "";
        items.push({
          id: o.id,
          type: "offer",
          date: o.received_at || o.created_at,
          description: `Offre reçue — ${submTitle}${amount ? ` — ${amount}` : ""}`,
          meta: {
            submission_id: o.submission_id,
            total_amount: o.total_amount,
            currency: o.currency,
            status: o.status,
          },
        });
      }
    }
  } catch (err) {
    console.warn("[supplier-history] Offers query failed:", err);
  }

  // 2. Price requests (legacy table)
  try {
    const { data: legacyRequests } = await (adminClient as any)
      .from("price_requests")
      .select("id, created_at, sent_at, status, submission_id, submissions(title)")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (legacyRequests) {
      for (const pr of legacyRequests) {
        const submTitle = (pr as any).submissions?.title || "Sans titre";
        items.push({
          id: pr.id,
          type: "request",
          date: pr.sent_at || pr.created_at,
          description: `Demande envoyée — ${submTitle}`,
          meta: {
            submission_id: pr.submission_id,
            status: pr.status,
          },
        });
      }
    }
  } catch {
    // table may not exist
  }

  // 2b. Price requests (enhanced table from migration 049)
  try {
    const { data: enhancedRequests } = await (adminClient as any)
      .from("submission_price_requests")
      .select("id, created_at, sent_at, status, submission_id, submissions(title)")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (enhancedRequests) {
      // Deduplicate by checking if already in items from legacy table
      const existingIds = new Set(items.map((i) => i.id));
      for (const pr of enhancedRequests) {
        if (existingIds.has(pr.id)) continue;
        const submTitle = (pr as any).submissions?.title || "Sans titre";
        items.push({
          id: pr.id,
          type: "request",
          date: pr.sent_at || pr.created_at,
          description: `Demande envoyée — ${submTitle}`,
          meta: {
            submission_id: pr.submission_id,
            status: pr.status,
          },
        });
      }
    }
  } catch {
    // table may not exist (migration 049)
  }

  // 3. Emails from supplier
  if (supplier.email) {
    try {
      const { data: emails } = await (adminClient as any)
        .from("email_records")
        .select("id, received_at, subject, sender_email")
        .eq("sender_email", supplier.email)
        .order("received_at", { ascending: false })
        .limit(limit);

      if (emails) {
        for (const em of emails) {
          const subject = em.subject || "(Sans objet)";
          items.push({
            id: em.id,
            type: "email",
            date: em.received_at,
            description: `Email — ${subject.length > 60 ? subject.substring(0, 57) + "..." : subject}`,
            meta: {
              email_id: em.id,
              subject: em.subject,
            },
          });
        }
      }
    } catch {
      // email_records may not have matching data
    }
  }

  // Sort by date desc and limit
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = items.length;
  const limited = items.slice(0, limit);

  // 4. Price trend data (for chart)
  let priceTrend: { date: string; avg_price: number; cfc_group: string }[] = [];
  try {
    const { data: offerPrices } = await (adminClient as any)
      .from("offer_line_items")
      .select("unit_price, cfc_subcode, created_at, supplier_offers!inner(received_at)")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .not("unit_price", "is", null)
      .order("created_at", { ascending: true });

    if (offerPrices && offerPrices.length >= 3) {
      // Group by month and CFC group (first 3 digits)
      const byMonth: Record<string, { prices: number[]; cfc: string }> = {};
      for (const p of offerPrices) {
        const date = (p as any).supplier_offers?.received_at || p.created_at;
        if (!date) continue;
        const monthKey = date.substring(0, 7); // YYYY-MM
        const cfcGroup = p.cfc_subcode ? p.cfc_subcode.substring(0, 3) : "all";
        const key = `${monthKey}|${cfcGroup}`;
        if (!byMonth[key]) byMonth[key] = { prices: [], cfc: cfcGroup };
        byMonth[key].prices.push(parseFloat(p.unit_price));
      }

      for (const [key, data] of Object.entries(byMonth)) {
        const [date] = key.split("|");
        const avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
        priceTrend.push({
          date,
          avg_price: Math.round(avg * 100) / 100,
          cfc_group: data.cfc,
        });
      }
      priceTrend.sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch {
    // ignore
  }

  // 5. Alerts
  const alerts: { type: string; message: string; severity: "warning" | "info" }[] = [];

  // Alert: No response to recent request
  try {
    // Check latest price_request without a matching offer
    const { data: pendingRequests } = await (adminClient as any)
      .from("price_requests")
      .select("id, sent_at, created_at")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!pendingRequests || pendingRequests.length === 0) {
      // Also check submission_price_requests
      try {
        const { data: pendingEnhanced } = await (adminClient as any)
          .from("submission_price_requests")
          .select("id, sent_at, created_at")
          .eq("supplier_id", supplierId)
          .eq("status", "sent")
          .order("created_at", { ascending: false })
          .limit(1);

        if (pendingEnhanced && pendingEnhanced.length > 0) {
          const sentDate = new Date(pendingEnhanced[0].sent_at || pendingEnhanced[0].created_at);
          const daysSince = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 14) {
            alerts.push({
              type: "no_response",
              message: `Pas de réponse depuis ${Math.round(daysSince)} jours`,
              severity: "warning",
            });
          }
        }
      } catch { /* ignore */ }
    } else {
      const sentDate = new Date(pendingRequests[0].sent_at || pendingRequests[0].created_at);
      const daysSince = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 14) {
        alerts.push({
          type: "no_response",
          message: `Pas de réponse depuis ${Math.round(daysSince)} jours`,
          severity: "warning",
        });
      }
    }
  } catch { /* ignore */ }

  // Alert: Expired certifications
  try {
    const { data: supplierFull } = await (adminClient as any)
      .from("suppliers")
      .select("certifications")
      .eq("id", supplierId)
      .maybeSingle();

    if (supplierFull?.certifications) {
      const certs = supplierFull.certifications as string[];
      for (const cert of certs) {
        // Check if cert contains a date pattern like YYYY or DD.MM.YYYY
        const dateMatch = cert.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dateMatch) {
          const parts = dateMatch[1].split(".");
          const certDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          if (certDate < new Date()) {
            alerts.push({
              type: "expired_cert",
              message: `Certification expirée : ${cert}`,
              severity: "warning",
            });
          }
        }
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    items: limited,
    total,
    has_more: total > limit,
    price_trend: priceTrend,
    alerts,
  });
}
