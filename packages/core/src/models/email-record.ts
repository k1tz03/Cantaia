import { z } from "zod";

export const emailClassificationSchema = z.enum([
  "action_required",
  "info_only",
  "urgent",
  "waiting_response",
  "archived",
]);

export const emailCategorySchema = z.enum([
  "personal",
  "administrative",
  "spam",
  "newsletter",
]);

export const suggestedProjectSchema = z.object({
  name: z.string(),
  reference: z.string().nullable(),
  client: z.string().nullable(),
  location: z.string().nullable(),
  type: z.string().nullable(),
  extracted_contacts: z.array(
    z.object({
      name: z.string(),
      company: z.string().nullable(),
      email: z.string(),
      role: z.string().nullable(),
    })
  ).default([]),
});

// Enhanced classification result from Claude (supports 3 cases)
export const classifyEmailResultSchema = z.object({
  match_type: z.enum(["existing_project", "new_project", "no_project"]),
  confidence: z.number().min(0).max(1),

  // Existing project match (CAS A)
  project_id: z.string().uuid().nullable().optional(),
  // Project match confidence (legacy compat — derived from confidence)
  project_match_confidence: z.number().min(0).max(100).optional(),

  // Classification (urgency)
  classification: emailClassificationSchema.optional(),
  classification_confidence: z.number().min(0).max(100).optional(),

  // New project suggestion (CAS B)
  suggested_project: suggestedProjectSchema.nullable().optional(),

  // No project category (CAS C)
  email_category: emailCategorySchema.optional(),

  // Always present
  reasoning: z.string().optional().default(""),
  summary_fr: z.string(),
  summary_en: z.string(),
  summary_de: z.string(),
  contains_task: z.boolean(),
  task: z
    .object({
      title: z.string(),
      due_date: z.string().nullable(),
      assigned_to_name: z.string().nullable(),
      assigned_to_company: z.string().nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"]),
    })
    .nullable()
    .optional(),
});

export const extractTasksResultSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      assigned_to_name: z.string().nullable(),
      assigned_to_company: z.string().nullable(),
      due_date: z.string().date().nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"]),
      source_quote: z.string(),
    })
  ),
});

export type ClassifyEmailResult = z.infer<typeof classifyEmailResultSchema>;
export type SuggestedProject = z.infer<typeof suggestedProjectSchema>;
export type ExtractTasksResult = z.infer<typeof extractTasksResultSchema>;
