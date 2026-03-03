// ============================================================
// Cantaia — File Price Extractor
// Parses uploaded .eml files and extracts pricing data
// ============================================================

import { simpleParser, type ParsedMail } from "mailparser";
import {
  extractPricesFromEmailBody,
  extractPricesFromPdf,
  type EmailPriceExtractionResult,
} from "./email-price-extractor";

// ---------- Interfaces ----------

export interface FileExtractionInput {
  fileName: string;
  fileBuffer: Buffer;
  contentType: string;
  anthropicApiKey: string;
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void;
}

export interface FileExtractionResult {
  fileName: string;
  results: EmailPriceExtractionResult[];
  error?: string;
}

// ---------- Main entry ----------

/**
 * Extract prices from an uploaded file (.eml, .pdf, .txt).
 * For .eml: parses MIME structure, extracts body + PDF attachments.
 * For .pdf: sends directly to Claude Vision.
 */
export async function extractPricesFromFile(
  input: FileExtractionInput
): Promise<FileExtractionResult> {
  const { fileName, fileBuffer, contentType, anthropicApiKey, onUsage } = input;
  const lower = fileName.toLowerCase();

  try {
    if (lower.endsWith(".eml") || contentType === "message/rfc822") {
      return await processEmlFile(fileName, fileBuffer, anthropicApiKey, onUsage);
    }

    if (lower.endsWith(".msg")) {
      return await processMsgFile(fileName, fileBuffer, anthropicApiKey, onUsage);
    }

    if (lower.endsWith(".pdf") || contentType === "application/pdf") {
      return await processPdfFile(fileName, fileBuffer, anthropicApiKey, onUsage);
    }

    // Plain text / HTML fallback
    if (lower.endsWith(".txt") || lower.endsWith(".html") || lower.endsWith(".htm")) {
      return await processTextFile(fileName, fileBuffer, anthropicApiKey, onUsage);
    }

    return { fileName, results: [], error: `Type de fichier non supporté: ${fileName}` };
  } catch (err: any) {
    console.error(`[file-price-extractor] Error processing ${fileName}:`, err?.message);
    return { fileName, results: [], error: err?.message || "Erreur inconnue" };
  }
}

// ---------- .eml processing ----------

async function processEmlFile(
  fileName: string,
  buffer: Buffer,
  anthropicApiKey: string,
  onUsage?: FileExtractionInput["onUsage"]
): Promise<FileExtractionResult> {
  const parsed: ParsedMail = await simpleParser(buffer);
  const results: EmailPriceExtractionResult[] = [];
  const emailId = `file:${fileName}:${Date.now()}`;

  const senderEmail = parsed.from?.value?.[0]?.address || "unknown@unknown.com";
  const senderName = parsed.from?.value?.[0]?.name || null;
  const subject = parsed.subject || fileName;

  // Extract body text
  let bodyText = parsed.text || "";
  if (!bodyText && parsed.html) {
    bodyText = stripHtml(parsed.html);
  }

  // Process email body if it has content
  if (bodyText.trim().length > 50) {
    const bodyResult = await extractPricesFromEmailBody(
      {
        emailId,
        senderEmail,
        senderName,
        subject,
        projectName: null,
        bodyText,
      },
      anthropicApiKey,
      onUsage
    );
    if (bodyResult.has_prices) {
      results.push(bodyResult);
    }
  }

  // Process PDF attachments
  if (parsed.attachments && parsed.attachments.length > 0) {
    for (const att of parsed.attachments) {
      if (att.contentType === "application/pdf" && att.content) {
        const pdfResult = await extractPricesFromPdf(
          {
            emailId,
            senderEmail,
            senderName,
            subject,
            projectName: null,
            attachmentName: att.filename || "attachment.pdf",
            contentBase64: att.content.toString("base64"),
            contentType: "application/pdf",
          },
          anthropicApiKey,
          onUsage
        );
        if (pdfResult.has_prices) {
          results.push(pdfResult);
        }
      }
    }
  }

  return { fileName, results };
}

