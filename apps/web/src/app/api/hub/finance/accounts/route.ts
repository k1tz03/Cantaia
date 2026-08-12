import { NextRequest, NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";

// Comptes financiers personnels (compte courant, épargne, 3e pilier, investissements...)

const ACCOUNT_TYPES = [
  "courant",
  "epargne",
  "troisieme_pilier",
  "investissement",
  "crypto",
  "immobilier",
  "autre",
];

export async function GET() {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const { data: accounts, error } = await (admin as any)
      .from("personal_finance_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      // Table absente (migration 078 pas appliquée)
      return NextResponse.json({ success: true, accounts: [] });
    }

    return NextResponse.json({ success: true, accounts: accounts || [] });
  } catch (error) {
    console.error("[Hub Finance] Accounts list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Le nom du compte est requis" }, { status: 400 });
    }
    const accountType = ACCOUNT_TYPES.includes(body.account_type) ? body.account_type : "courant";

    const { data: account, error } = await (admin as any)
      .from("personal_finance_accounts")
      .insert({
        user_id: userId,
        name: name.slice(0, 120),
        account_type: accountType,
        institution: typeof body.institution === "string" ? body.institution.trim().slice(0, 120) || null : null,
        currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toUpperCase().slice(0, 5) : "CHF",
        notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) || null : null,
      })
      .select()
      .single();

    if (error || !account) {
      console.error("[Hub Finance] Account create error:", error);
      return NextResponse.json(
        { error: "Échec de la création (migration 078 appliquée ?)" },
        { status: 500 }
      );
    }

    // Solde initial optionnel
    const initialBalance = Number(body.initial_balance);
    if (Number.isFinite(initialBalance)) {
      await (admin as any).from("personal_finance_snapshots").insert({
        user_id: userId,
        account_id: account.id,
        snapshot_date: new Date().toISOString().slice(0, 10),
        balance: initialBalance,
        note: "Solde initial",
      });
    }

    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (error) {
    console.error("[Hub Finance] Account create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
