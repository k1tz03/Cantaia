export { extractSubmissionTrackingCodes } from "./tracking-code";

export {
  detectPriceResponse,
  type PriceResponseMatch,
} from "./price-response-detector";

export {
  generatePortalToken,
  isValidPortalTokenFormat,
  buildPortalUrl,
} from "./portal-token";

export {
  buildPriceRequestEmail,
  buildReminderEmail,
  buildAwardEmail,
  buildRejectionEmail,
  renderItemsTable,
  renderPortalBlock,
  renderSignature,
  cleanDescriptionForSupplier,
  normalizeSupplierLanguage,
  formatSupplierDate,
  formatSupplierNumber,
  supplierStrings,
  escapeHtml,
  type SupplierLanguage,
  type TemplateItem,
  type PriceRequestEmailOptions,
  type ReminderEmailOptions,
  type AwardEmailOptions,
  type RejectionEmailOptions,
} from "./email-templates";
