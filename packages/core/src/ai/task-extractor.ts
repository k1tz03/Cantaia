// ============================================================
// AI Task Extractor — Extracts tasks from emails using Claude
// ============================================================

import { buildTaskExtractPrompt, type TaskExtractContext } from "./prompts";
import {
  extractTasksResultSchema,
  type ExtractTasksResult,
} from "../models/email-record";

export interface EmailForTaskExtraction {
  sender_email: string;
  sender_name: string;
  subject: string;
  body: string;
}

export interface ProjectContext {
  name: string;
}

const DEFAULT_RESULT: ExtractTasksResult = { tasks: [] };

/**
 * Extract tasks from an email using Claude API.
 * Returns a list of detected tasks with titles, assignees, deadlines, and priorities.
 */
import type { ApiUsageCallback } from "../tracking/api-cost-tracker";

export async function extractTasks(
  anthropicApiKey: string,
  email: EmailForTaskExtraction,
  projectContext: ProjectContext,
  model = "claude-sonnet-4-5-20250929",
  onUsage?: ApiUsageCallback
): Promise<ExtractTasksResult> {
  const ctx: TaskExtractContext = {
    project_name: projectContext.name,
    sender: `${email.sender_name} <${email.sender_email}>`,
    subject: email.subject,
    body: email.body,
  };

  const prompt = buildTaskExtractPrompt(ctx);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    // Fire-and-forget usage tracking
    try {
      onUsage?.({
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[extractTasks] No text content in Claude response");
      return DEFAULT_RESULT;
    }

    let jsonStr = textBlock.text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const validated = extractTasksResultSchema.safeParse(parsed);

    if (!validated.success) {
      console.error("[extractTasks] Invalid Claude response schema:", validated.error.issues);
      return DEFAULT_RESULT;
    }

    return validated.data;
  } catch (err) {
    console.error("[extractTasks] Error:", err instanceof Error ? err.message : err);
    return DEFAULT_RESULT;
  }
}
