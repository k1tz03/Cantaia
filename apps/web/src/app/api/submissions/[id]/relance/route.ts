import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

/**
 * POST /api/submissions/[id]/relance
 * Send a follow-up reminder for a price request.
 * Body: { request_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const body = await request.json();
    const { request_id } = body;

    if (!request_id) {
      return NextResponse.json({ error: "request_id required" }, { status: 400 });
    }

    // Get the price request with supplier info
    const { data: priceRequest } = await (admin as any)
      .from("submission_price_requests")
      .select("*, suppliers(id, company_name, contact_name, email)")
      .eq("id", request_id)
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (!priceRequest) {
      return NextResponse.json({ error: "Price request not found" }, { status: 404 });
    }

    if (priceRequest.status === "responded") {
      return NextResponse.json({ error: "Already responded" }, { status: 400 });
    }

    const supplierEmail = priceRequest.suppliers?.email;
    if (!supplierEmail) {
      return NextResponse.json({ error: "Supplier has no email" }, { status: 400 });
    }

    // Get submission for project name
    const { data: submission } = await admin
      .from("submissions")
      .select("*, projects(id, name)")
      .eq("id", submissionId)
      .maybeSingle();

    const projectName = (submission as any)?.projects?.name || "Projet";

    // Get user info
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("first_name, last_name, email, organization_id, job_title")
      .eq("id", user.id)
      .maybeSingle();

    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", userProfile?.organization_id)
      .maybeSingle();

    // Generate relance email
    const relanceNum = (priceRequest.relance_count || 0) + 1;
    const greeting = priceRequest.suppliers?.contact_name
      ? `Madame, Monsieur ${priceRequest.suppliers.contact_name}`
      : "Madame, Monsieur";
    const senderName = `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim();

    const deadlineStr = priceRequest.deadline
      ? new Date(priceRequest.deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })
      : null;

    const subject = `Relance${relanceNum > 1 ? ` n°${relanceNum}` : ""} — Demande de prix — ${projectName} — ${priceRequest.material_group}`;

    const html = `
<p>${greeting},</p>

<p>Nous nous permettons de revenir vers vous concernant notre demande de prix pour le projet <strong>${projectName}</strong>, groupe <strong>${priceRequest.material_group}</strong>.</p>

${deadlineStr ? `<p>Pour rappel, le délai de réponse souhaité était fixé au <strong>${deadlineStr}</strong>.</p>` : ""}

<p style="background:#fef3c7;padding:12px;border-radius:6px;border-left:4px solid #f59e0b;margin:16px 0;">
  <strong>Référence :</strong> ${priceRequest.tracking_code}<br/>
  Merci de mentionner ce code dans votre réponse.
</p>

<p>Nous vous serions reconnaissants de bien vouloir nous faire parvenir votre offre dans les meilleurs délais.</p>

<p>Cordialement,<br/>
<strong>${senderName}</strong>${userProfile?.job_title ? `<br/>${userProfile.job_title}` : ""}<br/>
${org?.name || ""}</p>
`.trim();

    // Send via Graph API
    const tokenResult = await getValidMicrosoftToken(user.id);

    if ("error" in tokenResult) {
      // Update relance count even if email fails
      await (admin as any)
        .from("submission_price_requests")
        .update({
          relance_count: relanceNum,
          last_relance_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return NextResponse.json({
        success: true,
        sent: false,
        message: "Microsoft not connected — relance counted but not emailed",
      });
    }

    try {
      const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: supplierEmail } }],
            from: { emailAddress: { address: userProfile?.email } },
          },
          saveToSentItems: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Graph API error ${response.status}: ${errorText}`);
      }
    } catch (emailError: any) {
      console.error("[relance] Email error:", emailError);
      // Still update the count
      await (admin as any)
        .from("submission_price_requests")
        .update({
          relance_count: relanceNum,
          last_relance_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return NextResponse.json({
        success: true,
        sent: false,
        error: emailError.message,
      });
    }

    // Update relance count
    await (admin as any)
      .from("submission_price_requests")
      .update({
        relance_count: relanceNum,
        last_relance_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    return NextResponse.json({ success: true, sent: true, relance_count: relanceNum });
  } catch (err: any) {
    console.error("[relance] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
