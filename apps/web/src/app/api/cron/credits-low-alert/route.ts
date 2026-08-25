// ============================================================
// POST /api/cron/credits-low-alert — daily "you are about to run out" email
// ============================================================
// Organizations whose TOTAL balance is under LOW_CREDIT_THRESHOLD get one
// email per admin/director, sent through @cantaia/core/notifications with the
// `credits_low` event (so a recipient who turned that notification off is
// skipped automatically).
//
// Design notes:
//   - Runs on the SERVICE ROLE: credit_balances is readable by members only,
//     and this job has no user session.
//   - Idempotent-ish by construction: it is scheduled once a day. If the cron
//     fires twice the same day the org simply receives the mail twice — no
//     state is mutated, nothing is charged.
//   - Organizations with a ZERO balance are included: they are the ones who
//     are already hitting the paywall.
//   - The notifications module is imported DYNAMICALLY inside a try/catch:
//     it ships separately, and a missing module must degrade this job to a
//     no-op rather than 500 the whole cron.
//
// Schedule (to add to apps/web/vercel.json):
//   { "path": "/api/cron/credits-low-alert", "schedule": "0 8 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { LOW_CREDIT_THRESHOLD } from "@cantaia/config/credit-costs";

export const maxDuration = 120;

/** Roles that can actually act on the warning (buy credits / change plan). */
const BILLING_ROLES = ["admin", "director", "project_manager"];

type Locale = "fr" | "en" | "de";

function localeOf(input?: string | null): Locale {
  const l = (input || "").toLowerCase().slice(0, 2);
  return l === "en" || l === "de" ? l : "fr";
}

// Email copy lives here (not in messages/*.json): each mail is rendered for ONE
// recipient in THEIR language, which is not the next-intl request locale.
const SUBJECT: Record<Locale, string> = {
  fr: "Vos crédits Cantaia sont presque épuisés",
  en: "Your Cantaia credits are almost gone",
  de: "Ihre Cantaia-Credits sind fast aufgebraucht",
};

const TITLE: Record<Locale, string> = {
  fr: "Solde de crédits bas",
  en: "Low credit balance",
  de: "Niedriges Guthaben",
};

const CTA: Record<Locale, string> = {
  fr: "Recharger mes crédits",
  en: "Top up my credits",
  de: "Guthaben aufladen",
};

