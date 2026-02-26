import { z } from "zod";

export const projectStatusSchema = z.enum([
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
]);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(20).optional(),
  description: z.string().max(2000).optional(),
  client_name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).default("Lausanne"),
  status: projectStatusSchema.default("active"),
  email_keywords: z.array(z.string()).default([]),
  email_senders: z.array(z.string().email()).default([]),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  budget_total: z.number().positive().optional(),
  currency: z.enum(["CHF", "EUR"]).default("CHF"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#6366F1"),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
