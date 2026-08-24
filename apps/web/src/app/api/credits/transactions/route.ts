// ============================================================
// GET /api/credits/transactions — paginated credit ledger
// ============================================================
// Query: ?page=1&limit=50 (parsePagination: default 50, max 200)
//        &kind=purchase|consumption|... (optional filter)
//
// Org-scoped: every member of the organization can read its own ledger
// (same rule as the RLS SELECT policy from migration 090).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePagination, paginatedJson } from "@/lib/api/pagination";
import { isCreditTransactionKind } from "@cantaia/config/credit-costs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const pagination = parsePagination(request);
    const kind = new URL(request.url).searchParams.get("kind");

    let query = (admin as any)
      .from("credit_transactions")
      .select(
        "id, organization_id, amount, balance_after, kind, action_type, reference, created_by, created_at",
        { count: "exact" }
      )
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);

    if (kind && isCreditTransactionKind(kind)) {
      query = query.eq("kind", kind);
    }

    const { data, count, error } = await query;

    if (error) {
      // Migration 090 not applied → empty ledger instead of a 500.
      console.warn("[api/credits/transactions] query failed:", error.message);
      return NextResponse.json(paginatedJson([], 0, pagination));
    }

    return NextResponse.json(paginatedJson(data ?? [], count ?? 0, pagination));
  } catch (error) {
    console.error("[api/credits/transactions]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