function body(locale: Locale, orgName: string, remaining: number): string {
  if (locale === "en") {
    return (
      `${orgName} has ${remaining} credit${remaining === 1 ? "" : "s"} left.\n\n` +
      "Once the balance reaches zero, AI actions (email replies, tender analysis, " +
      "site minutes, plan estimation) stop until you top up. Buying a credit pack " +
      "takes a minute and the credits are valid for 12 months."
    );
  }
  if (locale === "de") {
    return (
      `${orgName} hat noch ${remaining} Credit${remaining === 1 ? "" : "s"}.\n\n` +
      "Sobald das Guthaben aufgebraucht ist, werden KI-Aktionen (E-Mail-Antworten, " +
      "Submissionsanalyse, Bauprotokolle, Planschätzung) blockiert. Ein Credit-Paket " +
      "ist in einer Minute gekauft und 12 Monate gültig."
    );
  }
  return (
    `${orgName} n'a plus que ${remaining} crédit${remaining === 1 ? "" : "s"}.\n\n` +
    "Une fois le solde à zéro, les actions IA (réponses email, analyse de soumission, " +
    "PV de chantier, estimation de plan) sont bloquées jusqu'au rechargement. " +
    "Un pack de crédits s'achète en une minute et reste valable 12 mois."
  );
}

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // The notifications module is optional at build time — degrade to a no-op.
  let notifyUser: ((client: any, opts: any) => Promise<boolean>) | null = null;
  try {
    const mod = await import("@cantaia/core/notifications");
    notifyUser = (mod as any).notifyUser ?? null;
  } catch (err) {
    console.warn(
      "[cron/credits-low-alert] @cantaia/core/notifications unavailable — skipping:",
      err instanceof Error ? err.message : err
    );
  }

  if (!notifyUser) {
    return NextResponse.json({
      ok: true,
      skipped: "notifications_unavailable",
      organizations: 0,
      emails_sent: 0,
    });
  }

  // ── Organizations below the threshold ────────────────────
  let lowOrgs: Array<{ organization_id: string; total: number }> = [];
  try {
    const { data, error } = await (admin as any)
      .from("credit_balances")
      .select("organization_id, subscription_credits, purchased_credits");

    if (error) {
      // Migration 090 not applied — nothing to alert on.
      console.warn("[cron/credits-low-alert] credit_balances unreadable:", error.message);
      return NextResponse.json({
        ok: true,
        skipped: "credit_balances_unavailable",
        organizations: 0,
        emails_sent: 0,
      });
    }

    lowOrgs = (data || [])
      .map((row: any) => ({
        organization_id: row.organization_id as string,
        total:
          (Number(row.subscription_credits) || 0) + (Number(row.purchased_credits) || 0),
      }))
      .filter((row: { total: number }) => row.total < LOW_CREDIT_THRESHOLD);
  } catch (err) {
    console.error("[cron/credits-low-alert] balance query threw:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  if (lowOrgs.length === 0) {
    return NextResponse.json({ ok: true, organizations: 0, emails_sent: 0 });
  }

  const orgIds = lowOrgs.map((o) => o.organization_id);
  const remainingByOrg = new Map(lowOrgs.map((o) => [o.organization_id, o.total]));

  // ── Org names ────────────────────────────────────────────
  const nameByOrg = new Map<string, string>();
  try {
    const { data: orgs } = await (admin as any)
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    for (const org of orgs || []) {
      nameByOrg.set(org.id, org.name || "Votre organisation");
    }
  } catch {
    /* names are cosmetic — fall back below */
  }

  // ── Recipients: the people who can actually buy credits ──
  let recipients: Array<{ id: string; organization_id: string; preferred_language: string | null }> =
    [];
  try {
    const { data: users, error } = await (admin as any)
      .from("users")
      .select("id, organization_id, role, preferred_language")
      .in("organization_id", orgIds);

    if (error) throw error;

    recipients = (users || []).filter((u: any) =>
      BILLING_ROLES.includes(String(u.role || ""))
    );

    // An org with no admin/director must still be warned — fall back to every
    // member rather than silently alerting nobody.
    const covered = new Set(recipients.map((r) => r.organization_id));
    for (const user of users || []) {
      if (!covered.has(user.organization_id)) {
        recipients.push(user);
        covered.add(user.organization_id);
      }
    }
  } catch (err) {
    console.error("[cron/credits-low-alert] recipients query failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // ── Send ─────────────────────────────────────────────────
  let sent = 0;
  for (const recipient of recipients) {
    const remaining = remainingByOrg.get(recipient.organization_id) ?? 0;
    const orgName = nameByOrg.get(recipient.organization_id) || "Votre organisation";
    const locale = localeOf(recipient.preferred_language);

    try {
      const ok = await notifyUser(admin, {
        userId: recipient.id,
        event: "credits_low",
        subject: SUBJECT[locale],
        title: TITLE[locale],
        body: body(locale, orgName, remaining),
        ctaLabel: CTA[locale],
        ctaPath: "/settings?tab=subscription&section=packs",
        locale,
      });
      if (ok) sent += 1;
    } catch (err) {
      // One bad recipient must never abort the batch.
      console.error(
        `[cron/credits-low-alert] notify failed for ${recipient.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[cron/credits-low-alert] ${lowOrgs.length} org(s) under ${LOW_CREDIT_THRESHOLD} credits, ${sent} email(s) sent.`
  );

  return NextResponse.json({
    ok: true,
    threshold: LOW_CREDIT_THRESHOLD,
    organizations: lowOrgs.length,
    recipients: recipients.length,
    emails_sent: sent,
  });
}
