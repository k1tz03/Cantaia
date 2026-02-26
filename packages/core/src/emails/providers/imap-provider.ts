// ============================================================
// IMAP/SMTP — Generic Email Provider
// For Infomaniak, Hostpoint, OVH, Bluewin, private servers
// Requires: imapflow, nodemailer, mailparser at runtime
// ============================================================

import type {
  EmailProvider,
  EmailConnection,
  RawEmail,
  EmailDraft,
  EmailAttachment,
} from "./email-provider.interface";

/** Known Swiss/European IMAP/SMTP providers with pre-filled settings */
export const KNOWN_PROVIDERS: Record<string, {
  name: string;
  imap_host: string;
  imap_port: number;
  imap_security: "ssl" | "tls" | "none";
  smtp_host: string;
  smtp_port: number;
  smtp_security: "ssl" | "tls" | "none";
}> = {
  infomaniak: {
    name: "Infomaniak",
    imap_host: "mail.infomaniak.com",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "mail.infomaniak.com",
    smtp_port: 587,
    smtp_security: "tls",
  },
  hostpoint: {
    name: "Hostpoint",
    imap_host: "imap.hostpoint.ch",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "smtp.hostpoint.ch",
    smtp_port: 587,
    smtp_security: "tls",
  },
  ovh: {
    name: "OVH",
    imap_host: "ssl0.ovh.net",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "ssl0.ovh.net",
    smtp_port: 587,
    smtp_security: "tls",
  },
  bluewin: {
    name: "Swisscom (Bluewin)",
    imap_host: "imaps.bluewin.ch",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "smtpauths.bluewin.ch",
    smtp_port: 465,
    smtp_security: "ssl",
  },
};

// AES-256-CBC encryption for storing IMAP/SMTP passwords
import crypto from "crypto";

const IV_LENGTH = 16;

