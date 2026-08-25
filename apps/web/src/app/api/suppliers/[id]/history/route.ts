import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/suppliers/:id/history
 * Returns a chronological timeline of all interactions with this supplier:
 * - supplier_offers (received offers)
 * - price_requests (sent price requests) via both legacy and enhanced tables
 * - email_records (emails from supplier — scoped to the org's own users)
 * Ordered by date desc, limited to 20 items by default.
 *
 * Every source degrades gracefully: on a Supabase error the source is skipped and
 * `partial: true` is returned so the client can tell "no history" from "load failed".
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
  // Flipped whenever a source query returns a Supabase error so the client can
  // distinguish an empty timeline from a partial failure.
  let partial = false;

  // 1. Supplier offers
  {
    const { data: offers, error } = await (adminClient as any)
      .from("supplier_offers")
      .select("id, received_at, created_at, total_amount, currency, status, submission_id, submissions(title)")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.warn("[supplier-history] Offers query failed:", error.message);
      partial = true;
    } else if (offers) {
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
  }

  // 2. Price requests (legacy table)
  {
    const { data: legacyRequests, error } = await (adminClient as any)
      .from("price_requests")
      .select("id, created_at, sent_at, status, submission_id, submissions(title)")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    // The legacy table may not exist in every environment — a "relation does not
    // exist" is expected here and not counted as a partial failure.
    if (error && !/does not exist|relation/i.test(error.message || "")) {
      console.warn("[supplier-history] Legacy requests query failed:", error.message);
      partial = true;
    } else if (legacyRequests) {
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
  }

  // 2b. Price requests (enhanced table from migration 049), scoped to the org
  //     through the parent submission.
  {
    const { data: enhancedRequests, error } = await (adminClient as any)
      .from("submission_price_requests")
      .select("id, created_at, sent_at, status, submission_id, submissions!inner(title, organization_id)")
      .eq("supplier_id", supplierId)
      .eq("submissions.organization_id", userOrg.organization_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error && !/does not exist|relation/i.test(error.message || "")) {
      console.warn("[supplier-history] Enhanced requests query failed:", error.message);
      partial = true;
    } else if (enhancedRequests) {
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
  }

  // 3. Emails from supplier — scoped to the org's own mailboxes.
  // email_records is user-scoped (user_id NOT NULL): filtering only on
  // sender_email would surface every org's emails for that address (cross-tenant
  // leak). Restrict to the user_ids belonging to this organization.
  if (supplier.email) {
    const { data: orgUsers, error: usersErr } = await adminClient
      .from("users")
      .select("id")
      .eq("organization_id", userOrg.organization_id);

    if (usersErr) {
      console.warn("[supplier-history] Org users query failed:", usersErr.message);
      partial = true;
    } else {
      const orgUserIds = (orgUsers || []).map((u: any) => u.id);
      if (orgUserIds.length > 0) {
        const { data: emails, error } = await (adminClient as any)
          .from("email_records")
          .select("id, received_at, subject, sender_email")
          .eq("sender_email", supplier.email)
          .in("user_id", orgUserIds)
          .order("received_at", { ascending: false })
          .limit(limit);

        if (error) {
          console.warn("[supplier-history] Emails query failed:", error.message);
          partial = true;
        } else if (emails) {
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
      }
    }
  }

  // Sort by date desc and limit
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = items.length;
  const limited = items.slice(0, limit);

  // 4. Price trend data (for chart)
  const priceTrend: { date: string; avg_price: number; cfc_group: string }[] = [];
  {
    const { data: offerPrices, error } = await (adminClient as any)
      .from("offer_line_items")
      .select("unit_price, cfc_subcode, created_at, supplier_offers!inner(received_at)")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .not("unit_price", "is", null)
      .order("created_at", { ascending: true });

    if (error && !/does not exist|relation/i.test(error.message || "")) {
      console.warn("[supplier-history] Price trend query failed:", error.message);
      partial = true;
    } else if (offerPrices && offerPrices.length >= 3) {
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
  }

  // 5. Alerts
  const alerts: { type: string; message: string; severity: "warning" | "info" }[] = [];

  // Alert: No response to recent request
  {
    // Check latest price_request without a matching offer
    const { data: pendingRequests, error } = await (adminClient as any)
      .from("price_requests")
      .select("id, sent_at, created_at")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error && !/does not exist|relation/i.test(error.message || "")) {
      console.warn("[supplier-history] Pending requests query failed:", error.message);
      partial = true;
    } else if (!pendingRequests || pendingRequests.length === 0) {
      // Also check submission_price_requests (scoped through the submission's org)
      const { data: pendingEnhanced, error: enhErr } = await (adminClient as any)
        .from("submission_price_requests")
        .select("id, sent_at, created_at, submissions!inner(organization_id)")
        .eq("supplier_id", supplierId)
        .eq("submissions.organization_id", userOrg.organization_id)
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(1);

      if (enhErr && !/does not exist|relation/i.test(enhErr.message || "")) {
        console.warn("[supplier-history] Pending enhanced query failed:", enhErr.message);
        partial = true;
      } else if (pendingEnhanced && pendingEnhanced.length > 0) {
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
  }

  // Alert: Expired certifications
  {
    const { data: supplierFull, error } = await (adminClient as any)
      .from("suppliers")
      .select("certifications")
      .eq("id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .maybeSingle();

    if (error) {
      console.warn("[supplier-history] Certifications query failed:", error.message);
      partial = true;
    } else if (supplierFull?.certifications) {
      const certs = supplierFull.certifications as string[];
      for (const cert of certs) {
        // Check if cert contains a date pattern like DD.MM.YYYY
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
  }

  return NextResponse.json({
    items: limited,
    total,
    has_more: total > limit,
    price_trend: priceTrend,
    alerts,
    partial,
  });
}
