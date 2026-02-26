// ============================================================
// Email Provider Interface — Strategy Pattern
// Common interface for Microsoft, Google, IMAP providers
// ============================================================

export interface RawEmail {
  externalId: string;
  conversationId?: string;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  date: Date;
  bodyText?: string;
  bodyHtml?: string;
  attachments: EmailAttachment[];
  isRead: boolean;
  importance?: "low" | "normal" | "high";
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentBytes?: string; // base64
}

export interface EmailDraft {
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType: string;
  }>;
}

export interface EmailConnection {
  id: string;
  user_id: string;
  organization_id: string;
  provider: "microsoft" | "google" | "imap";
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string | null;
  imap_host: string | null;
  imap_port: number;
  imap_security: "ssl" | "tls" | "none";
  imap_username: string | null;
  imap_password_encrypted: string | null;
  smtp_host: string | null;
  smtp_port: number;
  smtp_security: "ssl" | "tls" | "none";
  smtp_username: string | null;
  smtp_password_encrypted: string | null;
  email_address: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  total_emails_synced: number;
  sync_folder: string;
}

export interface EmailProvider {
  /** Fetch new emails since a date */
  fetchEmails(connection: EmailConnection, since?: Date): Promise<RawEmail[]>;

  /** Send an email */
  sendEmail(connection: EmailConnection, draft: EmailDraft): Promise<string>;

  /** Reply to an email */
  replyToEmail(connection: EmailConnection, originalId: string, draft: EmailDraft): Promise<string>;

  /** Move an email to a folder/label */
  moveEmail(connection: EmailConnection, messageId: string, folderId: string): Promise<void>;

  /** Create a project folder/label */
  createProjectFolder(connection: EmailConnection, projectName: string): Promise<string>;

  /** Mark an email as read */
  markAsRead(connection: EmailConnection, messageId: string): Promise<void>;

  /** Test the connection */
  testConnection(connection: EmailConnection): Promise<{ success: boolean; error?: string }>;

  /** Refresh OAuth token (OAuth providers only) */
  refreshToken?(connection: EmailConnection): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;

  /** Get email body by ID */
  getEmailBody?(connection: EmailConnection, messageId: string): Promise<{ bodyHtml?: string; bodyText?: string }>;

  /** List attachments */
  getAttachments?(connection: EmailConnection, messageId: string): Promise<EmailAttachment[]>;
}