export function encryptPassword(text: string): string {
  const key = process.env.EMAIL_ENCRYPTION_KEY;
  if (!key) throw new Error("EMAIL_ENCRYPTION_KEY not set");

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptPassword(encrypted: string): string {
  const key = process.env.EMAIL_ENCRYPTION_KEY;
  if (!key) throw new Error("EMAIL_ENCRYPTION_KEY not set");

  const [ivHex, encryptedHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key, "hex"), iv);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * IMAP/SMTP provider for generic email servers.
 *
 * This provider dynamically imports imapflow and nodemailer at runtime.
 * Install them in the web app: `pnpm add imapflow nodemailer mailparser`
 */
export class ImapProvider implements EmailProvider {
  private async getImapClient(connection: EmailConnection) {
    // Dynamic import — these packages are installed in the web app, not in core
    const { ImapFlow } = await import("imapflow");

    const password = connection.imap_password_encrypted
      ? decryptPassword(connection.imap_password_encrypted)
      : "";

    return new ImapFlow({
      host: connection.imap_host || "",
      port: connection.imap_port || 993,
      secure: connection.imap_security === "ssl",
      auth: {
        user: connection.imap_username || "",
        pass: password,
      },
      logger: false,
    });
  }

  private async getSmtpTransporter(connection: EmailConnection) {
    const nodemailer = await import("nodemailer");

    const password = connection.smtp_password_encrypted
      ? decryptPassword(connection.smtp_password_encrypted)
      : "";

    return nodemailer.createTransport({
      host: connection.smtp_host || "",
      port: connection.smtp_port || 587,
      secure: connection.smtp_security === "ssl",
      auth: {
        user: connection.smtp_username || "",
        pass: password,
      },
    });
  }

  async fetchEmails(connection: EmailConnection, since?: Date): Promise<RawEmail[]> {
    const client = await this.getImapClient(connection);
    const { simpleParser } = await import("mailparser");

    await client.connect();
    const folder = connection.sync_folder || "INBOX";
    const lock = await client.getMailboxLock(folder);

    try {
      const results: RawEmail[] = [];
      const mailbox = client.mailbox;
      const mailboxExists = mailbox && typeof mailbox === "object" && "exists" in mailbox ? (mailbox as { exists: number }).exists : 50;
      const searchCriteria = since
        ? { since }
        : { seq: `${Math.max(1, mailboxExists - 49)}:*` };

      for await (const message of client.fetch(searchCriteria, {
        source: true,
        envelope: true,
        uid: true,
        flags: true,
      })) {
        try {
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);

          const attachments: EmailAttachment[] = (parsed.attachments || []).map((a, i) => ({
            id: `att_${message.uid}_${i}`,
            filename: a.filename || `attachment_${i}`,
            contentType: a.contentType,
            size: a.size,
            isInline: a.contentDisposition === "inline",
          }));

          results.push({
            externalId: String(message.uid),
            conversationId: parsed.messageId || undefined,
            from: parsed.from?.value[0]?.address || "",
            fromName: parsed.from?.value[0]?.name || undefined,
            to: (parsed.to && "value" in parsed.to ? parsed.to.value : []).map(
              (a) => a.address || ""
            ),
            cc: parsed.cc && "value" in parsed.cc
              ? parsed.cc.value.map((a) => a.address || "")
              : undefined,
            subject: parsed.subject || "(Sans objet)",
            date: parsed.date || new Date(),
            bodyText: parsed.text || undefined,
            bodyHtml: typeof parsed.html === "string" ? parsed.html : undefined,
            attachments,
            isRead: message.flags?.has("\\Seen") || false,
          });
        } catch (parseErr) {
          console.warn(`[imap] Failed to parse message UID ${message.uid}:`, parseErr);
        }
      }

      return results;
    } finally {
      lock.release();
      await client.logout();
    }
  }

  async sendEmail(connection: EmailConnection, draft: EmailDraft): Promise<string> {
    const transporter = await this.getSmtpTransporter(connection);

    const info = await transporter.sendMail({
      from: connection.display_name
        ? `${connection.display_name} <${connection.email_address}>`
        : connection.email_address,
      to: draft.to.join(", "),
      cc: draft.cc?.join(", "),
      subject: draft.subject,
      html: draft.bodyHtml,
      attachments: draft.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    return info.messageId;
  }

  async replyToEmail(connection: EmailConnection, _originalId: string, draft: EmailDraft): Promise<string> {
    // IMAP doesn't have a native "reply" concept — just send a new email
    // The In-Reply-To header should be set by the caller
    return this.sendEmail(connection, draft);
  }

  async moveEmail(connection: EmailConnection, uid: string, targetFolder: string): Promise<void> {
    const client = await this.getImapClient(connection);
    await client.connect();
    const lock = await client.getMailboxLock(connection.sync_folder || "INBOX");

    try {
      await client.messageMove(uid, targetFolder, { uid: true });
    } finally {
      lock.release();
      await client.logout();
    }
  }

  async createProjectFolder(connection: EmailConnection, projectName: string): Promise<string> {
    const client = await this.getImapClient(connection);
    await client.connect();

    const folderName = `Cantaia/${projectName}`;
    try {
      await client.mailboxCreate(folderName);
    } catch {
      // Folder might already exist
    }

    await client.logout();
    return folderName;
  }

  async markAsRead(connection: EmailConnection, uid: string): Promise<void> {
    const client = await this.getImapClient(connection);
    await client.connect();
    const lock = await client.getMailboxLock(connection.sync_folder || "INBOX");

    try {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
      await client.logout();
    }
  }

  async testConnection(connection: EmailConnection): Promise<{ success: boolean; error?: string; emailCount?: number }> {
    try {
      // Test IMAP
      const client = await this.getImapClient(connection);
      await client.connect();
      const mailbox = await client.mailboxOpen(connection.sync_folder || "INBOX");
      const emailCount = mailbox.exists || 0;
      await client.logout();

      // Test SMTP
      const transporter = await this.getSmtpTransporter(connection);
      await transporter.verify();

      return { success: true, emailCount };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  // No refreshToken for IMAP — passwords don't expire
}
