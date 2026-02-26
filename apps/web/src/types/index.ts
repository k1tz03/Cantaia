// Re-export all types from shared packages for convenience
export type {
  Organization,
  User,
  Project,
  ProjectMember,
  EmailRecord,
  Task,
  Meeting,
  DailyBriefing,
  Notification,
  AppLog,
  UsageEvent,
  Lot,
  Message,
  Database,
} from "@cantaia/database";

export type {
  CreateProjectInput,
  UpdateProjectInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateMeetingInput,
  UpdateMeetingInput,
  CreateUserInput,
  UpdateUserInput,
  ClassifyEmailResult,
  ExtractTasksResult,
} from "@cantaia/core";
