import type { Organization, AppLog, UsageEvent } from "@cantaia/database";

export interface AdminServiceInterface {
  getOrganizations(): Promise<Organization[]>;
  getOrganizationById(id: string): Promise<Organization | null>;
  getLogs(filters: {
    level?: string;
    source?: string;
    organizationId?: string;
    limit?: number;
  }): Promise<AppLog[]>;
  getUsageEvents(filters: {
    eventType?: string;
    organizationId?: string;
    limit?: number;
  }): Promise<UsageEvent[]>;
}
