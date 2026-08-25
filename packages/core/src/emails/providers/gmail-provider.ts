// ============================================================
// Gmail / Google Workspace — Email Provider (Gmail API)
// ============================================================

import type {
  EmailProvider,
  EmailConnection,
  RawEmail,
  EmailDraft,
  EmailAttachment,
} from "./email-provider.interface";

const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch<T>(token: string, url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401) {
    throw new Error("Gmail token expired");
  }

  if (response.status === 429) {
    throw new Error("Gmail API rate limited");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail API error ${response.status}: ${body}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

/** Encode an RFC 5322 header value safely (RFC 2047 for non-ASCII). */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/**
 * Build an RFC 2822 message encoded as base64url for the Gmail API.
 *
 * AUDIT 08/2026 — the previous version built a bare multipart/alternative and
 * dropped draft.attachments AND draft.bcc entirely: a Gmail send with files
 * left without them, silently. When attachments are present the message is now
 * a multipart/mixed carrying the HTML body plus each attachment, and Bcc is
 * always emitted as a header.
 */
function buildRawMessage(from: string, draft: EmailDraft): string {
  const to = draft.to.join(", ");
  const cc = draft.cc?.join(", ") || "";
  const bcc = draft.bcc?.join(", ") || "";
  const attachments = draft.attachments || [];

  const headers: string[] = [
    `From: ${from}`,
    `To: ${to}`,
  ];
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  headers.push(`Subject: ${encodeHeaderValue(draft.subject)}`);
  headers.push("MIME-Version: 1.0");

  let message: string;

  if (attachments.length > 0) {
    const boundary = `mixed_${Date.now()}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    message = headers.join("\r\n") + "\r\n\r\n";

    // Body part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n`;
    message += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    message += `${draft.bodyHtml}\r\n\r\n`;

    // Attachment parts
    for (const att of attachments) {
      const base64 = Buffer.isBuffer(att.content)
        ? att.content.toString("base64")
        : Buffer.from(att.content as string).toString("base64");
      // Split into 76-char lines per RFC 2045
      const wrapped = base64.replace(/(.{76})/g, "$1\r\n");
      message += `--${boundary}\r\n`;
      message += `Content-Type: ${att.contentType || "application/octet-stream"}; name="${att.filename}"\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n`;
      message += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
      message += `${wrapped}\r\n`;
    }
    message += `--${boundary}--`;
  } else {
    const boundary = `alt_${Date.now()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    message = headers.join("\r\n") + "\r\n\r\n";
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    message += `${draft.bodyHtml}\r\n`;
    message += `--${boundary}--`;
  }

  // Base64url encode
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; attachmentId?: string; size: number };
      filename?: string;
      headers?: Array<{ name: string; value: string }>;
      parts?: Array<{
        mimeType: string;
        body?: { data?: string; size: number };
      }>;
    }>;
  };
  internalDate: string;
}

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractBody(msg: GmailMessage): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};

  function processPayload(payload: GmailMessage["payload"]) {
    if (payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8");
      if (payload.mimeType === "text/plain") result.text = decoded;
      if (payload.mimeType === "text/html") result.html = decoded;
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.body?.data) {
          const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
          if (part.mimeType === "text/plain") result.text = decoded;
          if (part.mimeType === "text/html") result.html = decoded;
        }
        if (part.parts) {
          for (const sub of part.parts) {
            if (sub.body?.data) {
              const decoded = Buffer.from(sub.body.data, "base64").toString("utf-8");
              if (sub.mimeType === "text/plain") result.text = decoded;
              if (sub.mimeType === "text/html") result.html = decoded;
            }
          }
        }
      }
    }
  }

  processPayload(msg.payload);
  return result;
}

function parseEmailAddress(raw: string): { address: string; name?: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), address: match[2].trim() };
  return { address: raw.trim() };
}

export class GmailProvider implements EmailProvider {
  async fetchEmails(connection: EmailConnection, since?: Date): Promise<RawEmail[]> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    // Search for messages since date
    const sinceTimestamp = since
      ? Math.floor(since.getTime() / 1000)
      : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

    const query = `after:${sinceTimestamp}`;
    const listUrl = `${GMAIL_BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=50`;
    const list = await gmailFetch<{ messages?: Array<{ id: string; threadId: string }> }>(token, listUrl);

    if (!list.messages?.length) return [];

    // Fetch full message details for each
    const results: RawEmail[] = [];

    for (const msg of list.messages) {
      try {
        const fullMsg = await gmailFetch<GmailMessage>(
          token,
          `${GMAIL_BASE_URL}/messages/${msg.id}?format=full`
        );

        const from = getHeader(fullMsg, "From");
        const to = getHeader(fullMsg, "To");
        const cc = getHeader(fullMsg, "Cc");
        const subject = getHeader(fullMsg, "Subject");
        const parsed = parseEmailAddress(from);
        const body = extractBody(fullMsg);

        // Extract attachment metadata from parts
        const attachments: EmailAttachment[] = [];
        if (fullMsg.payload.parts) {
          for (const part of fullMsg.payload.parts) {
            if (part.filename && part.body?.attachmentId) {
              attachments.push({
                id: part.body.attachmentId,
                filename: part.filename,
                contentType: part.mimeType,
                size: part.body.size,
                isInline: false,
              });
            }
          }
        }

        results.push({
          externalId: fullMsg.id,
          conversationId: fullMsg.threadId,
          from: parsed.address,
          fromName: parsed.name,
          to: to ? to.split(",").map((a) => parseEmailAddress(a.trim()).address) : [],
          cc: cc ? cc.split(",").map((a) => parseEmailAddress(a.trim()).address) : undefined,
          subject: subject || "(Sans objet)",
          date: new Date(parseInt(fullMsg.internalDate)),
          bodyText: body.text,
          bodyHtml: body.html,
          attachments,
          isRead: !fullMsg.labelIds.includes("UNREAD"),
        });
      } catch (err) {
        console.warn(`[gmail] Failed to fetch message ${msg.id}:`, err);
      }
    }

    return results;
  }

  async sendEmail(connection: EmailConnection, draft: EmailDraft): Promise<string> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    const raw = buildRawMessage(connection.email_address, draft);
    const result = await gmailFetch<{ id: string }>(
      token,
      `${GMAIL_BASE_URL}/messages/send`,
      {
        method: "POST",
        body: JSON.stringify({ raw }),
      }
    );

    return result.id;
  }

  async replyToEmail(connection: EmailConnection, originalId: string, draft: EmailDraft): Promise<string> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    // Get original message for threadId
    const original = await gmailFetch<{ threadId: string }>(
      token,
      `${GMAIL_BASE_URL}/messages/${originalId}?format=minimal`
    );

    const raw = buildRawMessage(connection.email_address, draft);
    const result = await gmailFetch<{ id: string }>(
      token,
      `${GMAIL_BASE_URL}/messages/send`,
      {
        method: "POST",
        body: JSON.stringify({ raw, threadId: original.threadId }),
      }
    );

    return result.id;
  }

  async moveEmail(connection: EmailConnection, messageId: string, labelId: string): Promise<void> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    await gmailFetch(
      token,
      `${GMAIL_BASE_URL}/messages/${messageId}/modify`,
      {
        method: "POST",
        body: JSON.stringify({
          addLabelIds: [labelId],
          removeLabelIds: ["INBOX"],
        }),
      }
    );
  }

  async createProjectFolder(connection: EmailConnection, projectName: string): Promise<string> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    const label = await gmailFetch<{ id: string }>(
      token,
      `${GMAIL_BASE_URL}/labels`,
      {
        method: "POST",
        body: JSON.stringify({
          name: `Cantaia/${projectName}`,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      }
    );

    return label.id;
  }

  async markAsRead(connection: EmailConnection, messageId: string): Promise<void> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    await gmailFetch(
      token,
      `${GMAIL_BASE_URL}/messages/${messageId}/modify`,
      {
        method: "POST",
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      }
    );
  }

  async testConnection(connection: EmailConnection): Promise<{ success: boolean; error?: string }> {
    const token = connection.oauth_access_token;
    if (!token) return { success: false, error: "No access token" };

    try {
      const response = await fetch(`${GMAIL_BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async refreshToken(connection: EmailConnection): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }> {
    if (!connection.oauth_refresh_token) {
      throw new Error("No refresh token available");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth not configured");
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.oauth_refresh_token,
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Token refresh failed: ${errorData.error_description || response.statusText}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  }

  async getEmailBody(connection: EmailConnection, messageId: string): Promise<{ bodyHtml?: string; bodyText?: string }> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    const msg = await gmailFetch<GmailMessage>(
      token,
      `${GMAIL_BASE_URL}/messages/${messageId}?format=full`
    );

    const body = extractBody(msg);
    return { bodyHtml: body.html, bodyText: body.text };
  }

  async getAttachments(connection: EmailConnection, messageId: string): Promise<EmailAttachment[]> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Gmail access token");

    const msg = await gmailFetch<GmailMessage>(
      token,
      `${GMAIL_BASE_URL}/messages/${messageId}?format=full`
    );

    const attachments: EmailAttachment[] = [];
    if (msg.payload.parts) {
      for (const part of msg.payload.parts) {
        if (part.filename && part.body?.attachmentId) {
          // Fetch attachment content
          const att = await gmailFetch<{ data: string }>(
            token,
            `${GMAIL_BASE_URL}/messages/${messageId}/attachments/${part.body.attachmentId}`
          );

          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            contentType: part.mimeType,
            size: part.body.size,
            isInline: false,
            contentBytes: att.data,
          });
        }
      }
    }

    return attachments;
  }
}
