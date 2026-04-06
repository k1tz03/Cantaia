// ============================================================
// EML Generator — Creates RFC 2822 MIME .eml files from email data.
// Produces standard .eml format readable by Outlook, Thunderbird, Mail.app.
// Supports HTML body, plain text fallback, and base64-encoded attachments.
// ============================================================

export interface EmlEmailData {
  messageId?: string;
  subject: string;
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  date: string; // ISO 8601
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmlAttachment[];
}

export interface EmlAttachment {
  filename: string;
  contentType: string;
  content: Buffer | Uint8Array; // raw binary content
  contentId?: string; // for inline images (cid:xxx)
  isInline?: boolean;
}

/**
 * Generate a complete .eml file (RFC 2822 MIME message) as a Buffer.
 */
export function generateEml(email: EmlEmailData): Buffer {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const hasAttachments = email.attachments && email.attachments.length > 0;
  const hasHtml = !!email.bodyHtml;
  const hasText = !!email.bodyText;

  const lines: string[] = [];

  // ── Headers ──
  lines.push(`From: ${formatAddress(email.from)}`);
  lines.push(`To: ${email.to.map(formatAddress).join(", ")}`);
  if (email.cc && email.cc.length > 0) {
    lines.push(`Cc: ${email.cc.map(formatAddress).join(", ")}`);
  }
  lines.push(`Subject: ${encodeSubject(email.subject)}`);
  lines.push(`Date: ${formatRfc2822Date(email.date)}`);
  if (email.messageId) {
    lines.push(`Message-ID: <${email.messageId}>`);
  }
  lines.push(`MIME-Version: 1.0`);
  lines.push(`X-Archived-By: Cantaia`);

  if (hasAttachments) {
    // multipart/mixed wraps everything
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("");

    // Body part (multipart/alternative or single)
    lines.push(`--${boundary}`);

    if (hasHtml && hasText) {
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push("");

      // Plain text part
      lines.push(`--${altBoundary}`);
      lines.push(`Content-Type: text/plain; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyText!));
      lines.push("");

      // HTML part
      lines.push(`--${altBoundary}`);
      lines.push(`Content-Type: text/html; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyHtml!));
      lines.push("");

      lines.push(`--${altBoundary}--`);
    } else if (hasHtml) {
      lines.push(`Content-Type: text/html; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyHtml!));
    } else if (hasText) {
      lines.push(`Content-Type: text/plain; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyText!));
    } else {
      lines.push(`Content-Type: text/plain; charset="utf-8"`);
      lines.push("");
      lines.push("(no content)");
    }

    // Attachment parts
    for (const att of email.attachments!) {
      lines.push("");
      lines.push(`--${boundary}`);

      const disposition = att.isInline ? "inline" : "attachment";
      lines.push(
        `Content-Type: ${att.contentType}; name="${sanitizeHeaderValue(att.filename)}"`
      );
      lines.push(`Content-Transfer-Encoding: base64`);
      lines.push(
        `Content-Disposition: ${disposition}; filename="${sanitizeHeaderValue(att.filename)}"`
      );
      if (att.contentId) {
        lines.push(`Content-ID: <${att.contentId}>`);
      }
      lines.push("");
      lines.push(bufferToBase64Lines(att.content));
    }

    lines.push("");
    lines.push(`--${boundary}--`);
  } else {
    // No attachments — simpler structure
    if (hasHtml && hasText) {
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push("");

      lines.push(`--${altBoundary}`);
      lines.push(`Content-Type: text/plain; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyText!));
      lines.push("");

      lines.push(`--${altBoundary}`);
      lines.push(`Content-Type: text/html; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyHtml!));
      lines.push("");

      lines.push(`--${altBoundary}--`);
    } else if (hasHtml) {
      lines.push(`Content-Type: text/html; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyHtml!));
    } else {
      lines.push(`Content-Type: text/plain; charset="utf-8"`);
      lines.push(`Content-Transfer-Encoding: quoted-printable`);
      lines.push("");
      lines.push(encodeQuotedPrintable(email.bodyText || "(no content)"));
    }
  }

  lines.push("");

  return Buffer.from(lines.join("\r\n"), "utf-8");
}

// ── Helpers ──

function formatAddress(addr: { name?: string; email: string }): string {
  if (addr.name) {
    // Encode non-ASCII chars in name
    const safeName = /[^\x20-\x7E]/.test(addr.name)
      ? `=?utf-8?B?${Buffer.from(addr.name, "utf-8").toString("base64")}?=`
      : `"${addr.name.replace(/"/g, '\\"')}"`;
    return `${safeName} <${addr.email}>`;
  }
  return addr.email;
}

function encodeSubject(subject: string): string {
  if (/[^\x20-\x7E]/.test(subject)) {
    // RFC 2047 Base64 encoding for non-ASCII subjects
    return `=?utf-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  }
  return subject;
}

function formatRfc2822Date(isoDate: string): string {
  const d = new Date(isoDate);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const day = days[d.getUTCDay()];
  const date = d.getUTCDate();
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const mins = String(d.getUTCMinutes()).padStart(2, "0");
  const secs = String(d.getUTCSeconds()).padStart(2, "0");

  return `${day}, ${date} ${month} ${year} ${hours}:${mins}:${secs} +0000`;
}

function encodeQuotedPrintable(text: string): string {
  // Simple QP encoding: encode non-ASCII bytes and lines > 76 chars
  const encoded = Buffer.from(text, "utf-8");
  const lines: string[] = [];
  let currentLine = "";

  for (let i = 0; i < encoded.length; i++) {
    const byte = encoded[i];
    let char: string;

    if (byte === 0x0d && encoded[i + 1] === 0x0a) {
      // CRLF — preserve line breaks
      lines.push(currentLine);
      currentLine = "";
      i++; // skip LF
      continue;
    } else if (byte === 0x0a) {
      // LF only — convert to line break
      lines.push(currentLine);
      currentLine = "";
      continue;
    } else if (byte === 0x09 || (byte >= 0x20 && byte <= 0x7e && byte !== 0x3d)) {
      // Tab, printable ASCII except '='
      char = String.fromCharCode(byte);
    } else {
      // Encode as =XX
      char = `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }

    // Soft line break if line would exceed 76 chars
    if (currentLine.length + char.length > 75) {
      lines.push(currentLine + "=");
      currentLine = char;
    } else {
      currentLine += char;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\r\n");
}

function bufferToBase64Lines(content: Buffer | Uint8Array): string {
  const b64 = Buffer.from(content).toString("base64");
  // Split into 76-char lines per RFC 2045
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/["\r\n]/g, "");
}
