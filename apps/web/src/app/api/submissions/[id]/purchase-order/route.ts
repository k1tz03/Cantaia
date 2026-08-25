import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPurchaseOrderPdf } from "@/lib/submissions/purchase-order";

export const maxDuration = 60;

/**
 * GET /api/submissions/[id]/purchase-order?request_id=<uuid>
 *   → the branded purchase order (bon de commande / Bestellung) as a PDF.
 *
 * The builder lives in `@/lib/submissions/purchase-order`: a route.ts may only
 * export HTTP handlers (next build rejects anything else), and the award
 * handler of PATCH /api/submissions/[id] attaches the very same file to the
 * confirmation email.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const requestId = request.nextUrl.searchParams.get("request_id");
    if (!requestId) {
      return NextResponse.json({ error: "request_id required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const order = await buildPurchaseOrderPdf(
      admin,
      submissionId,
      requestId,
      profile.organization_id
    );

    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(order.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${order.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[purchase-order] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
