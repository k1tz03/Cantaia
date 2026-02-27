export { learnFromClassificationAction, checkLocalRules } from "./classification-learning";
export { detectSpamNewsletter, type SpamCheckResult } from "./spam-detector";
export { determineArchivePath, getDefaultFolderTree, buildArchiveFolderPrompt, type ArchiveEmailInput, type ArchivePathResult } from "./email-archiver";
export {
  getEmailProvider,
  isTokenExpired,
  MicrosoftProvider,
  GmailProvider,
  ImapProvider,
  KNOWN_PROVIDERS,
  encryptPassword,
  decryptPassword,
  type EmailProvider,
  type EmailConnection as EmailConnectionConfig,
  type RawEmail,
  type EmailDraft,
  type EmailAttachment,
} from "./providers";
