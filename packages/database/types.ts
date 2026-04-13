// ============================================================
// Cantaia — Database TypeScript Types
// ============================================================
// Manually written to match the SQL schema.
// Will be auto-generated from Supabase in production.

// ---------- Enums ----------

export type UserRole =
  | "project_manager"
  | "site_manager"
  | "foreman"
  | "director"
  | "admin"
  | "superadmin";

export type SubscriptionPlan = "trial" | "starter" | "pro" | "enterprise";

export type ProjectStatus =
  | "planning"
  | "active"
  | "paused"
  | "on_hold"
  | "closing"
  | "completed"
  | "archived";

export type ReceptionType = "provisional" | "final" | "partial";

export type ReceptionStatus = "draft" | "scheduled" | "completed" | "signed";

export type ReserveSeverity = "minor" | "major" | "blocking";

export type ReserveStatus = "open" | "in_progress" | "corrected" | "verified" | "disputed";

export type ClosureDocumentType =
  | "pv_reception"
  | "pv_reserves_lifted"
  | "guarantee_certificate"
  | "final_invoice"
  | "as_built_plans"
  | "other";

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "waiting"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskSource = "email" | "meeting" | "manual" | "reserve";

export type MeetingStatus =
  | "scheduled"
  | "recording"
  | "transcribing"
  | "generating_pv"
  | "review"
  | "finalized"
  | "sent";

export type EmailClassification =
  | "action_required"
  | "info_only"
  | "urgent"
  | "waiting_response"
  | "archived";

export type EmailClassificationStatus =
  | "unprocessed"
  | "auto_classified"
  | "suggested"
  | "new_project_suggested"
  | "classified_no_project"
  | "confirmed"
  | "rejected";

export type EmailCategoryType =
  | "project"
  | "personal"
  | "administrative"
  | "spam"
  | "newsletter";

/** @deprecated Use EmailCategoryType */
export type EmailCategory = EmailCategoryType;

export type ClassificationRuleType = "sender_domain" | "sender_email" | "subject_keyword" | "contact_match";

export interface EmailClassificationRule {
  id: string;
  organization_id: string;
  rule_type: ClassificationRuleType;
  rule_value: string;
  project_id: string | null;
  category_id: string | null;
  classification: string | null;
  times_confirmed: number;
  times_overridden: number;
  confidence_boost: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SuggestedProjectData {
  name: string;
  reference: string | null;
  client: string | null;
  location: string | null;
  type: string | null;
  extracted_contacts: {
    name: string;
    company: string | null;
    email: string;
    role: string | null;
  }[];
}

// ---------- Mail Module Enums ----------

export type TriageStatus = "unprocessed" | "processed" | "snoozed" | "pending_classification";

export type ProcessAction =
  | "read_ok"
  | "replied"
  | "task_created"
  | "forwarded"
  | "offer_imported"
  | "plan_registered"
  | "snoozed"
  | "auto_dismissed"
  | "dismissed";

export type EmailProvider = "graph" | "imap";

export type EmailImportance = "low" | "normal" | "high";

export type LogLevel = "info" | "warning" | "error" | "critical";

export type ApiActionType =
  | "email_classify"
  | "email_summary"
  | "email_reply"
  | "task_extract"
  | "pv_transcribe"
  | "pv_generate"
  | "reclassify"
  | "plan_detect"
  | "plan_version_check"
  | "plan_analyze"
  | "submission_parse"
  | "offer_parse"
  | "supplier_match"
  | "negotiation_email"
  | "chat_message"
  | "price_estimate"
  | "price_extract"
  | "supplier_enrichment"
  | "supplier_search"
  | "agent_submission-analyzer"
  | "agent_plan-estimator"
  | "agent_email-classifier"
  | "agent_price-extractor"
  | "agent_briefing-generator"
  | "agent_email-drafter"
  | "agent_followup-engine"
  | "agent_supplier-monitor"
  | "agent_project-memory"
  | "agent_meeting-prep"
  | "calendar_ai_command"
  | "calendar_sync";

export type PlanType =
  | "execution"
  | "detail"
  | "principle"
  | "as_built"
  | "shop_drawing"
  | "schema";

export type PlanDiscipline =
  | "architecture"
  | "structure"
  | "cvcs"
  | "electricite"
  | "sanitaire"
  | "facades"
  | "amenagement";

export type PlanStatus =
  | "active"
  | "superseded"
  | "withdrawn"
  | "for_approval"
  | "approved"
  | "rejected";

export type PlanValidationStatus = "pending" | "approved" | "rejected" | "for_info";

export type PlanAlertType =
  | "outdated_reference"
  | "missing_distribution"
  | "approval_pending"
  | "version_conflict";

export type PlanAlertSeverity = "info" | "warning" | "critical";

export type PlanAlertStatus = "open" | "acknowledged" | "resolved" | "false_positive";

export type PlanSource = "email" | "upload" | "sync";

export type ApiProvider = "anthropic" | "openai_whisper" | "microsoft_graph";

// ---------- Submissions & Pricing Enums ----------

export type SupplierStatus = "active" | "preferred" | "blacklisted" | "inactive" | "new";

export type SupplierType = "fournisseur" | "prestataire";

export type SubmissionStatus =
  | "draft"
  | "parsed"
  | "requesting"
  | "offers_received"
  | "comparing"
  | "negotiating"
  | "awarded"
  | "archived";

export type SubmissionSourceType = "upload" | "email" | "manual" | "paste";

export type SubmissionLotStatus = "open" | "requesting" | "received" | "comparing" | "awarded";

export type PriceRequestStatus = "draft" | "sent" | "opened" | "responded" | "expired" | "cancelled";

export type SupplierOfferStatus = "received" | "parsed" | "validated" | "rejected" | "awarded" | "negotiating";

export type OfferLineItemStatus = "proposed" | "retained" | "invoiced";

export type PricingAlertType =
  | "price_higher"
  | "price_lower"
  | "trend_up"
  | "trend_down"
  | "anomaly"
  | "opportunity"
  | "supplier_drift";

export type PricingAlertSeverity = "info" | "warning" | "critical";

export type PricingAlertStatus = "active" | "acknowledged" | "resolved" | "dismissed";

export type EmailTemplateType =
  | "price_request"
  | "reminder_1"
  | "reminder_2"
  | "reminder_3"
  | "negotiation"
  | "award"
  | "rejection";

// ---------- Table Row Types ----------

export type OrganizationStatus = "setup" | "trial" | "active" | "suspended";

export type OrganizationPlan = "trial" | "starter" | "pro" | "enterprise";

export type InviteStatus = "pending" | "accepted" | "expired" | "cancelled";

export type InviteRole = "admin" | "member";

export interface OrganizationBranding {
  logo_url?: string;
  favicon_url?: string;
  login_bg_url?: string;
  login_message?: string;
  color_primary?: string;
  color_secondary?: string;
  color_sidebar_bg?: string;
  color_sidebar_text?: string;
  theme?: "light" | "dark" | "auto";
}

export interface Organization {
  id: string;
  name: string;
  display_name: string | null;
  address: string | null;
  city: string;
  country: string;
  phone: string | null;
  website: string | null;
  industry: string;
  subscription_plan: SubscriptionPlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  max_users: number;
  max_projects: number;
  is_active: boolean;
  // Super-admin managed fields
  subdomain: string | null;
  custom_domain: string | null;
  status: OrganizationStatus;
  plan: OrganizationPlan;
  branding: OrganizationBranding;
  settings: Record<string, unknown>;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Legacy branding fields (white-labeling, kept for backward compat)
  logo_url: string | null;
  logo_dark_url: string | null;
  primary_color: string;
  secondary_color: string;
  sidebar_color: string;
  accent_color: string;
  custom_name: string | null;
  favicon_url: string | null;
  branding_enabled: boolean;
}

export interface OrganizationInvite {
  id: string;
  organization_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: InviteRole;
  job_title: string | null;
  token: string;
  message: string | null;
  invited_by: string | null;
  status: InviteStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface User {
  id: string;
  organization_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
  preferred_language: "fr" | "en" | "de";
  microsoft_access_token: string | null;
  microsoft_refresh_token: string | null;
  microsoft_token_expires_at: string | null;
  outlook_sync_enabled: boolean;
  last_sync_at: string | null;
  notification_preferences: {
    email: boolean;
    push: boolean;
    desktop: boolean;
  };
  // Briefing preferences
  briefing_enabled: boolean;
  briefing_time: string; // HH:MM format
  briefing_email: boolean;
  briefing_projects: string[]; // project IDs, empty = all
  auth_provider: string;
  auth_provider_id: string | null;
  is_superadmin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  status: "active" | "error" | "expired" | "disconnected";
  last_error: string | null;
  last_sync_at: string | null;
  total_emails_synced: number;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  sync_folder: string;
  sync_since: string | null;
  sync_delta_link: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  code: string | null;
  description: string | null;
  client_name: string | null;
  address: string | null;
  city: string;
  status: ProjectStatus;
  email_keywords: string[];
  email_senders: string[];
  start_date: string | null;
  end_date: string | null;
  budget_total: number | null;
  currency: string;
  color: string;
  archived_at: string | null;
  archive_path: string | null;
  archive_enabled: boolean;
  archive_structure: ArchiveStructure;
  archive_filename_format: ArchiveFilenameFormat;
  archive_attachments_mode: ArchiveAttachmentsMode;
  created_at: string;
  updated_at: string;
}

export type ArchiveStructure = "by_category" | "by_date" | "by_sender" | "flat";
export type ArchiveFilenameFormat = "date_sender_subject" | "date_subject" | "original";
export type ArchiveAttachmentsMode = "subfolder" | "beside" | "thematic";

export interface EmailArchive {
  id: string;
  email_id: string;
  project_id: string;
  organization_id: string;
  local_path: string;
  folder_name: string | null;
  file_name: string;
  attachments_saved: { name: string; local_path: string; size: number; storage_path?: string }[];
  status: "pending" | "saved" | "failed" | "skipped";
  error_message: string | null;
  archived_at: string | null;
  created_at: string;
  // Storage columns (migration 072)
  storage_path: string | null;
  storage_bucket: string;
  file_size: number;
}

// ---------- Mail Module Tables ----------

export interface EmailCategoryRecord {
  id: string;
  organization_id: string;
  name: string;
  name_en: string | null;
  name_de: string | null;
  icon: string;
  color: string;
  sort_order: number;
  is_project: boolean;
  project_id: string | null;
  unprocessed_count: number;
  total_count: number;
  is_system: boolean;
  auto_dismiss: boolean;
  created_at: string;
  updated_at: string;
}

export interface OutlookFolder {
  id: string;
  category_id: string | null;
  organization_id: string;
  user_id: string;
  outlook_folder_id: string;
  folder_name: string;
  parent_folder_id: string | null;
  email_count: number;
  created_at: string;
}

export interface EmailPreferences {
  id: string;
  user_id: string;
  organization_id: string | null;
  auto_move_outlook: boolean;
  auto_dismiss_spam: boolean;
  auto_dismiss_newsletters: boolean;
  show_dismissed: boolean;
  outlook_root_folder_name: string;
  outlook_root_folder_id: string | null;
  default_snooze_hours: number;
  archive_enabled: boolean;
  archive_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: "owner" | "member" | "viewer";
  added_at: string;
}

export interface Email {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  user_id: string;

