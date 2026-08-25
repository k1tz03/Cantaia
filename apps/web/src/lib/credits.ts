// ============================================================
// Cantaia — Credits server helpers
// ============================================================
// Thin, dependency-free wrapper around the migration 090 primitives:
//   credit_balances / credit_transactions tables
//   consume_credits() / grant_credits() RPCs (SECURITY DEFINER, service role)
//
// Design rules:
//   1. ALWAYS uses the admin client — credit movements bypass RLS by design.
//   2. FAIL-OPEN when migration 090 is not applied yet: a missing RPC must
//      never take the whole product down. We log a warning and let the action
//      through (the org keeps running on the legacy quota path).
//   3. FAIL-CLOSED on a genuine "insufficient balance" answer — that is a
//      business decision, not an infrastructure error.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { creditCostFor, type CreditTransactionKind } from "@cantaia/config/credit-costs";

/** Postgres/PostgREST codes meaning "that function does not exist (yet)". */
const MISSING_FUNCTION_CODES = new Set(["42883", "PGRST202"]);
/** Postgres/PostgREST codes meaning "that table does not exist (yet)". */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingFunction(error: any): boolean {
  if (!error) return false;
  if (MISSING_FUNCTION_CODES.has(String(error.code))) return true;
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("could not find the function") ||
    (message.includes("function") && message.includes("does not exist"))
  );
}

function isMissingTable(error: any): boolean {
  if (!error) return false;
  if (MISSING_TABLE_CODES.has(String(error.code))) return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("relation") && message.includes("does not exist");
}

/**
 * A fail-open means Cantaia just served an AI action WITHOUT charging for it.
 * That is deliberate (never take the product down over the meter) but it is
 * revenue walking out of the door, so it must be LOUD: console.error — not
 * console.warn, which drowns in Next.js build noise — plus a Sentry event so
 * it shows up on the dashboard instead of only in a log tail.
 *
 * Sentry is imported dynamically and best-effort: this module is also reached
 * from contexts where Sentry may not be initialised (missing DSN, cookie
 * consent refused), and the reporting must never itself break the request.
 */
function reportDegraded(where: string, reason: string, error: any): void {
  const detail = error?.message || String(error ?? "unknown");
  console.error(
    `[credits] DEGRADED (${where}): ${reason} — action autorisée SANS débit (fail-open). Détail: ${detail}`
  );

  try {
    void import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureMessage(`[credits] fail-open in ${where}: ${reason}`, {
          level: "error",
          tags: { subsystem: "credits", credits_degraded: "true", where },
          extra: { detail },
        });
      })
      .catch(() => {
        /* Sentry unavailable — the console.error above is the fallback. */
      });
  } catch {
    /* never let telemetry break a credit operation */
  }
}

function warnMigrationMissing(where: string, error: any): void {
  reportDegraded(
    where,
    "migration 090 non appliquée (credit_balances / consume_credits / grant_credits absents)",
    error
  );
}

/** Rows returned by the SQL RPCs (PostgREST returns TABLE functions as arrays). */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  if (data && typeof data === "object") return data as T;
  return null;
}

// ------------------------------------------------------------
// Balance
// ------------------------------------------------------------

export interface CreditBalanceSnapshot {
  subscription_credits: number;
  purchased_credits: number;
  total: number;
  /**
   * `false` when the organization has NO `credit_balances` row: either the
   * migration is not applied, or the org predates the credit model. Callers
   * use this to fall back to the legacy quota behaviour instead of showing
   * a hard "0 credits" wall.
   */
  exists: boolean;
  /**
   * `true` when the balance could NOT be consulted (table missing, DB error)
   * — as opposed to "consulted, and this org simply has no row yet".
   *
   * While degraded, every metered action runs WITHOUT being debited. The API
   * surfaces this so the UI can say so instead of silently showing nothing.
   */
  degraded: boolean;
}

/** No row for this org — the credit system answered, it just has nothing. */
const EMPTY_BALANCE: CreditBalanceSnapshot = {
  subscription_credits: 0,
  purchased_credits: 0,
  total: 0,
  exists: false,
  degraded: false,
};

