// ============================================================
// AI Task Extractor — Extracts tasks from emails using Claude
// ============================================================

import { buildTaskExtractPrompt, type TaskExtractContext } from "./prompts";
import {
  extractTasksResultSchema,
  type ExtractTasksResult,
} from "../models/email-record";
import { MODEL_FOR_TASK, isRetryableAIError } from "./ai-utils";

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
  model = MODEL_FOR_TASK.task_extraction,
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
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }] }],
    });

    // Fire-and-forget usage tracking
    try {
      onUsage?.({
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    if (response.stop_reason !== "end_turn") {
      console.error(`[extractTasks] Warning: response truncated (stop_reason=${response.stop_reason})`);
    }

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

    // Fallback: extract JSON object with regex if direct parse fails
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.error("[extractTasks] No JSON object found in response");
        return DEFAULT_RESULT;
      }
    }
    const validated = extractTasksResultSchema.safeParse(parsed);

    if (!validated.success) {
      console.error("[extractTasks] Invalid Claude response schema:", validated.error.issues);
      return DEFAULT_RESULT;
    }

    return validated.data;
  } catch (err: any) {
    console.error("[extractTasks] AI error:", err?.message || err);
    if (isRetryableAIError(err)) throw err;
    return DEFAULT_RESULT;
  }
}
