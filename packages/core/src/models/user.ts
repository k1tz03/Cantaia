import { z } from "zod";

export const userRoleSchema = z.enum([
  "project_manager",
  "site_manager",
  "foreman",
  "admin",
  "superadmin",
]);

export const preferredLanguageSchema = z.enum(["fr", "en", "de"]);

export const createUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  role: userRoleSchema.default("project_manager"),
  phone: z.string().optional(),
  preferred_language: preferredLanguageSchema.default("fr"),
  job_title: z.string().max(200).optional(),
  age_range: z.enum(["18-25", "26-35", "36-45", "46-55", "56+"]).optional(),
  gender: z.enum(["homme", "femme", "autre", "non_specifie"]).optional(),
});

export const updateUserSchema = createUserSchema.partial();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