  // Provider identifiers
  provider_message_id: string | null;
  provider_thread_id: string | null;
  provider: EmailProvider;

  // Legacy fields (kept for backward compat with existing data)
  outlook_message_id: string;
  sender_email: string;
  sender_name: string | null;
  recipients: string[];

  // New content fields
  from_email: string | null;
  from_name: string | null;
  to_emails: { email: string; name?: string }[];
  cc_emails: { email: string; name?: string }[];
  bcc_emails: { email: string; name?: string }[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
  body_preview: string | null;

  // Attachments
  has_attachments: boolean;
  attachments: { name: string; size: number; contentType: string; storageUrl?: string }[];

  // Dates
  received_at: string;
  sent_at: string | null;

  // Provider status
  is_read_provider: boolean;
  importance: EmailImportance;

  // Classification IA (legacy fields kept)
  classification: EmailClassification | null;
  ai_classification_confidence: number | null;
  ai_project_match_confidence: number | null;
  ai_summary: string | null;
  classification_status: EmailClassificationStatus;
  email_category: EmailCategoryType | null;
  suggested_project_data: SuggestedProjectData | null;
  ai_reasoning: string | null;
  is_processed: boolean;

  // New classification fields
  category_id: string | null;
  ai_confidence: number;
  ai_suggested_project_id: string | null;
  ai_suggested_category: string | null;
  ai_suggested_new_project: SuggestedProjectData | null;
  ai_detected_content: {
    has_plan?: boolean;
    has_offer?: boolean;
    has_invoice?: boolean;
    has_meeting_reference?: boolean;
    urgency?: string;
    suggested_actions?: string[];
    detected_deadline?: string | null;
  } | null;

  // Triage
  triage_status: TriageStatus;
  process_action: ProcessAction | null;
  processed_at: string | null;
  processed_by: string | null;
  snooze_until: string | null;

  // Archiving
  archived_path: string | null;
  outlook_folder_moved: string | null;

  // Price request linking
  linked_price_request_id: string | null;

  created_at: string;
  updated_at: string | null;
}

/** @deprecated Use Email */
export type EmailRecord = Email;

export interface TaskComment {
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
}

export interface TaskHistoryEntry {
  action: string;
  user_name: string;
  field?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export interface TaskAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface Task {
  id: string;
  project_id: string;
  created_by: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_company: string | null;
  assigned_user_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  source_id: string | null;
  source_reference: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  reminder: "none" | "1_day" | "3_days" | "1_week";
  reminder_sent: boolean;
  lot_code: string | null;
  lot_id: string | null;
  lot_name: string | null;
  cfc_code: string | null;
  comments: TaskComment[];
  history: TaskHistoryEntry[];
  attachments: TaskAttachment[];
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  project_id: string;
  created_by: string;
  title: string;
  meeting_number: number | null;
  meeting_date: string;
  location: string | null;
  planned_duration_minutes: number | null;
  status: MeetingStatus;
  agenda: string[];
  audio_url: string | null;
  audio_duration_seconds: number | null;
  audio_file_size_bytes: number | null;
  audio_retention_until: string | null;
  audio_retained: boolean;
  transcription_raw: string | null;
  transcript_text: string | null;
  transcription_language: string;
  pv_content: PVContent | null;
  pv_document_url: string | null;
  pv_version: number;
  participants: MeetingParticipant[];
  sent_to: string[];
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingParticipant {
  name: string;
  company: string;
  role: string;
  email: string | null;
  present: boolean;
}

export interface PVContent {
  header: {
    project_name: string;
    project_code: string;
    meeting_number: number;
    date: string;
    location: string;
    next_meeting_date: string | null;
    participants: MeetingParticipant[];
    absent: Array<{ name: string; company: string; excused: boolean }>;
    distribution: string[];
  };
  sections: Array<{
    number: string;
    title: string;
    content: string;
    decisions: string[];
    actions: Array<{
      description: string;
      responsible_name: string;
      responsible_company: string;
      deadline: string | null;
      priority: "normal" | "urgent";
    }>;
  }>;
  next_steps: string[];
  summary_fr: string;
}

// ---------- Project Closure & Reception ----------

export interface ReceptionParticipant {
  name: string;
  role: string;
  company: string;
  present: boolean;
  signed: boolean;
}

export interface LotReception {
  lot_id: string | null;
  lot_name: string;
  cfc_code: string;
  company: string;
  contract_amount: number;
  final_amount: number;
  status: "accepted" | "reserves" | "refused";
  notes: string;
}

export interface ProjectReception {
  id: string;
  project_id: string;
  organization_id: string;
  reception_type: ReceptionType;
  reception_date: string | null;
  reception_location: string | null;
  status: ReceptionStatus;
  participants: ReceptionParticipant[];
  pv_document_url: string | null;
  pv_signed_url: string | null;
  pv_signed_at: string | null;
  pv_signed_verified: boolean;
  lots_reception: LotReception[];
  guarantee_2y_end: string | null;
  guarantee_5y_end: string | null;
  guarantee_visit_2y_scheduled: boolean;
  guarantee_visit_5y_scheduled: boolean;
  general_notes: string | null;
  legal_clause: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceptionReserve {
  id: string;
  reception_id: string;
  project_id: string;
  organization_id: string;
  description: string;
  location: string | null;
  lot_id: string | null;
  lot_name: string | null;
  cfc_code: string | null;
  responsible_company: string | null;
  severity: ReserveSeverity;
  deadline: string | null;
  status: ReserveStatus;
  corrected_at: string | null;
  corrected_by: string | null;
  correction_notes: string | null;
  correction_photo_urls: string[];
  verified_at: string | null;
  verified_by: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClosureDocument {
  id: string;
  project_id: string;
  reception_id: string | null;
  organization_id: string;
  document_type: ClosureDocumentType;
  document_name: string;
  document_url: string;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
}

export interface DailyBriefing {
  id: string;
  user_id: string;
  briefing_date: string;
  content: BriefingContent;
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface BriefingContent {
  mode: "ai" | "fallback";
  greeting: string;
  priority_alerts: string[];
  projects: Array<{
    project_id: string;
    name: string;
    status_emoji: string;
    summary: string;
    action_items: string[];
  }>;
  meetings_today: Array<{
    time: string;
    project: string;
    title: string;
  }>;
  submission_deadlines?: Array<{
    title: string;
    deadline: string;
    days_remaining: number;
    project: string;
    note: string;
  }>;
  stats: {
    total_projects: number;
    emails_unread: number;
    emails_action_required: number;
    tasks_overdue: number;
    tasks_due_today: number;
    meetings_today: number;
  };
  global_summary: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface AppLog {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  level: LogLevel;
  source: string;
  message: string;
  details: Record<string, unknown>;
  client_type: string | null;
  client_version: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  event_type: string;
  metadata: Record<string, unknown>;
  client_type: string | null;
  created_at: string;
}

export interface Lot {
  id: string;
  project_id: string;
  cfc_code: string;
  name: string;
  contractor_name: string | null;
  contractor_email: string | null;
  budget_soumission: number | null;
  budget_avenant: number;
  amount_invoiced: number;
  advancement_percent: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  project_id: string | null;
  sender_id: string;
  content: string;
  reply_to: string | null;
  attachments: unknown[];
  is_edited: boolean;
  created_at: string;
}

export interface ApiUsageLog {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  action_type: ApiActionType;
  api_provider: ApiProvider;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  audio_seconds: number;
  estimated_cost_chf: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------- Admin System Tables ----------

export type AdminActionType =
  | "login"
  | "logout"
  | "sync_emails"
  | "classify_email"
  | "generate_reply"
  | "send_reply"
  | "generate_pv"
  | "transcribe_audio"
  | "export_pv"
  | "send_pv"
  | "finalize_pv"
  | "create_task"
  | "complete_task"
  | "update_task"
  | "create_project"
  | "update_project"
  | "archive_project"
  | "generate_briefing"
  | "view_briefing"
  | "admin_login"
  | "change_plan"
  | "suspend_org";

export interface AdminActivityLog {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  action: AdminActionType;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AdminDailyMetrics {
  id: string;
  metric_date: string;
  total_users: number;
  active_users_today: number;
  new_users_today: number;
  total_organizations: number;
  active_organizations_today: number;
  emails_synced: number;
  emails_classified: number;
  replies_generated: number;
  tasks_created: number;
  pv_generated: number;
  pv_transcribed: number;
  briefings_generated: number;
  total_api_cost_chf: number;
  anthropic_cost_chf: number;
  openai_cost_chf: number;
  total_revenue_chf: number;
  created_at: string;
}

export interface AdminConfig {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

// ---------- Plan Registry ----------

export interface PlanRegistry {
  id: string;
  project_id: string;
  organization_id: string;
  plan_number: string;
  plan_title: string;
  plan_type: PlanType;
  discipline: PlanDiscipline | null;
  lot_id: string | null;
  lot_name: string | null;
  cfc_code: string | null;
  zone: string | null;
  scale: string | null;
  format: string | null;
  author_company: string | null;
  author_name: string | null;
  author_email: string | null;
  status: PlanStatus;
  is_current_version: boolean;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface PlanDistributionRecipient {
  name: string;
  company: string;
  email: string;
  sent_at: string | null;
}

export interface PlanVersion {
  id: string;
  plan_id: string;
  project_id: string;
  organization_id: string;
  version_code: string;
  version_number: number;
  version_date: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  thumbnail_url: string | null;
  source: PlanSource;
  source_email_id: string | null;
  received_at: string;
  ai_detected: boolean;
  ai_confidence: number | null;
  ai_changes_detected: string | null;
  validated_by: string | null;
  validated_at: string | null;
  validation_status: PlanValidationStatus;
  validation_notes: string | null;
  distributed_to: PlanDistributionRecipient[];
  distribution_date: string | null;
  is_current: boolean;
  superseded_by: string | null;
  created_at: string;
}

export interface PlanVersionAlert {
  id: string;
  plan_id: string;
  plan_version_id: string | null;
  current_version_id: string | null;
  project_id: string;
  organization_id: string;
  alert_type: PlanAlertType;
  severity: PlanAlertSeverity;
  detected_in: string | null;
  detected_in_id: string | null;
  detected_context: string | null;
  who_used_outdated: string | null;
  status: PlanAlertStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
}

// ---------- Plan Estimates (Chiffrage) ----------

export type MarginLevel = "tight" | "standard" | "comfortable" | "custom";
export type EstimateScope = "general" | "line_by_line";
export type EstimateSource = "db_historical" | "ai_knowledge" | "manual";

export interface EstimateConfig {
  hourly_rate: number;
  site_location: string;
  departure_location: string;
  margin_level: MarginLevel;
  custom_margin_percent?: number;
  scope: EstimateScope;
  exclusions: string[];
  precision_context?: string;
}

export interface EstimatedLineItem {
  category: string;
  item: string;
  quantity: number | null;
  unit: string;
  unit_price: number;
  total_price: number;
  confidence: "high" | "medium" | "low";
  source: EstimateSource;
  source_detail: string;
  db_matches: number;
  price_range?: { min: number; max: number; median: number };
  cfc_code?: string;
  margin_applied: number;
}

export interface EstimateResult {
  line_items: EstimatedLineItem[];
  subtotal: number;
  margin_total: number;
  transport_cost: number;
  installation_cost: number;
  grand_total: number;
  currency: "CHF";
  confidence_summary: { high: number; medium: number; low: number };
  db_coverage_percent: number;
  generated_at: string;
  config_used: EstimateConfig;
}

export interface PlanEstimate {
  id: string;
  plan_id: string;
  plan_analysis_id: string;
  project_id: string;
  organization_id: string;
  config: EstimateConfig;
  estimate_result: EstimateResult;
  subtotal: number | null;
  margin_total: number | null;
  transport_cost: number | null;
  grand_total: number | null;
  currency: string;
  db_coverage_percent: number | null;
  confidence_summary: { high: number; medium: number; low: number } | null;
  items_count: number;
  status: "completed" | "draft" | "error";
  estimated_by: string | null;
  estimated_at: string;
  created_at: string;
}

// ---------- Price Extraction Jobs ----------

export type PriceExtractionJobStatus = "pending" | "scanning" | "extracting" | "preview_ready" | "importing" | "completed" | "failed" | "cancelled";

export interface PriceExtractionJob {
  id: string;
  organization_id: string;
  user_id: string;
  project_id: string | null;
  email_filter: Record<string, unknown>;
  status: PriceExtractionJobStatus;
  total_emails: number;
  scanned_emails: number;
  emails_with_prices: number;
  extracted_items: number;
  imported_items: number;
  extraction_results: unknown[];
  errors: unknown[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Submissions & Pricing Intelligence ----------

export interface Supplier {
  id: string;
  organization_id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  website: string | null;
  specialties: string[];
  cfc_codes: string[];
  geo_zone: string | null;
  languages: string[];
  certifications: string[];
  response_rate: number;
  avg_response_days: number;
  price_competitiveness: number;
  reliability_score: number;
  manual_rating: number;
  overall_score: number;
  status: SupplierStatus;
  supplier_type: SupplierType;
  tags: string[];
  notes: string | null;
  total_requests_sent: number;
  total_offers_received: number;
  total_projects_involved: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Submission {
  id: string;
  project_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  reference: string | null;
  source_type: SubmissionSourceType;
  source_file_url: string | null;
  source_file_name: string | null;
  source_email_id: string | null;
  client_name: string | null;
  architect_name: string | null;
  engineer_name: string | null;
  project_location: string | null;
  status: SubmissionStatus;
  deadline: string | null;
  award_date: string | null;
  ai_parsed: boolean;
  ai_confidence: number | null;
  ai_parsed_at: string | null;
  estimated_total: number;
  best_offer_total: number | null;
  awarded_total: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SubmissionLot {
  id: string;
  submission_id: string;
  project_id: string;
  organization_id: string;
  cfc_code: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  status: SubmissionLotStatus;
  awarded_supplier_id: string | null;
  created_at: string;
}

export interface SubmissionChapter {
  id: string;
  lot_id: string;
  submission_id: string;
  organization_id: string;
  code: string | null;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface SubmissionItem {
  id: string;
  chapter_id: string;
  lot_id: string;
  submission_id: string;
  organization_id: string;
  code: string | null;
  description: string;
  unit: string;
  quantity: number | null;
  remarks: string | null;
  sort_order: number;
  estimated_unit_price: number | null;
  estimated_confidence: number | null;
  estimation_source: string | null;
  best_unit_price: number | null;
  best_supplier_id: string | null;
  awarded_unit_price: number | null;
  awarded_supplier_id: string | null;
  normalized_description: string | null;
  cfc_subcode: string | null;
  created_at: string;
}

export interface PriceRequest {
  id: string;
  submission_id: string;
  supplier_id: string;
  organization_id: string;
  project_id: string;
  lot_ids: string[];
  email_subject: string | null;
  email_body: string | null;
  email_language: string;
  template_used: string | null;
  attachment_url: string | null;
  sent_at: string | null;
  sent_via: string | null;
  outlook_message_id: string | null;
  opened_at: string | null;
  status: PriceRequestStatus;
  reminder_count: number;
  last_reminder_at: string | null;
  next_reminder_at: string | null;
  reminder_enabled: boolean;
  deadline: string | null;
  portal_token: string | null;
  portal_token_expires_at: string | null;
  tracking_code: string | null;
  created_at: string;
  created_by: string | null;
}

export interface SupplierOffer {
  id: string;
  price_request_id: string;
  supplier_id: string;
  submission_id: string;
  project_id: string;
  organization_id: string;
  received_at: string;
  source_type: string;
  source_file_url: string | null;
  source_file_name: string | null;
  source_email_id: string | null;
  total_amount: number | null;
  currency: string;
  vat_included: boolean;
  vat_rate: number;
  validity_days: number;
  validity_date: string | null;
  payment_terms: string | null;
  delivery_included: boolean | null;
  discount_percent: number | null;
  conditions_text: string | null;
  negotiation_round: number;
  is_final: boolean;
  ai_parsed: boolean;
  ai_confidence: number | null;
  status: SupplierOfferStatus;
  created_at: string;
}

export interface OfferLineItem {
  id: string;
  offer_id: string;
  submission_item_id: string;
  supplier_id: string;
  project_id: string;
  organization_id: string;
  unit_price: number;
  total_price: number | null;
  currency: string;
  match_confidence: number | null;
  supplier_description: string | null;
  supplier_quantity: number | null;
  supplier_unit: string | null;
  normalized_description: string | null;
  cfc_subcode: string | null;
  unit_normalized: string | null;
  vs_average_percent: number | null;
  vs_best_percent: number | null;
  is_cheapest: boolean;
  is_anomaly: boolean;
  anomaly_reason: string | null;
  supplier_remarks: string | null;
  status: OfferLineItemStatus;
  created_at: string;
}

export interface PricingAlert {
  id: string;
  organization_id: string;
  project_id: string | null;
  submission_id: string | null;
  supplier_id: string | null;
  alert_type: PricingAlertType;
  severity: PricingAlertSeverity;
  title: string;
  message: string;
  item_description: string | null;
  cfc_code: string | null;
  current_price: number | null;
  reference_price: number | null;
  difference_percent: number | null;
  reference_project_name: string | null;
  reference_date: string | null;
  financial_impact: number | null;
  suggested_action: string | null;
  action_url: string | null;
  status: PricingAlertStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface Negotiation {
  id: string;
  offer_id: string;
  supplier_id: string;
  submission_id: string;
  organization_id: string;
  round: number;
  previous_total: number | null;
  new_total: number | null;
  reduction_percent: number | null;
  email_sent: boolean;
  email_subject: string | null;
  email_body: string | null;
  sent_at: string | null;
  response_received: boolean;
  response_at: string | null;
  response_notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface EmailTemplate {
  id: string;
  organization_id: string;
  name: string;
  type: EmailTemplateType;
  language: string;
  subject_template: string;
  body_template: string;
  tone: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ---------- Helpers ----------

// Convert interface to plain object type (interfaces don't satisfy Record<string, unknown>
// which Supabase's GenericTable requires)
type Simplify<T> = { [K in keyof T]: T[K] };

type WithOptionalDefaults<T, K extends keyof T> = Simplify<
  Omit<T, K> & Partial<Pick<T, K>>
>;

// ---------- Insert Types (auto-generated fields optional) ----------

export type OrganizationInsert = WithOptionalDefaults<
  Organization,
  "id" | "display_name" | "address" | "city" | "country" | "phone" | "website" | "industry" | "stripe_customer_id" | "stripe_subscription_id" | "trial_ends_at" | "is_active" | "subdomain" | "custom_domain" | "status" | "plan" | "branding" | "settings" | "notes" | "created_by" | "created_at" | "updated_at" | "logo_url" | "logo_dark_url" | "primary_color" | "secondary_color" | "sidebar_color" | "accent_color" | "custom_name" | "favicon_url" | "branding_enabled"
>;

export type OrganizationInviteInsert = WithOptionalDefaults<
  OrganizationInvite,
  "id" | "first_name" | "last_name" | "role" | "job_title" | "message" | "invited_by" | "status" | "expires_at" | "accepted_at" | "created_at"
>;

export type UserInsert = WithOptionalDefaults<
  User,
  "avatar_url" | "phone" | "microsoft_access_token" | "microsoft_refresh_token" | "microsoft_token_expires_at" | "outlook_sync_enabled" | "last_sync_at" | "notification_preferences" | "briefing_enabled" | "briefing_time" | "briefing_email" | "briefing_projects" | "auth_provider" | "auth_provider_id" | "is_superadmin" | "is_active" | "created_at" | "updated_at"
>;

export type EmailConnectionInsert = WithOptionalDefaults<
  EmailConnection,
  "id" | "oauth_access_token" | "oauth_refresh_token" | "oauth_token_expires_at" | "oauth_scopes" | "imap_host" | "imap_port" | "imap_security" | "imap_username" | "imap_password_encrypted" | "smtp_host" | "smtp_port" | "smtp_security" | "smtp_username" | "smtp_password_encrypted" | "display_name" | "status" | "last_error" | "last_sync_at" | "total_emails_synced" | "sync_enabled" | "sync_interval_minutes" | "sync_folder" | "sync_since" | "sync_delta_link" | "created_at" | "updated_at"
>;

export type ProjectInsert = WithOptionalDefaults<
  Project,
  "id" | "code" | "description" | "client_name" | "address" | "city" | "status" | "email_keywords" | "email_senders" | "start_date" | "end_date" | "budget_total" | "currency" | "color" | "archived_at" | "archive_path" | "archive_enabled" | "archive_structure" | "archive_filename_format" | "archive_attachments_mode" | "created_at" | "updated_at"
>;

export type ProjectMemberInsert = WithOptionalDefaults<
  ProjectMember,
  "id" | "added_at"
>;

export type EmailInsert = WithOptionalDefaults<
  Email,
  "id" | "organization_id" | "project_id" | "provider_message_id" | "provider_thread_id" | "provider" | "sender_name" | "from_email" | "from_name" | "to_emails" | "cc_emails" | "bcc_emails" | "body_text" | "body_html" | "body_preview" | "has_attachments" | "attachments" | "sent_at" | "is_read_provider" | "importance" | "classification" | "ai_classification_confidence" | "ai_project_match_confidence" | "ai_summary" | "classification_status" | "email_category" | "suggested_project_data" | "ai_reasoning" | "is_processed" | "category_id" | "ai_confidence" | "ai_suggested_project_id" | "ai_suggested_category" | "ai_suggested_new_project" | "ai_detected_content" | "triage_status" | "process_action" | "processed_at" | "processed_by" | "snooze_until" | "archived_path" | "outlook_folder_moved" | "created_at" | "updated_at"
>;

/** @deprecated Use EmailInsert */
export type EmailRecordInsert = EmailInsert;

export type EmailCategoryRecordInsert = WithOptionalDefaults<
  EmailCategoryRecord,
  "id" | "name_en" | "name_de" | "icon" | "color" | "sort_order" | "is_project" | "project_id" | "unprocessed_count" | "total_count" | "is_system" | "auto_dismiss" | "created_at" | "updated_at"
>;

export type OutlookFolderInsert = WithOptionalDefaults<
  OutlookFolder,
  "id" | "category_id" | "parent_folder_id" | "email_count" | "created_at"
>;

export type EmailPreferencesInsert = WithOptionalDefaults<
  EmailPreferences,
  "id" | "organization_id" | "auto_move_outlook" | "auto_dismiss_spam" | "auto_dismiss_newsletters" | "show_dismissed" | "outlook_root_folder_name" | "outlook_root_folder_id" | "default_snooze_hours" | "archive_enabled" | "archive_path" | "created_at" | "updated_at"
>;

export type TaskInsert = WithOptionalDefaults<
  Task,
  "id" | "created_by" | "assigned_to" | "assigned_to_name" | "assigned_to_company" | "assigned_user_id" | "description" | "status" | "priority" | "source_id" | "source_reference" | "due_date" | "completed_at" | "completed_by" | "reminder" | "reminder_sent" | "lot_code" | "lot_id" | "lot_name" | "cfc_code" | "comments" | "history" | "attachments" | "created_at" | "updated_at"
>;

export type MeetingInsert = WithOptionalDefaults<
  Meeting,
  "id" | "meeting_number" | "location" | "status" | "audio_url" | "audio_duration_seconds" | "transcription_raw" | "transcription_language" | "pv_content" | "pv_document_url" | "pv_version" | "participants" | "sent_to" | "sent_at" | "created_at" | "updated_at"
>;

export type ProjectReceptionInsert = WithOptionalDefaults<
  ProjectReception,
  "id" | "reception_date" | "reception_location" | "status" | "participants" | "pv_document_url" | "pv_signed_url" | "pv_signed_at" | "pv_signed_verified" | "lots_reception" | "guarantee_2y_end" | "guarantee_5y_end" | "guarantee_visit_2y_scheduled" | "guarantee_visit_5y_scheduled" | "general_notes" | "legal_clause" | "created_by" | "created_at" | "updated_at"
>;

export type ReceptionReserveInsert = WithOptionalDefaults<
  ReceptionReserve,
  "id" | "location" | "lot_id" | "lot_name" | "cfc_code" | "responsible_company" | "severity" | "deadline" | "status" | "corrected_at" | "corrected_by" | "correction_notes" | "correction_photo_urls" | "verified_at" | "verified_by" | "task_id" | "created_at" | "updated_at"
>;

export type ClosureDocumentInsert = WithOptionalDefaults<
  ClosureDocument,
  "id" | "reception_id" | "uploaded_by" | "uploaded_at" | "notes"
>;

export type DailyBriefingInsert = WithOptionalDefaults<
  DailyBriefing,
  "id" | "is_sent" | "sent_at" | "created_at"
>;

export type NotificationInsert = WithOptionalDefaults<
  Notification,
  "id" | "data" | "is_read" | "created_at"
>;

export type AppLogInsert = WithOptionalDefaults<
  AppLog,
  "id" | "user_id" | "organization_id" | "details" | "client_type" | "client_version" | "ip_address" | "created_at"
>;

export type UsageEventInsert = WithOptionalDefaults<
  UsageEvent,
  "id" | "user_id" | "organization_id" | "metadata" | "client_type" | "created_at"
>;

export type LotInsert = WithOptionalDefaults<
  Lot,
  "id" | "contractor_name" | "contractor_email" | "budget_soumission" | "budget_avenant" | "amount_invoiced" | "advancement_percent" | "created_at" | "updated_at"
>;

export type MessageInsert = WithOptionalDefaults<
  Message,
  "id" | "project_id" | "reply_to" | "attachments" | "is_edited" | "created_at"
>;

export type ApiUsageLogInsert = WithOptionalDefaults<
  ApiUsageLog,
  "id" | "user_id" | "organization_id" | "model" | "input_tokens" | "output_tokens" | "audio_seconds" | "estimated_cost_chf" | "metadata" | "created_at"
>;

export type AdminActivityLogInsert = WithOptionalDefaults<
  AdminActivityLog,
  "id" | "user_id" | "organization_id" | "metadata" | "ip_address" | "user_agent" | "created_at"
>;

export type AdminDailyMetricsInsert = WithOptionalDefaults<
  AdminDailyMetrics,
  "id" | "total_users" | "active_users_today" | "new_users_today" | "total_organizations" | "active_organizations_today" | "emails_synced" | "emails_classified" | "replies_generated" | "tasks_created" | "pv_generated" | "pv_transcribed" | "briefings_generated" | "total_api_cost_chf" | "anthropic_cost_chf" | "openai_cost_chf" | "total_revenue_chf" | "created_at"
>;

export type PlanRegistryInsert = WithOptionalDefaults<
  PlanRegistry,
  "id" | "plan_type" | "discipline" | "lot_id" | "lot_name" | "cfc_code" | "zone" | "scale" | "format" | "author_company" | "author_name" | "author_email" | "status" | "is_current_version" | "tags" | "notes" | "created_at" | "updated_at" | "created_by"
>;

export type PlanVersionInsert = WithOptionalDefaults<
  PlanVersion,
  "id" | "version_number" | "file_size" | "file_type" | "thumbnail_url" | "source" | "source_email_id" | "received_at" | "ai_detected" | "ai_confidence" | "ai_changes_detected" | "validated_by" | "validated_at" | "validation_status" | "validation_notes" | "distributed_to" | "distribution_date" | "is_current" | "superseded_by" | "created_at"
>;

export type PlanVersionAlertInsert = WithOptionalDefaults<
  PlanVersionAlert,
  "id" | "plan_version_id" | "current_version_id" | "severity" | "detected_in" | "detected_in_id" | "detected_context" | "who_used_outdated" | "status" | "resolved_at" | "resolved_by" | "resolution_notes" | "created_at"
>;

export type PlanEstimateInsert = WithOptionalDefaults<
  PlanEstimate,
  "id" | "subtotal" | "margin_total" | "transport_cost" | "grand_total" | "currency" | "db_coverage_percent" | "confidence_summary" | "items_count" | "status" | "estimated_by" | "estimated_at" | "created_at"
>;

export type SupplierInsert = WithOptionalDefaults<
  Supplier,
  "id" | "contact_name" | "email" | "phone" | "address" | "city" | "postal_code" | "country" | "website" | "specialties" | "cfc_codes" | "geo_zone" | "languages" | "certifications" | "response_rate" | "avg_response_days" | "price_competitiveness" | "reliability_score" | "manual_rating" | "overall_score" | "status" | "tags" | "notes" | "total_requests_sent" | "total_offers_received" | "total_projects_involved" | "created_at" | "updated_at" | "created_by"
>;

export type SubmissionInsert = WithOptionalDefaults<
  Submission,
  "id" | "description" | "reference" | "source_type" | "source_file_url" | "source_file_name" | "source_email_id" | "client_name" | "architect_name" | "engineer_name" | "project_location" | "status" | "deadline" | "award_date" | "ai_parsed" | "ai_confidence" | "ai_parsed_at" | "estimated_total" | "best_offer_total" | "awarded_total" | "created_at" | "updated_at" | "created_by"
>;

export type SubmissionLotInsert = WithOptionalDefaults<
  SubmissionLot,
  "id" | "cfc_code" | "description" | "sort_order" | "status" | "awarded_supplier_id" | "created_at"
>;

export type SubmissionChapterInsert = WithOptionalDefaults<
  SubmissionChapter,
  "id" | "code" | "sort_order" | "created_at"
>;

export type SubmissionItemInsert = WithOptionalDefaults<
  SubmissionItem,
  "id" | "code" | "quantity" | "remarks" | "sort_order" | "estimated_unit_price" | "estimated_confidence" | "estimation_source" | "best_unit_price" | "best_supplier_id" | "awarded_unit_price" | "awarded_supplier_id" | "normalized_description" | "cfc_subcode" | "created_at"
>;

export type PriceRequestInsert = WithOptionalDefaults<
  PriceRequest,
  "id" | "lot_ids" | "email_subject" | "email_body" | "email_language" | "template_used" | "attachment_url" | "sent_at" | "sent_via" | "outlook_message_id" | "opened_at" | "status" | "reminder_count" | "last_reminder_at" | "next_reminder_at" | "reminder_enabled" | "deadline" | "portal_token" | "portal_token_expires_at" | "tracking_code" | "created_at" | "created_by"
>;

export type SupplierOfferInsert = WithOptionalDefaults<
  SupplierOffer,
  "id" | "received_at" | "source_type" | "source_file_url" | "source_file_name" | "source_email_id" | "total_amount" | "currency" | "vat_included" | "vat_rate" | "validity_days" | "validity_date" | "payment_terms" | "delivery_included" | "discount_percent" | "conditions_text" | "negotiation_round" | "is_final" | "ai_parsed" | "ai_confidence" | "status" | "created_at"
>;

export type OfferLineItemInsert = WithOptionalDefaults<
  OfferLineItem,
  "id" | "total_price" | "currency" | "match_confidence" | "supplier_description" | "supplier_quantity" | "supplier_unit" | "normalized_description" | "cfc_subcode" | "unit_normalized" | "vs_average_percent" | "vs_best_percent" | "is_cheapest" | "is_anomaly" | "anomaly_reason" | "supplier_remarks" | "status" | "created_at"
>;

export type PricingAlertInsert = WithOptionalDefaults<
  PricingAlert,
  "id" | "project_id" | "submission_id" | "supplier_id" | "severity" | "item_description" | "cfc_code" | "current_price" | "reference_price" | "difference_percent" | "reference_project_name" | "reference_date" | "financial_impact" | "suggested_action" | "action_url" | "status" | "resolved_at" | "resolved_by" | "created_at"
>;

export type NegotiationInsert = WithOptionalDefaults<
  Negotiation,
  "id" | "previous_total" | "new_total" | "reduction_percent" | "email_sent" | "email_subject" | "email_body" | "sent_at" | "response_received" | "response_at" | "response_notes" | "created_at" | "created_by"
>;

export type EmailTemplateInsert = WithOptionalDefaults<
  EmailTemplate,
  "id" | "language" | "tone" | "is_default" | "created_at" | "updated_at" | "created_by"
>;

export type EmailArchiveInsert = WithOptionalDefaults<
  EmailArchive,
  "id" | "attachments_saved" | "status" | "error_message" | "archived_at" | "created_at" | "storage_path" | "storage_bucket" | "file_size"
>;

export type EmailClassificationRuleInsert = WithOptionalDefaults<
  EmailClassificationRule,
  "id" | "category_id" | "classification" | "times_confirmed" | "times_overridden" | "confidence_boost" | "is_active" | "created_at" | "updated_at"
>;

// ---------- Client Visits ----------

export type VisitStatus = "recording" | "transcribing" | "report_ready" | "reviewed" | "quoted" | "won" | "lost" | "archived";
export type TranscriptionStatus = "pending" | "processing" | "completed" | "failed";
export type ReportStatus = "pending" | "generating" | "completed" | "reviewed";
export type VisitSentiment = "positive" | "neutral" | "hesitant" | "negative";

export interface VisitClientRequest {
  category: string;
  description: string;
  details?: string;
  priority: "high" | "medium" | "low";
  cfc_code?: string;
}

export interface VisitMeasurement {
  zone: string;
  dimensions: string;
  notes?: string;
}

export interface VisitBudget {
  client_mentioned: boolean;
  range_min?: number;
  range_max?: number;
  currency: string;
  notes?: string;
}

export interface VisitTimeline {
  desired_start?: string;
  desired_end?: string;
  constraints?: string;
  urgency: "low" | "moderate" | "high" | "critical";
}

export interface VisitReport {
  title?: string;
  summary?: string;
  client_info_extracted?: {
    name?: string;
    company?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  client_requests?: VisitClientRequest[];
  measurements?: VisitMeasurement[];
  constraints?: string[];
  budget?: VisitBudget;
  timeline?: VisitTimeline;
  next_steps?: string[];
  competitors_mentioned?: string[];
  sentiment?: VisitSentiment;
  closing_probability?: number;
  closing_notes?: string;
}

export interface ClientVisit {
  id: string;
  organization_id: string;
  project_id: string | null;
  client_name: string;
  client_company: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  client_city: string | null;
  client_postal_code: string | null;
  is_prospect: boolean;
  title: string | null;
  visit_date: string;
  visit_time: string | null;
  duration_minutes: number | null;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  audio_file_name: string | null;
  audio_file_size: number | null;
  transcription: string | null;
  transcription_status: TranscriptionStatus;
  transcription_provider: string | null;
  transcription_language: string;
  report_status: ReportStatus;
  report_generated_at: string | null;
  report: VisitReport;
  quote_task_id: string | null;
  followup_task_id: string | null;
  status: VisitStatus;
  report_pdf_url: string | null;
  photos_count: number;
  handwritten_notes_transcription: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export type ClientVisitInsert = WithOptionalDefaults<
  ClientVisit,
  "id" | "project_id" | "client_company" | "client_email" | "client_phone" | "client_address" | "client_city" | "client_postal_code" | "is_prospect" | "title" | "visit_date" | "visit_time" | "duration_minutes" | "audio_url" | "audio_duration_seconds" | "audio_file_name" | "audio_file_size" | "transcription" | "transcription_status" | "transcription_provider" | "transcription_language" | "report_status" | "report_generated_at" | "report" | "quote_task_id" | "followup_task_id" | "status" | "report_pdf_url" | "photos_count" | "handwritten_notes_transcription" | "created_at" | "updated_at"
>;

// ---------- Visit Photos ----------

export type VisitPhotoType = "site" | "handwritten_notes";
export type VisitPhotoAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export interface HandwrittenNotesAnalysis {
  transcribed_text: string;
  sketches: { description: string; location?: string }[];
  measurements_found: { value: string; unit: string; context: string }[];
  language_detected: string;
  confidence: number;
}

export interface VisitPhoto {
  id: string;
  visit_id: string;
  organization_id: string;
  photo_type: VisitPhotoType;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  sort_order: number;
  caption: string | null;
  location_description: string | null;
  ai_transcription: string | null;
  ai_sketch_description: string | null;
  ai_analysis_status: VisitPhotoAnalysisStatus;
  ai_confidence: number | null;
  ai_analysis_result: HandwrittenNotesAnalysis | null;
  created_at: string;
  created_by: string | null;
}

// ---------- Database Schema Type (Supabase-style) ----------

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Simplify<Organization>;
        Insert: OrganizationInsert;
        Update: Simplify<Partial<Organization>>;
        Relationships: [];
      };
      users: {
        Row: Simplify<User>;
        Insert: UserInsert;
        Update: Simplify<Partial<User>>;
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: Simplify<Project>;
        Insert: ProjectInsert;
        Update: Simplify<Partial<Project>>;
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: Simplify<ProjectMember>;
        Insert: ProjectMemberInsert;
        Update: Simplify<Partial<ProjectMember>>;
        Relationships: [];
      };
      email_connections: {
        Row: Simplify<EmailConnection>;
        Insert: EmailConnectionInsert;
        Update: Simplify<Partial<EmailConnection>>;
        Relationships: [];
      };
      email_records: {
        Row: Simplify<Email>;
        Insert: EmailInsert;
        Update: Simplify<Partial<Email>>;
        Relationships: [];
      };
      email_categories: {
        Row: Simplify<EmailCategoryRecord>;
        Insert: EmailCategoryRecordInsert;
        Update: Simplify<Partial<EmailCategoryRecord>>;
        Relationships: [];
      };
      outlook_folders: {
        Row: Simplify<OutlookFolder>;
        Insert: OutlookFolderInsert;
        Update: Simplify<Partial<OutlookFolder>>;
        Relationships: [];
      };
      email_preferences: {
        Row: Simplify<EmailPreferences>;
        Insert: EmailPreferencesInsert;
        Update: Simplify<Partial<EmailPreferences>>;
        Relationships: [];
      };
      tasks: {
        Row: Simplify<Task>;
        Insert: TaskInsert;
        Update: Simplify<Partial<Task>>;
        Relationships: [];
      };
      meetings: {
        Row: Simplify<Meeting>;
        Insert: MeetingInsert;
        Update: Simplify<Partial<Meeting>>;
        Relationships: [];
      };
      daily_briefings: {
        Row: Simplify<DailyBriefing>;
        Insert: DailyBriefingInsert;
        Update: Simplify<Partial<DailyBriefing>>;
        Relationships: [];
      };
      notifications: {
        Row: Simplify<Notification>;
        Insert: NotificationInsert;
        Update: Simplify<Partial<Notification>>;
        Relationships: [];
      };
      app_logs: {
        Row: Simplify<AppLog>;
        Insert: AppLogInsert;
        Update: Simplify<Partial<AppLog>>;
        Relationships: [];
      };
      usage_events: {
        Row: Simplify<UsageEvent>;
        Insert: UsageEventInsert;
        Update: Simplify<Partial<UsageEvent>>;
        Relationships: [];
      };
      lots: {
        Row: Simplify<Lot>;
        Insert: LotInsert;
        Update: Simplify<Partial<Lot>>;
        Relationships: [];
      };
      messages: {
        Row: Simplify<Message>;
        Insert: MessageInsert;
        Update: Simplify<Partial<Message>>;
        Relationships: [];
      };
      api_usage_logs: {
        Row: Simplify<ApiUsageLog>;
        Insert: ApiUsageLogInsert;
        Update: Simplify<Partial<ApiUsageLog>>;
        Relationships: [];
      };
      project_receptions: {
        Row: Simplify<ProjectReception>;
        Insert: ProjectReceptionInsert;
        Update: Simplify<Partial<ProjectReception>>;
        Relationships: [];
      };
      reception_reserves: {
        Row: Simplify<ReceptionReserve>;
        Insert: ReceptionReserveInsert;
        Update: Simplify<Partial<ReceptionReserve>>;
        Relationships: [];
      };
      closure_documents: {
        Row: Simplify<ClosureDocument>;
        Insert: ClosureDocumentInsert;
        Update: Simplify<Partial<ClosureDocument>>;
        Relationships: [];
      };
      admin_activity_logs: {
        Row: Simplify<AdminActivityLog>;
        Insert: AdminActivityLogInsert;
        Update: Simplify<Partial<AdminActivityLog>>;
        Relationships: [];
      };
      admin_daily_metrics: {
        Row: Simplify<AdminDailyMetrics>;
        Insert: AdminDailyMetricsInsert;
        Update: Simplify<Partial<AdminDailyMetrics>>;
        Relationships: [];
      };
      admin_config: {
        Row: Simplify<AdminConfig>;
        Insert: Simplify<AdminConfig>;
        Update: Simplify<Partial<AdminConfig>>;
        Relationships: [];
      };
      plan_registry: {
        Row: Simplify<PlanRegistry>;
        Insert: PlanRegistryInsert;
        Update: Simplify<Partial<PlanRegistry>>;
        Relationships: [];
      };
      plan_versions: {
        Row: Simplify<PlanVersion>;
        Insert: PlanVersionInsert;
        Update: Simplify<Partial<PlanVersion>>;
        Relationships: [];
      };
      plan_version_alerts: {
        Row: Simplify<PlanVersionAlert>;
        Insert: PlanVersionAlertInsert;
        Update: Simplify<Partial<PlanVersionAlert>>;
        Relationships: [];
      };
      suppliers: {
        Row: Simplify<Supplier>;
        Insert: SupplierInsert;
        Update: Simplify<Partial<Supplier>>;
        Relationships: [];
      };
      submissions: {
        Row: Simplify<Submission>;
        Insert: SubmissionInsert;
        Update: Simplify<Partial<Submission>>;
        Relationships: [];
      };
      submission_lots: {
        Row: Simplify<SubmissionLot>;
        Insert: SubmissionLotInsert;
        Update: Simplify<Partial<SubmissionLot>>;
        Relationships: [];
      };
      submission_chapters: {
        Row: Simplify<SubmissionChapter>;
        Insert: SubmissionChapterInsert;
        Update: Simplify<Partial<SubmissionChapter>>;
        Relationships: [];
      };
      submission_items: {
        Row: Simplify<SubmissionItem>;
        Insert: SubmissionItemInsert;
        Update: Simplify<Partial<SubmissionItem>>;
        Relationships: [];
      };
      price_requests: {
        Row: Simplify<PriceRequest>;
        Insert: PriceRequestInsert;
        Update: Simplify<Partial<PriceRequest>>;
        Relationships: [];
      };
      supplier_offers: {
        Row: Simplify<SupplierOffer>;
        Insert: SupplierOfferInsert;
        Update: Simplify<Partial<SupplierOffer>>;
        Relationships: [];
      };
      offer_line_items: {
        Row: Simplify<OfferLineItem>;
        Insert: OfferLineItemInsert;
        Update: Simplify<Partial<OfferLineItem>>;
        Relationships: [];
      };
      pricing_alerts: {
        Row: Simplify<PricingAlert>;
        Insert: PricingAlertInsert;
        Update: Simplify<Partial<PricingAlert>>;
        Relationships: [];
      };
      negotiations: {
        Row: Simplify<Negotiation>;
        Insert: NegotiationInsert;
        Update: Simplify<Partial<Negotiation>>;
        Relationships: [];
      };
      email_templates: {
        Row: Simplify<EmailTemplate>;
        Insert: EmailTemplateInsert;
        Update: Simplify<Partial<EmailTemplate>>;
        Relationships: [];
      };
      email_archives: {
        Row: Simplify<EmailArchive>;
        Insert: EmailArchiveInsert;
        Update: Simplify<Partial<EmailArchive>>;
        Relationships: [];
      };
      email_classification_rules: {
        Row: Simplify<EmailClassificationRule>;
        Insert: EmailClassificationRuleInsert;
        Update: Simplify<Partial<EmailClassificationRule>>;
        Relationships: [];
      };
      organization_invites: {
        Row: Simplify<OrganizationInvite>;
        Insert: OrganizationInviteInsert;
        Update: Simplify<Partial<OrganizationInvite>>;
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      client_visits: {
        Row: Simplify<ClientVisit>;
        Insert: ClientVisitInsert;
        Update: Simplify<Partial<ClientVisit>>;
        Relationships: [
          {
            foreignKeyName: "client_visits_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: UserRole;
      subscription_plan: SubscriptionPlan;
      project_status: ProjectStatus;
      reception_type: ReceptionType;
      reception_status: ReceptionStatus;
      reserve_severity: ReserveSeverity;
      reserve_status: ReserveStatus;
      closure_document_type: ClosureDocumentType;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      task_source: TaskSource;
      meeting_status: MeetingStatus;
      email_classification: EmailClassification;
      log_level: LogLevel;
      plan_type: PlanType;
      plan_discipline: PlanDiscipline;
      plan_status: PlanStatus;
      plan_validation_status: PlanValidationStatus;
      plan_alert_type: PlanAlertType;
      plan_alert_severity: PlanAlertSeverity;
      plan_alert_status: PlanAlertStatus;
      plan_source: PlanSource;
      supplier_status: SupplierStatus;
      supplier_type: SupplierType;
      submission_status: SubmissionStatus;
      submission_source_type: SubmissionSourceType;
      submission_lot_status: SubmissionLotStatus;
      price_request_status: PriceRequestStatus;
      supplier_offer_status: SupplierOfferStatus;
      offer_line_item_status: OfferLineItemStatus;
      pricing_alert_type: PricingAlertType;
      pricing_alert_severity: PricingAlertSeverity;
      pricing_alert_status: PricingAlertStatus;
      email_template_type: EmailTemplateType;
      email_classification_status: EmailClassificationStatus;
      email_category: EmailCategory;
      classification_rule_type: ClassificationRuleType;
      archive_structure: ArchiveStructure;
      archive_filename_format: ArchiveFilenameFormat;
      archive_attachments_mode: ArchiveAttachmentsMode;
      organization_status: OrganizationStatus;
      organization_plan: OrganizationPlan;
      invite_status: InviteStatus;
      invite_role: InviteRole;
      visit_status: VisitStatus;
      transcription_status: TranscriptionStatus;
      report_status: ReportStatus;
      visit_sentiment: VisitSentiment;
      triage_status: TriageStatus;
      process_action: ProcessAction;
      email_provider: EmailProvider;
      email_importance: EmailImportance;
      consent_module: ConsentModule;
      supplier_preference_status: SupplierPreferenceStatus;
      ai_module: AIModule;
    };
  };
}

// ---------- Data Intelligence Types ----------

export type ConsentModule =
  | "prix"
  | "fournisseurs"
  | "plans"
  | "pv"
  | "visites"
  | "chat"
  | "mail"
  | "taches"
  | "briefing";

export type SupplierPreferenceStatus = "preferred" | "blacklisted" | "neutral";

export type AIModule =
  | "mail"
  | "pv"
  | "plans"
  | "prix"
  | "chat"
  | "tasks"
  | "visits"
  | "briefing"
  | "soumissions";
