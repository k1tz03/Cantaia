export type {
  EmailProvider,
  EmailConnection,
  RawEmail,
  EmailDraft,
  EmailAttachment,
} from "./email-provider.interface";

export { MicrosoftProvider } from "./microsoft-provider";
export { GmailProvider } from "./gmail-provider";
export { ImapProvider, KNOWN_PROVIDERS, encryptPassword, decryptPassword } from "./imap-provider";

import { MicrosoftProvider } from "./microsoft-provider";
import { GmailProvider } from "./gmail-provider";
import { ImapProvider } from "./imap-provider";
import type { EmailProvider } from "./email-provider.interface";

/** Factory: get the right provider for a connection type */
export function getEmailProvider(provider: string): EmailProvider {
  switch (provider) {
    case "microsoft":
      return new MicrosoftProvider();
    case "google":
      return new GmailProvider();
    case "imap":
      return new ImapProvider();
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}

/** Check if an OAuth token is expired (with 5-min buffer) */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expires = new Date(expiresAt).getTime();
  const buffer = 5 * 60 * 1000; // 5 minutes
  return Date.now() > expires - buffer;
}
