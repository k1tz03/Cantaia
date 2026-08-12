import { NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";

// GET /api/hub/finance/overview — synthèse financière personnelle :
// solde actuel par compte, total, série mensuelle (carry-forward par compte),
// allocation par type de compte, variations 1/3/12 mois.

interface Snapshot {
  account_id: string;
  snapshot_date: string;
  balance: number;
}

function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

export async function GET() {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const [{ data: accounts, error: accError }, { data: snapshotsRaw, error: snapError }] =
      await Promise.all([
        (admin as any)
          .from("personal_finance_accounts")
          .select("id, name, account_type, institution, currency")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        (admin as any)
          .from("personal_finance_snapshots")
          .select("account_id, snapshot_date, balance")
          .eq("user_id", userId)
          .order("snapshot_date", { ascending: true }),
      ]);

    if (accError || snapError) {
      return NextResponse.json({
        success: true,
        accounts: [],
        total: 0,
        series: [],
        allocation: [],
        variations: { m1: null, m3: null, m12: null },
      });
    }

    const snapshots: Snapshot[] = (snapshotsRaw || []).map((s: any) => ({
      account_id: s.account_id,
      snapshot_date: s.snapshot_date,
      balance: Number(s.balance) || 0,
    }));

    // Dernier solde connu par compte
    const latestByAccount: Record<string, Snapshot> = {};
    for (const s of snapshots) {
      const prev = latestByAccount[s.account_id];
      if (!prev || s.snapshot_date > prev.snapshot_date) latestByAccount[s.account_id] = s;
    }

    const enrichedAccounts = (accounts || []).map((a: any) => ({
      ...a,
      latest_balance: latestByAccount[a.id]?.balance ?? null,
      latest_date: latestByAccount[a.id]?.snapshot_date ?? null,
    }));

    const total = enrichedAccounts.reduce(
      (sum: number, a: any) => sum + (Number(a.latest_balance) || 0),
      0
    );

    // Série mensuelle : pour chaque mois observé, total = somme du dernier
    // solde connu de chaque compte à la fin de ce mois (carry-forward)
    const months = Array.from(new Set(snapshots.map((s) => monthKey(s.snapshot_date)))).sort();
    const series: { month: string; total: number }[] = [];
    for (const month of months) {
      let monthTotal = 0;
      for (const a of accounts || []) {
        const upTo = snapshots
          .filter((s) => s.account_id === a.id && monthKey(s.snapshot_date) <= month)
          .sort((x, y) => (x.snapshot_date < y.snapshot_date ? 1 : -1))[0];
        if (upTo) monthTotal += upTo.balance;
      }
      series.push({ month, total: Math.round(monthTotal * 100) / 100 });
    }

    // Allocation par type de compte (sur les derniers soldes)
    const typeTotals: Record<string, number> = {};
    for (const a of enrichedAccounts) {
      if (a.latest_balance === null) continue;
      typeTotals[a.account_type] = (typeTotals[a.account_type] || 0) + Number(a.latest_balance);
    }
    const allocation = Object.entries(typeTotals)
      .map(([type, amount]) => ({
        type,
        amount: Math.round(amount * 100) / 100,
        percent: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Variations vs il y a 1 / 3 / 12 mois (depuis la série mensuelle)
    function variation(monthsBack: number): number | null {
      if (series.length === 0) return null;
      const current = series[series.length - 1];
      const target = new Date(current.month + "-01");
      target.setMonth(target.getMonth() - monthsBack);
      const targetKey = target.toISOString().slice(0, 7);
      const past = [...series].reverse().find((p) => p.month <= targetKey);
      if (!past) return null;
      return Math.round((current.total - past.total) * 100) / 100;
    }

    return NextResponse.json({
      success: true,
      accounts: enrichedAccounts,
      total: Math.round(total * 100) / 100,
      series,
      allocation,
      variations: { m1: variation(1), m3: variation(3), m12: variation(12) },
    });
  } catch (error) {
    console.error("[Hub Finance] Overview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
