// ============================================================
// Support attachment validation
// ============================================================
// Attachments are persisted verbatim in support_messages.attachments (JSONB)
// and later signed for download by GET /api/support/tickets/[id]. Without
// validation the client could:
//   • point file_url at ANY path in the private `support` bucket (IDOR:
//     signAttachmentUrls signs whatever path it finds, cross-org included), or
//   • smuggle arbitrary fields / markup that reaches the superadmin console.
// This module clamps count, whitelists the shape, and forces file_url to be a
// bucket-relative path scoped to the caller's own org (and ticket, when known).

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB — mirrors the upload route
const MAX_ATTACHMENTS = 5;

export interface SupportAttachment {
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

export interface ValidateResult {
  ok: boolean;
  error?: string;
  attachments: SupportAttachment[];
}

/**
 * Validate and sanitize a client-supplied attachments array.
 *
 * `file_url` must be the storage PATH returned by the upload route
 * (`<orgId>/<ticketId>/<file>`), never a URL — and it must live under the
 * caller's own org prefix (and ticket prefix when the ticket id is known).
 */
export function validateSupportAttachments(
  raw: unknown,
  opts: { organizationId: string; ticketId?: string },
): ValidateResult {
  if (raw === undefined || raw === null) {
    return { ok: true, attachments: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "attachments must be an array", attachments: [] };
  }
  if (raw.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Too many attachments (max ${MAX_ATTACHMENTS})`, attachments: [] };
  }

  const prefix = opts.ticketId
    ? `${opts.organizationId}/${opts.ticketId}/`
    : `${opts.organizationId}/`;

  const attachments: SupportAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid attachment entry", attachments: [] };
    }
    const a = item as Record<string, unknown>;
    const fileUrl = typeof a.file_url === "string" ? a.file_url : "";
    const fileName = typeof a.file_name === "string" ? a.file_name : "";
    const fileType = typeof a.file_type === "string" ? a.file_type : "";
    const fileSize = typeof a.file_size === "number" ? a.file_size : NaN;

    // Path only — reject any URI scheme, traversal, or foreign prefix.
    if (
      !fileUrl ||
      /^[a-z]+:\/\//i.test(fileUrl) ||
      fileUrl.includes("://") ||
      fileUrl.includes("..") ||
      !fileUrl.startsWith(prefix)
    ) {
      return { ok: false, error: "Invalid attachment path", attachments: [] };
    }
    if (!ALLOWED_TYPES.includes(fileType)) {
      return { ok: false, error: "Attachment type not allowed", attachments: [] };
    }
    if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > MAX_SIZE) {
      return { ok: false, error: "Invalid attachment size", attachments: [] };
    }

    attachments.push({
      file_url: fileUrl,
      file_name: fileName.slice(0, 255),
      file_size: fileSize,
      file_type: fileType,
    });
  }

  return { ok: true, attachments };
}
