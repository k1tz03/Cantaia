// ============================================================
// Cantaia — Plan Analysis Zod Schema
// Validates Claude Vision response for construction plan analysis
// ============================================================

import { z } from "zod";

export const planAnalysisTitleBlockSchema = z.object({
  plan_number: z.string().nullable(),
  plan_title: z.string().nullable(),
  scale: z.string().nullable(),
  date: z.string().nullable(),
  author: z.string().nullable(),
  company: z.string().nullable(),
  revision: z.string().nullable(),
});

export const planAnalysisLegendItemSchema = z.object({
  symbol: z.string(),
  description: z.string(),
  color: z.string().nullable().optional(),
});

export const planAnalysisQuantitySchema = z.object({
  category: z.string(),
  item: z.string(),
  quantity: z.number().nullable(),
  unit: z.string(),
  specification: z.string().nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const planAnalysisResultSchema = z.object({
  plan_type: z.enum([
    "planting",
    "network",
    "site_layout",
    "electrical",
    "facade",
    "structural",
    "hvac",
    "plumbing",
    "architecture",
    "other",
  ]),
  discipline: z.string(),
  title_block: planAnalysisTitleBlockSchema.nullable(),
  legend_items: z.array(planAnalysisLegendItemSchema),
  quantities: z.array(planAnalysisQuantitySchema),
  observations: z.array(z.string()),
  summary: z.string(),
});

export type PlanAnalysisResult = z.infer<typeof planAnalysisResultSchema>;
export type PlanAnalysisTitleBlock = z.infer<typeof planAnalysisTitleBlockSchema>;
export type PlanAnalysisLegendItem = z.infer<typeof planAnalysisLegendItemSchema>;
export type PlanAnalysisQuantity = z.infer<typeof planAnalysisQuantitySchema>;