// ---------- .msg processing (basic) ----------

async function processMsgFile(
  fileName: string,
  buffer: Buffer,
  anthropicApiKey: string,
  onUsage?: FileExtractionInput["onUsage"]
): Promise<FileExtractionResult> {
  // .msg files are Outlook proprietary format.
  // We do a basic extraction of text content from the binary.
  // This won't work for all .msg files but covers simple cases.
  const textContent = extractTextFromMsgBuffer(buffer);
  const emailId = `file:${fileName}:${Date.now()}`;

  if (textContent.length < 50) {
    return { fileName, results: [], error: "Impossible de lire le fichier .msg. Exportez en .eml depuis Outlook." };
  }

  const bodyResult = await extractPricesFromEmailBody(
    {
      emailId,
      senderEmail: "unknown@msg-file.local",
      senderName: null,
      subject: fileName.replace(/\.msg$/i, ""),
      projectName: null,
      bodyText: textContent,
    },
    anthropicApiKey,
    onUsage
  );

  return {
    fileName,
    results: bodyResult.has_prices ? [bodyResult] : [],
  };
}

/**
 * Naive text extraction from .msg binary.
 * Extracts readable UTF-16LE and ASCII strings.
 */
function extractTextFromMsgBuffer(buffer: Buffer): string {
  // Try UTF-16LE (common in .msg files)
  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < buffer.length - 1; i += 2) {
    const charCode = buffer.readUInt16LE(i);
    if (charCode >= 32 && charCode < 65536 && charCode !== 65534 && charCode !== 65535) {
      const char = String.fromCharCode(charCode);
      if (/[\x20-\x7E\u00C0-\u024F\u2000-\u206F]/.test(char)) {
        currentChunk += char;
      } else if (currentChunk.length > 20) {
        chunks.push(currentChunk);
        currentChunk = "";
      } else {
        currentChunk = "";
      }
    } else if (currentChunk.length > 20) {
      chunks.push(currentChunk);
      currentChunk = "";
    } else {
      currentChunk = "";
    }
  }
  if (currentChunk.length > 20) chunks.push(currentChunk);

  return chunks.join("\n").substring(0, 15000);
}

// ---------- .pdf processing ----------

async function processPdfFile(
  fileName: string,
  buffer: Buffer,
  anthropicApiKey: string,
  onUsage?: FileExtractionInput["onUsage"]
): Promise<FileExtractionResult> {
  const emailId = `file:${fileName}:${Date.now()}`;
  const result = await extractPricesFromPdf(
    {
      emailId,
      senderEmail: "unknown@pdf-file.local",
      senderName: null,
      subject: fileName.replace(/\.pdf$/i, ""),
      projectName: null,
      attachmentName: fileName,
      contentBase64: buffer.toString("base64"),
      contentType: "application/pdf",
    },
    anthropicApiKey,
    onUsage
  );

  return {
    fileName,
    results: result.has_prices ? [result] : [],
  };
}

// ---------- .txt / .html processing ----------

async function processTextFile(
  fileName: string,
  buffer: Buffer,
  anthropicApiKey: string,
  onUsage?: FileExtractionInput["onUsage"]
): Promise<FileExtractionResult> {
  const emailId = `file:${fileName}:${Date.now()}`;
  let text = buffer.toString("utf-8");
  if (fileName.toLowerCase().endsWith(".html") || fileName.toLowerCase().endsWith(".htm")) {
    text = stripHtml(text);
  }

  const result = await extractPricesFromEmailBody(
    {
      emailId,
      senderEmail: "unknown@text-file.local",
      senderName: null,
      subject: fileName.replace(/\.(txt|html|htm)$/i, ""),
      projectName: null,
      bodyText: text,
    },
    anthropicApiKey,
    onUsage
  );

  return {
    fileName,
    results: result.has_prices ? [result] : [],
  };
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