/** The credit system could not be reached at all. */
const DEGRADED_BALANCE: CreditBalanceSnapshot = { ...EMPTY_BALANCE, degraded: true };

/**
 * Read an organization's balance. Never throws: an unreachable/absent table
 * resolves to `{ exists: false }`.
 */
export async function getCreditBalance(organizationId: string): Promise<CreditBalanceSnapshot> {
  if (!organizationId) return EMPTY_BALANCE;

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("credit_balances")
      .select("subscription_credits, purchased_credits")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) warnMigrationMissing("getCreditBalance", error);
      else reportDegraded("getCreditBalance", "balance read failed", error);
      return DEGRADED_BALANCE;
    }

    // Answered, no row: the org is simply not on the credit model yet.
    if (!data) return EMPTY_BALANCE;

    const subscription = Number(data.subscription_credits) || 0;
    const purchased = Number(data.purchased_credits) || 0;
    return {
      subscription_credits: subscription,
      purchased_credits: purchased,
      total: subscription + purchased,
      exists: true,
      degraded: false,
    };
  } catch (err) {
    reportDegraded("getCreditBalance", "threw while reading the balance", err);
    return DEGRADED_BALANCE;
  }
}

// ------------------------------------------------------------
// Consumption
// ------------------------------------------------------------

export interface ConsumeCreditsResult {
  /** `false` only when the org genuinely lacks the credits. */
  allowed: boolean;
  /** Credits the action costs (0 = free / bundled action). */
  required: number;
  /** Total balance AFTER the debit (or the current balance when refused). */
  remaining: number;
  subscription_credits: number;
  purchased_credits: number;
  /**
   * `true` when the credit system could not be consulted (migration missing,
   * DB error). The action was allowed WITHOUT being debited — fail-open.
   */
  degraded: boolean;
}

/**
 * Debit the credits an action costs. The cost comes from CREDIT_COSTS
 * (`creditCostFor`), so callers only pass the `action_type`.
 *
 * A cost of 0 (bundled action such as email classification) short-circuits:
 * no RPC round-trip, no ledger row.
 */
export async function consumeCredits(
  organizationId: string,
  actionType: string,
  reference?: string
): Promise<ConsumeCreditsResult> {
  const required = creditCostFor(actionType);

  if (!organizationId) {
    reportDegraded(
      "consumeCredits",
      `called without an organizationId for ${actionType} — the action is free`,
      null
    );
    return {
      allowed: true,
      required,
      remaining: 0,
      subscription_credits: 0,
      purchased_credits: 0,
      degraded: true,
    };
  }

  if (required === 0) {
    const balance = await getCreditBalance(organizationId);
    return {
      allowed: true,
      required: 0,
      remaining: balance.total,
      subscription_credits: balance.subscription_credits,
      purchased_credits: balance.purchased_credits,
      degraded: false,
    };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc("consume_credits", {
      p_org: organizationId,
      p_amount: required,
      p_action: actionType || null,
      p_reference: reference ?? null,
    });

    if (error) {
      if (isMissingFunction(error) || isMissingTable(error)) {
        warnMigrationMissing("consumeCredits", error);
      } else {
        reportDegraded("consumeCredits", `consume_credits RPC failed (${actionType})`, error);
      }
      // Fail-open: never block a paying customer on an infrastructure error.
      return {
        allowed: true,
        required,
        remaining: 0,
        subscription_credits: 0,
        purchased_credits: 0,
        degraded: true,
      };
    }

    const row = firstRow<{
      success: boolean;
      remaining_subscription: number;
      remaining_purchased: number;
    }>(data);

    if (!row) {
      reportDegraded(
        "consumeCredits",
        `consume_credits returned no row (${actionType})`,
        null
      );
      return {
        allowed: true,
        required,
        remaining: 0,
        subscription_credits: 0,
        purchased_credits: 0,
        degraded: true,
      };
    }

    const subscription = Number(row.remaining_subscription) || 0;
    const purchased = Number(row.remaining_purchased) || 0;

    return {
      allowed: row.success === true,
      required,
      remaining: subscription + purchased,
      subscription_credits: subscription,
      purchased_credits: purchased,
      degraded: false,
    };
  } catch (err) {
    reportDegraded("consumeCredits", `threw while debiting ${actionType}`, err);
    return {
      allowed: true,
      required,
      remaining: 0,
      subscription_credits: 0,
      purchased_credits: 0,
      degraded: true,
    };
  }
}

