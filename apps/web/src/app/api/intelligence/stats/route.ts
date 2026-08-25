import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface DimensionStat {
  count: number;
  threshold: number;
}

interface JournalEntry {
  type: string;
  description: string;
  date: string;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user profile for organization_id
  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const orgId = profile.organization_id;

  // ── Dimension counts ──
  //
  // AUDIT 08/2026 — les colonnes org ne portent PAS le même nom partout :
  //   * price_calibrations / quantity_corrections (043)  → `org_id`
  //   * offer_line_items / suppliers / supplier_offers /
  //     planning_duration_corrections / email_classification_feedback
  //                                                       → `organization_id`
  // L'ancien code filtrait `organization_id` partout : PostgREST renvoyait une
  // erreur (silencieuse — supabase-js ne throw pas), le count restait null et
  // ces dimensions affichaient 0 en permanence.

  // Prix: offer_line_items + price_calibrations
  let pricesCount = 0;
  {
    const { count: offerCount } = await (admin as any)
      .from("offer_line_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    pricesCount += offerCount || 0;
  }
  {
    const { count: calibCount } = await (admin as any)
      .from("price_calibrations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    pricesCount += calibCount || 0;
  }

  // Plans: plan_analyses (org via jointure plan_registry).
  // AUDIT 08/2026 — l'ancien fallback re-comptait TOUTES les plan_analyses de
  // la plateforme sans filtre org (fuite cross-tenant). Supprimé : si la
  // jointure échoue, on affiche 0, jamais le total global.
  let plansCount = 0;
  {
    const { count } = await (admin as any)
      .from("plan_analyses")
      .select("id, plan_registry!inner(organization_id)", {
        count: "exact",
        head: true,
      })
      .eq("plan_registry.organization_id", orgId);
    plansCount = count || 0;
  }

  // Planning: planning_duration_corrections (table may not exist)
  let planningCount = 0;
  {
    const { count } = await (admin as any)
      .from("planning_duration_corrections")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    planningCount = count || 0;
  }

  // Emails: email_classification_feedback
  let emailsCount = 0;
  {
    const { count } = await (admin as any)
      .from("email_classification_feedback")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    emailsCount = count || 0;
  }

  // Fournisseurs: suppliers + supplier_offers
  let suppliersCount = 0;
  {
    const { count: supCount } = await (admin as any)
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    suppliersCount += supCount || 0;
  }
  {
    const { count: offCount } = await (admin as any)
      .from("supplier_offers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    suppliersCount += offCount || 0;
  }

  const dimensions: Record<string, DimensionStat> = {
    prices: { count: pricesCount, threshold: 50 },
    plans: { count: plansCount, threshold: 10 },
    planning: { count: planningCount, threshold: 5 },
    emails: { count: emailsCount, threshold: 100 },
    suppliers: { count: suppliersCount, threshold: 20 },
  };

  // ── Learning journal (last 5 events) ──

  const journal: JournalEntry[] = [];

  // Quantity corrections
  try {
    const { data: qtyCors } = await (admin as any)
      .from("quantity_corrections")
      .select("id, discipline, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3);
    if (qtyCors) {
      for (const c of qtyCors) {
        journal.push({
          type: "quantity_correction",
          description: c.discipline
            ? `Correction quantite ${c.discipline}`
            : "Correction de quantite",
          date: c.created_at,
        });
      }
    }
  } catch {}

  // Price calibrations
  try {
    const { data: priceCals } = await (admin as any)
      .from("price_calibrations")
      .select("id, cfc_code, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3);
    if (priceCals) {
      for (const c of priceCals) {
        journal.push({
          type: "price_calibration",
          description: c.cfc_code
            ? `Prix calibre CFC ${c.cfc_code}`
            : "Calibration de prix",
          date: c.created_at,
        });
      }
    }
  } catch {}

  // Email classification feedback (migration 025: corrected_classification)
  try {
    const { data: emailFb } = await (admin as any)
      .from("email_classification_feedback")
      .select("id, corrected_classification, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3);
    if (emailFb) {
      for (const c of emailFb) {
        journal.push({
          type: "email_feedback",
          description: c.corrected_classification
            ? `Email reclasse en ${c.corrected_classification}`
            : "Feedback classification email",
          date: c.created_at,
        });
      }
    }
  } catch {}

  // Sort by date desc and take 5
  journal.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const recentJournal = journal.slice(0, 5);

  // ── Learning events (migration 097) : accept-rate + échecs d'écriture ──
  //
  // AUDIT 08/2026 — `learning_events` était write-only (9 écrivains, 0 lecteur).
  // On expose ici, sur 30 jours et par org : l'accept-rate des suggestions
  // (accepté / (accepté + rejeté)) et le nombre d'écritures d'apprentissage
  // ayant échoué en silence (write_failed), ventilé par module.
  const learning = {
    window_days: 30,
    accept_rate: null as number | null,
    suggestions_shown: 0,
    suggestions_accepted: 0,
    suggestions_rejected: 0,
    write_failed_by_module: {} as Record<string, number>,
  };
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await (admin as any)
      .from("learning_events")
      .select("module, event_type")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .limit(10000);

    if (events) {
      let shown = 0;
      let accepted = 0;
      let rejected = 0;
      const writeFailed: Record<string, number> = {};
      for (const e of events as { module: string; event_type: string }[]) {
        if (e.event_type === "suggestion_shown") shown++;
        else if (e.event_type === "suggestion_accepted") accepted++;
        else if (e.event_type === "suggestion_rejected") rejected++;
        else if (e.event_type === "write_failed") {
          writeFailed[e.module] = (writeFailed[e.module] ?? 0) + 1;
        }
      }
      learning.suggestions_shown = shown;
      learning.suggestions_accepted = accepted;
      learning.suggestions_rejected = rejected;
      const decided = accepted + rejected;
      learning.accept_rate = decided > 0 ? Math.round((accepted / decided) * 100) : null;
      learning.write_failed_by_module = writeFailed;
    }
  } catch {
    // Table learning_events peut ne pas exister (migration 097 non appliquée).
  }

  // ── C2 collective data ──

  let c2 = { opted_in: false, market_prices: 0, suppliers_scored: 0 };
  try {
    // Migration 024: one row per (organization_id, module) with an opted_in boolean
    const { data: consentRows } = await (admin as any)
      .from("aggregation_consent")
      .select("module, opted_in")
      .eq("organization_id", orgId)
      .in("module", ["prix", "fournisseurs"]);

    const hasOptIn = (consentRows || []).some(
      (r: { module: string; opted_in: boolean }) => r.opted_in === true
    );
    c2.opted_in = hasOptIn;

    if (hasOptIn) {
      try {
        const { count: marketCount } = await (admin as any)
          .from("market_benchmarks")
          .select("id", { count: "exact", head: true });
        c2.market_prices = marketCount || 0;
      } catch {}
      try {
        const { count: supScoreCount } = await (admin as any)
          .from("supplier_market_scores")
          .select("id", { count: "exact", head: true });
        c2.suppliers_scored = supScoreCount || 0;
      } catch {}
    }
  } catch {}

  // ── Org counters ──

  let orgCounters = {
    total_prices: pricesCount,
    plans_analyzed: plansCount,
    projects_active: 0,
    emails_classified: 0,
  };

  try {
    const { count } = await (admin as any)
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", ["active", "planning"]);
    orgCounters.projects_active = count || 0;
  } catch {}

  try {
    // Scope the count to the organization's members (email_records is user-scoped;
    // organization_id is not reliably backfilled on legacy rows)
    const { data: orgMembers } = await (admin as any)
      .from("users")
      .select("id")
      .eq("organization_id", orgId);
    const memberIds = (orgMembers || []).map((m: { id: string }) => m.id);

    if (memberIds.length > 0) {
      const { count } = await (admin as any)
        .from("email_records")
        .select("id", { count: "exact", head: true })
        .in("user_id", memberIds)
        .not("classification", "is", null);
      orgCounters.emails_classified = count || 0;
    }
  } catch {}

  return NextResponse.json({
    dimensions,
    journal: recentJournal,
    c2,
    orgCounters,
    learning,
  });
}
