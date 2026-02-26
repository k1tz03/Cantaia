import { z } from "zod";

export const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
]);

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const taskSourceSchema = z.enum([
  "email",
  "meeting",
  "manual",
  "reserve",
]);

export const taskReminderSchema = z.enum([
  "none",
  "1_day",
  "3_days",
  "1_week",
]);

export const createTaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.default("todo"),
  priority: taskPrioritySchema.default("medium"),
  source: taskSourceSchema.default("manual"),
  source_id: z.string().uuid().optional(),
  source_reference: z.string().max(200).optional(),
  assigned_to: z.string().uuid().optional(),
  assigned_to_name: z.string().max(200).optional(),
  assigned_to_company: z.string().max(200).optional(),
  assigned_user_id: z.string().uuid().optional(),
  due_date: z.string().date().optional(),
  lot_code: z.string().max(20).optional(),
  lot_name: z.string().max(200).optional(),
  cfc_code: z.string().max(10).optional(),
  reminder: taskReminderSchema.default("none"),
});

export const updateTaskSchema = createTaskSchema.partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
