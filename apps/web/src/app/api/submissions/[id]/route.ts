import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — fetch submission detail with items, price requests, and quotes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: submission, error } = await admin
      .from("submissions")
      .select("*, projects(id, name, code, color, client_name, city, address)")
      .eq("id", id)
      .maybeSingle();

    if (error || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Fetch items (cast: migration 049 tables not in TS types)
    const { data: items } = await (admin as any)
      .from("submission_items")
      .select("*")
      .eq("submission_id", id)
      .order("item_number", { ascending: true });

    // Fetch price requests with supplier info (supplier_id can be null for manual suppliers)
    const { data: rawPriceRequests } = await (admin as any)
      .from("submission_price_requests")
      .select("*, suppliers(id, company_name, contact_name, email)")
      .eq("submission_id", id)
      .order("created_at", { ascending: false });

    // Normalize: for manual suppliers (supplier_id=null), populate suppliers from manual fields
    const priceRequests = (rawPriceRequests || []).map((pr: any) => {
      if (!pr.suppliers && (pr.supplier_name_manual || pr.supplier_email_manual)) {
        return {
          ...pr,
          suppliers: {
            id: pr.id,
            company_name: pr.supplier_name_manual || "Fournisseur manuel",
            contact_name: null,
            email: pr.supplier_email_manual || null,
          },
        };
      }
      return pr;
    });

    // Fetch quotes
    const { data: quotes } = await (admin as any)
      .from("submission_quotes")
      .select("*")
      .eq("submission_id", id)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      submission,
      items: items || [],
      priceRequests: priceRequests || [],
      quotes: quotes || [],
    });
  } catch (err: any) {
    console.error("[submissions/[id]] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — delete submission and all related data
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Delete file from storage — handle both schema versions
    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const storedFileUrl = submission?.file_url || submission?.source_file_url;
    if (storedFileUrl) {
      await admin.storage.from("submissions").remove([storedFileUrl]);
    }

    // Cascade delete handles items, requests, quotes
    const { error } = await (admin as any).from("submissions").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[submissions/[id]] DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
