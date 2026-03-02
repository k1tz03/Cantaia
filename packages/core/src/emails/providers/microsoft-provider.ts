// ============================================================
// Microsoft 365 / Outlook — Email Provider (Graph API)
// Wraps the existing graph-client.ts functions
// ============================================================

import {
  getEmails,
  getEmailsDelta,
  moveEmail as graphMoveEmail,
  createFolder,
  sendReply,
  getAttachments as graphGetAttachments,
  withRetry,
  type GraphEmailMessage,
} from "../../outlook/graph-client";
import type {
  EmailProvider,
  EmailConnection,
  RawEmail,
  EmailDraft,
  EmailAttachment,
} from "./email-provider.interface";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export class MicrosoftProvider implements EmailProvider {
  async fetchEmails(connection: EmailConnection, since?: Date): Promise<RawEmail[]> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    const sinceDate = since?.toISOString() || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const emails = await withRetry(() => getEmails(token, sinceDate));

    return emails.map((em: GraphEmailMessage) => ({
      externalId: em.id,
      from: em.from?.emailAddress?.address || "",
      fromName: em.from?.emailAddress?.name || undefined,
      to: (em.toRecipients || []).map((r) => r.emailAddress.address),
      cc: (em.ccRecipients || []).map((r) => r.emailAddress.address),
      subject: em.subject || "(Sans objet)",
      date: new Date(em.receivedDateTime),
      bodyText: em.bodyPreview || undefined,
      bodyHtml: em.body?.content || undefined,
      attachments: [],
      hasAttachments: em.hasAttachments || false,
      isRead: em.isRead,
    }));
  }

  async sendEmail(connection: EmailConnection, draft: EmailDraft): Promise<string> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    const response = await fetch(`${GRAPH_BASE_URL}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: draft.subject,
          body: { contentType: "HTML", content: draft.bodyHtml },
          toRecipients: draft.to.map((addr) => ({ emailAddress: { address: addr } })),
          ccRecipients: (draft.cc || []).map((addr) => ({ emailAddress: { address: addr } })),
        },
      }),
    });

    if (!response.ok) throw new Error(`Send failed: ${response.statusText}`);
    return "sent";
  }

  async replyToEmail(connection: EmailConnection, originalId: string, draft: EmailDraft): Promise<string> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    await withRetry(() => sendReply(token, originalId, draft.bodyHtml));
    return "replied";
  }

  async moveEmail(connection: EmailConnection, messageId: string, folderId: string): Promise<void> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    await withRetry(() => graphMoveEmail(token, messageId, folderId));
  }

  async createProjectFolder(connection: EmailConnection, projectName: string): Promise<string> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    const folder = await withRetry(() => createFolder(token, `Cantaia/${projectName}`));
    return folder.id;
  }

  async markAsRead(connection: EmailConnection, messageId: string): Promise<void> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isRead: true }),
    });
  }

  async testConnection(connection: EmailConnection): Promise<{ success: boolean; error?: string }> {
    const token = connection.oauth_access_token;
    if (!token) return { success: false, error: "No access token" };

    try {
      const response = await fetch(`${GRAPH_BASE_URL}/me`, {
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

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

    if (!clientId || !clientSecret) {
      throw new Error("Microsoft OAuth not configured");
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.oauth_refresh_token,
      scope: "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read",
    });

    const response = await fetch(tokenUrl, {
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
    if (!token) throw new Error("No Microsoft access token");

    const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}?$select=body`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch body: ${response.statusText}`);
    const data = await response.json();
    return {
      bodyHtml: data.body?.contentType === "html" ? data.body.content : undefined,
      bodyText: data.body?.contentType === "text" ? data.body.content : undefined,
    };
  }

  async fetchEmailsDelta(connection: EmailConnection): Promise<{
    emails: RawEmail[];
    deltaLink: string | null;
  }> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    const { messages, deltaLink } = await withRetry(() =>
      getEmailsDelta(token, connection.sync_delta_link)
    );

    const emails: RawEmail[] = messages.map((em: GraphEmailMessage) => ({
      externalId: em.id,
      conversationId: (em as unknown as Record<string, unknown>).conversationId as string | undefined,
      from: em.from?.emailAddress?.address || "",
      fromName: em.from?.emailAddress?.name || undefined,
      to: (em.toRecipients || []).map((r) => r.emailAddress.address),
      cc: (em.ccRecipients || []).map((r) => r.emailAddress.address),
      subject: em.subject || "(Sans objet)",
      date: new Date(em.receivedDateTime),
      bodyText: em.bodyPreview || undefined,
      bodyHtml: em.body?.content || undefined,
      attachments: [],
      hasAttachments: em.hasAttachments || false,
      isRead: em.isRead,
      importance: (em as unknown as Record<string, unknown>).importance as "low" | "normal" | "high" | undefined,
    }));

    return { emails, deltaLink };
  }

  async getAttachments(connection: EmailConnection, messageId: string): Promise<EmailAttachment[]> {
    const token = connection.oauth_access_token;
    if (!token) throw new Error("No Microsoft access token");

    const attachments = await withRetry(() => graphGetAttachments(token, messageId));
    return attachments.map((a) => ({
      id: a.id,
      filename: a.name,
      contentType: a.contentType,
      size: a.size,
      isInline: a.isInline,
      contentBytes: a.contentBytes,
    }));
  }
}
