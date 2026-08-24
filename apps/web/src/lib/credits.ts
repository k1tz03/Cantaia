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

function warnMigrationMissing(where: string, error: any): void {
  console.warn(
    `[credits] ${where}: migration 090 non appliquée (credit_balances / consume_credits / grant_credits absents) — ` +
      `le système de crédits est ignoré (fail-open). Détail: ${error?.message || error}`
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
}

const EMPTY_BALANCE: CreditBalanceSnapshot = {
  subscription_credits: 0,
  purchased_credits: 0,
  total: 0,
  exists: false,
};

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
      else console.error("[credits] getCreditBalance failed:", error.message);
      return EMPTY_BALANCE;
    }

    if (!data) return EMPTY_BALANCE;

    const subscription = Number(data.subscription_credits) || 0;
    const purchased = Number(data.purchased_credits) || 0;
    return {
      subscription_credits: subscription,
      purchased_credits: purchased,
      total: subscription + purchased,
      exists: true,
    };
  } catch (err) {
    console.error("[credits] getCreditBalance threw:", err);
    return EMPTY_BALANCE;
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
        console.error("[credits] consume_credits RPC failed:", error.message);
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
      console.error("[credits] consume_credits returned no row");
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
    console.error("[credits] consumeCredits threw:", err);
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
        console.error("[credits] grant_credits RPC failed:", error.message);
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
    console.error("[credits] grantCredits threw:", err);
    return failed;
  }
}

// ------------------------------------------------------------
// HTTP contract
// ------------------------------------------------------------

/**
 * Standard 402 payload every metered route returns when the balance is too
 * low. The client PaywallDialog keys on `error === "insufficient_credits"`.
 */
export function insufficientCreditsResponse(required: number, remaining: number): NextResponse {
  return NextResponse.json(
    {
      error: "insufficient_credits",
      required,
      remaining,
      message: `Crédits insuffisants : cette action coûte ${required} crédit${
        required > 1 ? "s" : ""
      }, il vous en reste ${remaining}.`,
    },
    { status: 402 }
  );
}
