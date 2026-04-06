// ============================================================
// Archive Storage Service — Upload email archives to Supabase Storage.
// Handles .eml generation, attachment download from Graph API,
// dedup filenames, and Supabase bucket uploads.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEml, type EmlEmailData, type EmlAttachment } from "./eml-generator";
import {
  determineArchivePath,
  type ArchiveEmailInput,
  type ArchivePathResult,
} from "./email-archiver";
import type { ArchiveStructure, ArchiveFilenameFormat } from "@cantaia/database";

// ── Types ──

export interface ArchiveableEmail {
  id: string;
  outlook_message_id: string | null;
  subject: string;
  sender_email: string;
  sender_name: string | null;
  recipients: string[] | null;
  received_at: string;
  body_text: string | null;
  body_html: string | null;
  body_preview: string | null;
  classification: string | null;
  has_attachments: boolean;
}

export interface ArchiveProjectConfig {
  id: string;
  name: string;
  organization_id: string;
  archive_path: string | null;
  archive_structure: string;
  archive_filename_format: string;
  archive_attachments_mode: string;
}

export interface ArchiveResult {
  email_id: string;
  storage_path: string;
  folder_name: string | null;
  file_name: string;
  file_size: number;
  attachments_saved: { name: string; storage_path: string; size: number }[];
  status: "saved" | "failed";
  error_message?: string;
}

export interface GraphTokenProvider {
  getAccessToken: () => Promise<string | null>;
}

const BUCKET_NAME = "email-archives";

// ── Main function: archive a single email ──

