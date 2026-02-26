import type { EmailRecord } from "@cantaia/database";

export interface EmailServiceInterface {
  getEmailsByProject(projectId: string): Promise<EmailRecord[]>;
  getUnprocessedEmails(userId: string): Promise<EmailRecord[]>;
  classifyEmail(emailId: string): Promise<void>;
  reclassifyEmail(emailId: string, projectId: string): Promise<void>;
  syncEmails(userId: string): Promise<number>;
}
