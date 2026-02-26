import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePriceRequestEmail } from "@cantaia/core/submissions";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["submission_id", "supplier_ids", "lot_ids"]);
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  try {
    // In production: fetch submission, lots, suppliers from DB
    // Generate emails using the template service
    // Send via Microsoft Graph API
    // Create price_request records in DB
    // For now: mock response

    const emails = (body.supplier_ids as string[]).map((supplierId: string) => {
      const email = generatePriceRequestEmail({
        supplier_name: "Fournisseur",
        contact_name: "M. Dupont",
        project_name: body.project_name || "Projet",
        submission_title: body.submission_title || "Soumission",
        submission_reference: body.submission_reference || "REF-001",
        lots: (body.lot_ids as string[]).map((lotId: string) => ({
          name: `Lot ${lotId}`,
          cfc_code: "211",
          item_count: 5,
        })),
        deadline: body.deadline || new Date(Date.now() + 14 * 86400000).toISOString(),
        sender_name: user.user_metadata?.full_name || "Chef de projet",
        sender_company: user.user_metadata?.organization_name || "Cantaia",
        language: body.language || "fr",
      });

      return {
        supplier_id: supplierId,
        subject: email.subject,
        body: email.body,
        status: "sent" as const,
        sent_at: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      count: emails.length,
      emails,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send price requests" },
      { status: 500 }
    );
  }
}