export async function archiveEmail(
  admin: SupabaseClient,
  email: ArchiveableEmail,
  project: ArchiveProjectConfig,
  graphToken: string | null
): Promise<ArchiveResult> {
  const structure = (project.archive_structure || "by_category") as ArchiveStructure;
  const filenameFormat = (project.archive_filename_format || "date_sender_subject") as ArchiveFilenameFormat;

  // 1. Compute archive path
  const archiveInput: ArchiveEmailInput = {
    emailId: email.id,
    projectName: project.name,
    senderEmail: email.sender_email,
    senderName: email.sender_name,
    subject: email.subject,
    receivedAt: email.received_at,
    classification: email.classification,
    attachmentNames: [],
  };

  const pathResult = determineArchivePath(archiveInput, structure, filenameFormat);

  // 2. Download attachments from Graph API (if available)
  let emlAttachments: EmlAttachment[] = [];
  const savedAttachments: { name: string; storage_path: string; size: number }[] = [];

  if (email.has_attachments && email.outlook_message_id && graphToken) {
    try {
      emlAttachments = await fetchGraphAttachments(graphToken, email.outlook_message_id);
      // Update the archive input with actual attachment names for path computation
      archiveInput.attachmentNames = emlAttachments.map((a) => a.filename);
    } catch (err) {
      console.warn(`[archive-storage] Failed to fetch attachments for ${email.id}:`, err);
      // Continue without attachments — still archive the email text
    }
  }

  // 3. Generate .eml file
  const emlData: EmlEmailData = {
    messageId: email.outlook_message_id || undefined,
    subject: email.subject,
    from: {
      name: email.sender_name || undefined,
      email: email.sender_email,
    },
    to: parseRecipients(email.recipients),
    date: email.received_at,
    bodyText: email.body_text || email.body_preview || undefined,
    bodyHtml: email.body_html || undefined,
    attachments: emlAttachments,
  };

  const emlBuffer = generateEml(emlData);

  // 4. Build storage path with dedup
  const storagePath = buildStoragePath(project.organization_id, project.id, pathResult);
  const dedupedPath = await deduplicateStoragePath(admin, storagePath);

  // 5. Upload .eml to Supabase Storage
  try {
    const { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(dedupedPath, emlBuffer, {
        contentType: "message/rfc822",
        upsert: false,
      });

    if (uploadError) {
      console.error(`[archive-storage] Upload failed for ${email.id}:`, uploadError.message);
      return {
        email_id: email.id,
        storage_path: dedupedPath,
        folder_name: pathResult.folder || null,
        file_name: pathResult.fileName,
        file_size: 0,
        attachments_saved: [],
        status: "failed",
        error_message: uploadError.message,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      email_id: email.id,
      storage_path: dedupedPath,
      folder_name: pathResult.folder || null,
      file_name: pathResult.fileName,
      file_size: 0,
      attachments_saved: [],
      status: "failed",
      error_message: msg,
    };
  }

  // 6. Upload attachments separately (if mode = "beside" or "thematic")
  if (emlAttachments.length > 0 && project.archive_attachments_mode !== "subfolder") {
    for (const att of emlAttachments) {
      try {
        const attFolder = project.archive_attachments_mode === "thematic" && pathResult.attachmentsFolder
          ? pathResult.attachmentsFolder
          : pathResult.folder || "";

        const attPath = buildAttachmentStoragePath(
          project.organization_id,
          project.id,
          attFolder,
          att.filename
        );
        const dedupedAttPath = await deduplicateStoragePath(admin, attPath);

        const { error: attUploadErr } = await admin.storage
          .from(BUCKET_NAME)
          .upload(dedupedAttPath, Buffer.from(att.content), {
            contentType: att.contentType,
            upsert: false,
          });

        if (!attUploadErr) {
          savedAttachments.push({
            name: att.filename,
            storage_path: dedupedAttPath,
            size: att.content.length,
          });
        }
      } catch {
        // Skip failed attachment uploads — .eml still contains them
      }
    }
  }

  return {
    email_id: email.id,
    storage_path: dedupedPath,
    folder_name: pathResult.folder || null,
    file_name: pathResult.fileName,
    file_size: emlBuffer.length,
    attachments_saved: savedAttachments,
    status: "saved",
  };
}

// ── Batch archive ──

export async function archiveEmailsBatch(
  admin: SupabaseClient,
  emails: ArchiveableEmail[],
  project: ArchiveProjectConfig,
  graphToken: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<ArchiveResult[]> {
  const results: ArchiveResult[] = [];
  let done = 0;

  // Process sequentially to avoid Graph API rate limits
  for (const email of emails) {
    const result = await archiveEmail(admin, email, project, graphToken);
    results.push(result);
    done++;
    onProgress?.(done, emails.length);
  }

  return results;
}

// ── Graph API attachment fetcher ──

async function fetchGraphAttachments(
  accessToken: string,
  messageId: string
): Promise<EmlAttachment[]> {
  const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
  const url = `${GRAPH_BASE}/me/messages/${messageId}/attachments`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    value: Array<{
      id: string;
      name: string;
      contentType: string;
      size: number;
      isInline: boolean;
      contentBytes?: string;
    }>;
  };

  return (data.value || [])
    .filter((a) => a.contentBytes) // Only include attachments with content
    .map((a) => ({
      filename: a.name,
      contentType: a.contentType || "application/octet-stream",
      content: Buffer.from(a.contentBytes!, "base64"),
      isInline: a.isInline,
    }));
}

// ── Storage path helpers ──

function buildStoragePath(
  orgId: string,
  projectId: string,
  pathResult: ArchivePathResult
): string {
  const folder = pathResult.folder
    ? `${orgId}/${projectId}/${sanitizeStoragePath(pathResult.folder)}`
    : `${orgId}/${projectId}`;

  return `${folder}/${sanitizeStoragePath(pathResult.fileName)}.eml`;
}

function buildAttachmentStoragePath(
  orgId: string,
  projectId: string,
  folder: string,
  filename: string
): string {
  const basePath = folder
    ? `${orgId}/${projectId}/${sanitizeStoragePath(folder)}`
    : `${orgId}/${projectId}`;

  return `${basePath}/${sanitizeStoragePath(filename)}`;
}

/**
 * Deduplicate a storage path by checking if it already exists.
 * If "path/file.eml" exists, tries "path/file-1.eml", "path/file-2.eml", etc.
 */
async function deduplicateStoragePath(
  admin: SupabaseClient,
  originalPath: string
): Promise<string> {
  // Check if file exists by trying to get its metadata
  const { data: existing } = await admin.storage
    .from(BUCKET_NAME)
    .list(getParentFolder(originalPath), {
      search: getFileName(originalPath),
    });

  const baseName = getFileName(originalPath);
  if (!existing || !existing.some((f) => f.name === baseName)) {
    return originalPath;
  }

  // File exists — find next available suffix
  const parentFolder = getParentFolder(originalPath);
  const ext = getExtension(baseName);
  const nameWithoutExt = ext ? baseName.slice(0, -ext.length - 1) : baseName;

  for (let i = 1; i <= 999; i++) {
    const candidate = ext
      ? `${nameWithoutExt}-${i}.${ext}`
      : `${nameWithoutExt}-${i}`;

    const { data: check } = await admin.storage
      .from(BUCKET_NAME)
      .list(parentFolder, { search: candidate });

    if (!check || !check.some((f) => f.name === candidate)) {
      return parentFolder ? `${parentFolder}/${candidate}` : candidate;
    }
  }

  // Extreme fallback — add timestamp
  const ts = Date.now();
  const candidate = ext
    ? `${nameWithoutExt}-${ts}.${ext}`
    : `${nameWithoutExt}-${ts}`;
  return parentFolder ? `${parentFolder}/${candidate}` : candidate;
}

function getParentFolder(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function getExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  return dotIdx > 0 ? filename.slice(dotIdx + 1) : "";
}

function sanitizeStoragePath(segment: string): string {
  return segment
    .replace(/\\/g, "/") // Convert backslashes to forward slashes
    .replace(/[<>:"|?*]/g, "_") // Remove invalid chars
    .replace(/\/+/g, "/") // Collapse multiple slashes
    .replace(/^\/|\/$/g, ""); // Trim leading/trailing slashes
}

function parseRecipients(
  recipients: string[] | null
): { name?: string; email: string }[] {
  if (!recipients || recipients.length === 0) {
    return [{ email: "undisclosed-recipients" }];
  }
  return recipients.map((r) => {
    // Handle "Name <email>" format
    const match = r.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
      return { name: match[1].trim(), email: match[2].trim() };
    }
    return { email: r.trim() };
  });
}