// ------------------------------------------------------------
// Grants
// ------------------------------------------------------------

export interface GrantCreditsResult {
  granted: boolean;
  subscription_credits: number;
  purchased_credits: number;
  total: number;
  /** `true` when the grant could not be applied (migration missing / DB error). */
  degraded: boolean;
}

/**
 * Credit an organization. Used by the signup bonus, the Stripe webhook
 * (pack purchase + monthly subscription allocation) and super-admin manual
 * adjustments.
 *
 * Best-effort by contract: callers treat a failure as non-fatal.
 */
export async function grantCredits(
  organizationId: string,
  amount: number,
  kind: CreditTransactionKind,
  reference?: string,
  createdBy?: string
): Promise<GrantCreditsResult> {
  const failed: GrantCreditsResult = {
    granted: false,
    subscription_credits: 0,
    purchased_credits: 0,
    total: 0,
    degraded: true,
  };

  if (!organizationId || !Number.isFinite(amount)) return failed;

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc("grant_credits", {
      p_org: organizationId,
      p_amount: Math.trunc(amount),
      p_kind: kind,
      p_reference: reference ?? null,
      p_created_by: createdBy ?? null,
    });

    if (error) {
      if (isMissingFunction(error) || isMissingTable(error)) {
        warnMigrationMissing("grantCredits", error);
      } else {
        // A lost grant is the mirror image of a lost debit: the customer PAID
        // and did not get the credits. Just as loud.
        reportDegraded("grantCredits", `grant_credits RPC failed (kind=${kind}, amount=${amount})`, error);
      }
      return failed;
    }

    // The RPC returns `new_subscription_credits` / `new_purchased_credits`
    // (prefixed to avoid a PL/pgSQL column-name conflict). The unprefixed names
    // are accepted too so a future rename cannot silently zero the UI.
    const row = firstRow<{
      new_subscription_credits?: number;
      new_purchased_credits?: number;
      subscription_credits?: number;
      purchased_credits?: number;
    }>(data);
    if (!row) return failed;

    const subscription = Number(row.new_subscription_credits ?? row.subscription_credits) || 0;
    const purchased = Number(row.new_purchased_credits ?? row.purchased_credits) || 0;

    return {
      granted: true,
      subscription_credits: subscription,
      purchased_credits: purchased,
      total: subscription + purchased,
      degraded: false,
    };
  } catch (err) {
    reportDegraded("grantCredits", `threw while granting (kind=${kind}, amount=${amount})`, err);
    return failed;
  }
}

// ------------------------------------------------------------
// HTTP contract
// ------------------------------------------------------------

/**
 * Standard 402 payload every metered route returns when the balance is too
 * low. The client PaywallDialog keys on `error === "insufficient_credits"` and
 * renders its OWN localized copy — so the payload stays NEUTRAL (no FR-frozen
 * `message`, which would leak French into DE/EN sessions).
 *
 * `remaining` is kept for the current client; `current` is the neutral alias
 * named by the audit contract. `action_type` / `required_plan` are optional
 * hints the dialog can use (cost lookup, upsell target).
 */
export function insufficientCreditsResponse(
  required: number,
  remaining: number,
  opts?: { actionType?: string | null; requiredPlan?: string | null }
): NextResponse {
  return NextResponse.json(
    {
      error: "insufficient_credits",
      required,
      remaining,
      current: remaining,
      action_type: opts?.actionType ?? null,
      required_plan: opts?.requiredPlan ?? null,
    },
    { status: 402 }
  );
}
