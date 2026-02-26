import type { Project } from "@cantaia/database";
import type { CreateProjectInput, UpdateProjectInput } from "../models/project";

export interface ProjectServiceInterface {
  getProjects(organizationId: string): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | null>;
  createProject(userId: string, data: CreateProjectInput): Promise<Project>;
  updateProject(id: string, data: UpdateProjectInput): Promise<Project>;
  archiveProject(id: string): Promise<void>;
}
