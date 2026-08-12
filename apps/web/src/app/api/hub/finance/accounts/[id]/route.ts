import { NextRequest, NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";

const ACCOUNT_TYPES = [
  "courant",
  "epargne",
  "troisieme_pilier",
  "investissement",
  "crypto",
  "immobilier",
  "autre",
];

async function getOwnedAccount(admin: any, id: string, userId: string) {
  const { data } = await admin
    .from("personal_finance_accounts")
    .select("*")
    .eq("id", id)
    .single();
  if (!data || data.user_id !== userId) return null;
  return data;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const account = await getOwnedAccount(admin as any, id, userId);
    if (!account) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim().slice(0, 120);
    if (typeof body.account_type === "string" && ACCOUNT_TYPES.includes(body.account_type)) {
      updates.account_type = body.account_type;
    }
    if ("institution" in body) {
      updates.institution =
        typeof body.institution === "string" ? body.institution.trim().slice(0, 120) || null : null;
    }
    if ("notes" in body) {
      updates.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) || null : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: updated, error } = await (admin as any)
      .from("personal_finance_accounts")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("[Hub Finance] Account update error:", error);
      return NextResponse.json({ error: "Échec de la mise à jour" }, { status: 500 });
    }

    return NextResponse.json({ success: true, account: updated });
  } catch (error) {
    console.error("[Hub Finance] Account update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const account = await getOwnedAccount(admin as any, id, userId);
    if (!account) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    // Suppression définitive (les snapshots suivent via ON DELETE CASCADE)
    const { error } = await (admin as any)
      .from("personal_finance_accounts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Hub Finance] Account delete error:", error);
      return NextResponse.json({ error: "Échec de la suppression" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hub Finance] Account delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
