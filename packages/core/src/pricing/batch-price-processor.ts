// ============================================================
// Cantaia — Batch Price Processor
// Processes emails in chunks to extract pricing data
// ============================================================

import {
  isPriceResponseEmail,
  extractPricesFromEmailBody,
  extractPricesFromPdf,
  type EmailPriceExtractionResult,
} from "./email-price-extractor";

// ---------- Interfaces ----------

export interface BatchProcessChunkInput {
  jobId: string;
  supabase: any; // admin client
  anthropicApiKey: string;
  userId: string;
  organizationId: string;
  chunkSize?: number;
  /** Function to get a valid Microsoft Graph access token */
  getGraphToken: () => Promise<string>;
}

export interface BatchProcessChunkResult {
  processed: number;
  pricesFound: number;
  newItems: number;
  done: boolean;
  errors: string[];
}

// ---------- Helpers ----------

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Main chunk processor ----------

export async function processNextChunk(
  input: BatchProcessChunkInput
): Promise<BatchProcessChunkResult> {
  const {
    jobId,
    supabase,
    anthropicApiKey,
    organizationId,
    chunkSize = 5,
    getGraphToken,
  } = input;

  const errors: string[] = [];
  let processed = 0;
  let pricesFound = 0;
  let newItems = 0;

  // 1. Load job
  const { data: job } = await supabase
    .from("price_extraction_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job || job.status === "cancelled" || job.status === "failed") {
    return { processed: 0, pricesFound: 0, newItems: 0, done: true, errors: ["Job not found or cancelled"] };
  }

  // 2. Get next chunk of unprocessed emails
  let query = supabase
    .from("email_records")
    .select("id, subject, sender_email, sender_name, body_preview, has_attachments, project_id, outlook_message_id")
    .eq("organization_id", organizationId)
    .eq("price_extracted", false)
    .not("outlook_message_id", "is", null)
    .order("received_at", { ascending: false })
    .limit(chunkSize);

  // Apply project filter if set
  if (job.project_id) {
    query = query.eq("project_id", job.project_id);
  }

  const { data: emails, error: queryError } = await query;

  if (queryError) {
    console.error("[batch-price-processor] Query error:", queryError);
    return { processed: 0, pricesFound: 0, newItems: 0, done: true, errors: [queryError.message] };
  }

  if (!emails || emails.length === 0) {
    // No more emails to process — mark as preview_ready
    await supabase
      .from("price_extraction_jobs")
      .update({ status: "preview_ready", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId);
    return { processed: 0, pricesFound: 0, newItems: 0, done: true, errors: [] };
  }

  const existingResults: EmailPriceExtractionResult[] = job.extraction_results || [];
  let graphToken: string | null = null;

  // 3. Process each email
  for (const email of emails) {
    try {
      processed++;

      // Pre-filter
      if (!isPriceResponseEmail(email.subject || "", email.body_preview || "", email.sender_email || "")) {
        // Mark as processed (no prices)
        await supabase
          .from("email_records")
          .update({ price_extracted: true, price_extraction_job_id: jobId })
          .eq("id", email.id);
        continue;
      }

      // Fetch Graph token lazily
      if (!graphToken) {
        graphToken = await getGraphToken();
      }

      // Get project name for context
      let projectName: string | null = null;
      if (email.project_id) {
        const { data: project } = await supabase
          .from("projects")
          .select("name")
          .eq("id", email.project_id)
          .maybeSingle();
        projectName = project?.name || null;
      }

      // Fetch full body from Graph API
      const bodyRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${email.outlook_message_id}?$select=body`,
        { headers: { Authorization: `Bearer ${graphToken}` } }
      );

      if (!bodyRes.ok) {
        errors.push(`Failed to fetch body for email ${email.id}: ${bodyRes.status}`);
        await supabase.from("email_records").update({ price_extracted: true, price_extraction_job_id: jobId }).eq("id", email.id);
        continue;
      }

      const bodyData = await bodyRes.json();
      const fullBody = stripHtml(bodyData.body?.content || "").substring(0, 15000);

      // Extract from email body
      const bodyResult = await extractPricesFromEmailBody(
        {
          emailId: email.id,
          senderEmail: email.sender_email || "",
          senderName: email.sender_name || null,
          subject: email.subject || "",
          projectName,
          bodyText: fullBody,
        },
        anthropicApiKey
      );

      if (bodyResult.has_prices) {
        pricesFound++;
        newItems += bodyResult.line_items.length;
        existingResults.push(bodyResult);
      }

      // Check PDF attachments
      if (email.has_attachments) {
        try {
          const attRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${email.outlook_message_id}/attachments?$select=id,name,contentType,size,isInline`,
            { headers: { Authorization: `Bearer ${graphToken}` } }
          );

          if (attRes.ok) {
            const attData = await attRes.json();
            const pdfAttachments = (attData.value || []).filter(
              (a: any) => !a.isInline && a.contentType === "application/pdf" && a.size < 20 * 1024 * 1024
            );

            for (const att of pdfAttachments) {
              try {
                const singleAttRes = await fetch(
                  `https://graph.microsoft.com/v1.0/me/messages/${email.outlook_message_id}/attachments/${att.id}`,
                  { headers: { Authorization: `Bearer ${graphToken}` } }
                );

                if (singleAttRes.ok) {
                  const singleAttData = await singleAttRes.json();
                  if (singleAttData.contentBytes) {
                    const pdfResult = await extractPricesFromPdf(
                      {
                        emailId: email.id,
                        senderEmail: email.sender_email || "",
                        senderName: email.sender_name || null,
                        subject: email.subject || "",
                        projectName,
                        attachmentName: att.name,
                        contentBase64: singleAttData.contentBytes,
                        contentType: att.contentType,
                      },
                      anthropicApiKey
                    );

                    if (pdfResult.has_prices) {
                      if (!bodyResult.has_prices) pricesFound++;
                      newItems += pdfResult.line_items.length;
                      existingResults.push(pdfResult);
                    }
                  }
                }
              } catch (pdfErr: any) {
                errors.push(`PDF extraction error for ${att.name}: ${pdfErr?.message}`);
              }
            }
          }
        } catch (attErr: any) {
          errors.push(`Attachment fetch error for email ${email.id}: ${attErr?.message}`);
        }
      }

      // Mark email as processed
      await supabase
        .from("email_records")
        .update({ price_extracted: true, price_extraction_job_id: jobId })
        .eq("id", email.id);

    } catch (emailErr: any) {
      errors.push(`Error processing email ${email.id}: ${emailErr?.message}`);
      // Still mark as processed to avoid infinite retries
      await supabase
        .from("email_records")
        .update({ price_extracted: true, price_extraction_job_id: jobId })
        .eq("id", email.id);
    }
  }

  // 4. Update job progress
  const updatedScanned = (job.scanned_emails || 0) + processed;
  const updatedWithPrices = (job.emails_with_prices || 0) + pricesFound;
  const updatedItems = (job.extracted_items || 0) + newItems;
  const existingErrors = job.errors || [];

  await supabase
    .from("price_extraction_jobs")
    .update({
      status: "extracting",
      scanned_emails: updatedScanned,
      emails_with_prices: updatedWithPrices,
      extracted_items: updatedItems,
      extraction_results: existingResults,
      errors: [...existingErrors, ...errors],
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // Check if done (processed less than chunk size = no more emails)
  const isDone = emails.length < chunkSize;
  if (isDone) {
    await supabase
      .from("price_extraction_jobs")
      .update({
        status: "preview_ready",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  return {
    processed,
    pricesFound,
    newItems,
    done: isDone,
    errors,
  };
}
