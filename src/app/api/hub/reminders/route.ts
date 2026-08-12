import { NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";

// GET /api/hub/reminders — échéances des documents du coffre-fort
// Retourne les documents expirés ou dont l'échéance tombe dans la fenêtre
// de rappel (expiry_date - reminder_days), triés du plus urgent au moins urgent.

export async function GET() {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const { data: documents, error } = await (admin as any)
      .from("personal_documents")
      .select("id, title, category, expiry_date, reminder_days, file_name")
      .eq("user_id", userId)
      .not("expiry_date", "is", null)
      .order("expiry_date", { ascending: true });

    if (error) {
      // Colonne expiry_date absente (migration 078 pas appliquée)
      return NextResponse.json({ success: true, reminders: [] });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const reminders = (documents || [])
      .map((d: any) => {
        const expiry = new Date(d.expiry_date + "T00:00:00");
        const daysLeft = Math.round((expiry.getTime() - now.getTime()) / 86400000);
        const windowDays = Number(d.reminder_days) || 30;
        let status: "expired" | "expiring" | "upcoming";
        if (daysLeft < 0) status = "expired";
        else if (daysLeft <= windowDays) status = "expiring";
        else status = "upcoming";
        return { ...d, days_left: daysLeft, status };
      })
      .filter((r: any) => r.status !== "upcoming");

    return NextResponse.json({ success: true, reminders });
  } catch (error) {
    console.error("[Hub] Reminders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
