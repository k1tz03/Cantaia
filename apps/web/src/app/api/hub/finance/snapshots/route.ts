import { NextRequest, NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";

// Relevés de solde par compte (saisie manuelle : date + montant).
// POST upsert par (account_id, snapshot_date) — ressaisir un mois écrase la valeur.

export async function GET(request: NextRequest) {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const accountId = request.nextUrl.searchParams.get("account_id");

    let query = (admin as any)
      .from("personal_finance_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("snapshot_date", { ascending: false })
      .limit(500);
    if (accountId) query = query.eq("account_id", accountId);

    const { data: snapshots, error } = await query;
    if (error) {
      return NextResponse.json({ success: true, snapshots: [] });
    }

    return NextResponse.json({ success: true, snapshots: snapshots || [] });
  } catch (error) {
    console.error("[Hub Finance] Snapshots list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const body = await request.json();
    const accountId = body.account_id as string;
    const balance = Number(body.balance);
    const dateRaw = typeof body.snapshot_date === "string" ? body.snapshot_date : "";
    const snapshotDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
      ? dateRaw
      : new Date().toISOString().slice(0, 10);

    if (!accountId || !Number.isFinite(balance)) {
      return NextResponse.json(
        { error: "account_id et balance sont requis" },
        { status: 400 }
      );
    }

    // IDOR : le compte doit appartenir à l'utilisateur
    const { data: account } = await (admin as any)
      .from("personal_finance_accounts")
      .select("id, user_id")
      .eq("id", accountId)
      .single();
    if (!account || account.user_id !== userId) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    const { data: snapshot, error } = await (admin as any)
      .from("personal_finance_snapshots")
      .upsert(
        {
          user_id: userId,
          account_id: accountId,
          snapshot_date: snapshotDate,
          balance,
          note: typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null,
        },
        { onConflict: "account_id,snapshot_date" }
      )
      .select()
      .single();

    if (error || !snapshot) {
      console.error("[Hub Finance] Snapshot upsert error:", error);
      return NextResponse.json({ error: "Échec de l'enregistrement" }, { status: 500 });
    }

    return NextResponse.json({ success: true, snapshot }, { status: 201 });
  } catch (error) {
    console.error("[Hub Finance] Snapshot error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id est requis" }, { status: 400 });
    }

    const { error } = await (admin as any)
      .from("personal_finance_snapshots")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Hub Finance] Snapshot delete error:", error);
      return NextResponse.json({ error: "Échec de la suppression" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hub Finance] Snapshot delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
