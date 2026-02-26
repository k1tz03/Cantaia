import type { Task } from "@cantaia/database";
import type { CreateTaskInput, UpdateTaskInput } from "../models/task";

export interface TaskServiceInterface {
  getTasksByProject(projectId: string): Promise<Task[]>;
  getTaskById(id: string): Promise<Task | null>;
  createTask(userId: string, data: CreateTaskInput): Promise<Task>;
  updateTask(id: string, data: UpdateTaskInput): Promise<Task>;
  getOverdueTasks(userId: string): Promise<Task[]>;
}
