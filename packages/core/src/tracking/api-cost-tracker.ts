// ============================================================
// API Cost Tracker — Logs API usage and estimates costs in CHF
// ============================================================
// IMPORTANT: Tracking must NEVER block or fail the main operation.
// All errors are caught silently and logged to console.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ApiActionType, ApiProvider } from "@cantaia/database";

/** Pricing per API provider (USD) */
const PRICING = {
  anthropic: {
    "claude-sonnet-4-5-20250929": { input_per_1k: 0.003, output_per_1k: 0.015 },
    "claude-sonnet-4-6": { input_per_1k: 0.003, output_per_1k: 0.015 },
    "claude-haiku-4-5-20251001": { input_per_1k: 0.001, output_per_1k: 0.005 },
    // Fallback for unknown models (Sonnet rates)
    default: { input_per_1k: 0.003, output_per_1k: 0.015 },
  },
  openai: {
    "whisper-1": { per_minute: 0.006 },
    "gpt-4o": { input_per_1k: 0.0025, output_per_1k: 0.01 },
  },
  google: {
    "gemini-2.5-flash": { input_per_1k: 0.0003, output_per_1k: 0.0025 },
  },
  usd_to_chf: 0.89,
} as const;

/** Token-priced models across all providers (model-first lookup). */
const TOKEN_PRICING: Record<string, { input_per_1k: number; output_per_1k: number }> = {
  "claude-sonnet-4-5-20250929": PRICING.anthropic["claude-sonnet-4-5-20250929"],
  "claude-sonnet-4-6": PRICING.anthropic["claude-sonnet-4-6"],
  "claude-haiku-4-5-20251001": PRICING.anthropic["claude-haiku-4-5-20251001"],
  "gpt-4o": PRICING.openai["gpt-4o"],
  "gemini-2.5-flash": PRICING.google["gemini-2.5-flash"],
};

/** Callback type for AI services to report usage data */
export interface ApiUsageCallback {
  (usage: { model: string; inputTokens: number; outputTokens: number }): void;
}

export interface TrackApiUsageParams {
  supabase: SupabaseClient<Database>;
  userId: string;
  organizationId: string;
  actionType: ApiActionType;
  apiProvider: ApiProvider;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Calculate estimated cost in CHF based on usage.
 */
function calculateCostChf(params: {
  apiProvider: ApiProvider;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
}): number {
  const { apiProvider, model, inputTokens, outputTokens, audioSeconds } = params;

  let costUsd = 0;

  if (apiProvider === "openai_whisper") {
    const minutes = audioSeconds / 60;
    costUsd = minutes * PRICING.openai["whisper-1"].per_minute;
  } else if (model && TOKEN_PRICING[model]) {
    // Model-first lookup — works for Anthropic, GPT-4o and Gemini alike
    const rates = TOKEN_PRICING[model];
    costUsd = (inputTokens / 1000) * rates.input_per_1k + (outputTokens / 1000) * rates.output_per_1k;
  } else if (apiProvider === "anthropic") {
    // Unknown Anthropic model → Sonnet fallback rates
    const rates = PRICING.anthropic.default;
    costUsd = (inputTokens / 1000) * rates.input_per_1k + (outputTokens / 1000) * rates.output_per_1k;
  }

  return costUsd * PRICING.usd_to_chf;
}

/**
 * Track an API usage event. Fire-and-forget — never throws.
 */
export async function trackApiUsage(params: TrackApiUsageParams): Promise<void> {
  try {
    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const audioSeconds = params.audioSeconds ?? 0;

    const estimatedCostChf = calculateCostChf({
      apiProvider: params.apiProvider,
      model: params.model,
      inputTokens,
      outputTokens,
      audioSeconds,
    });

    const { error } = await params.supabase
      .from("api_usage_logs")
      .insert({
        user_id: params.userId,
        organization_id: params.organizationId,
        action_type: params.actionType,
        api_provider: params.apiProvider,
        model: params.model ?? null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        audio_seconds: audioSeconds,
        estimated_cost_chf: estimatedCostChf,
        metadata: params.metadata ?? {},
      } as any);

    if (error) {
      console.error("[trackApiUsage] Insert error (non-blocking):", error.message, error.details, error.hint, error.code);
    } else {
      console.log("[trackApiUsage] OK:", params.actionType, "cost:", estimatedCostChf.toFixed(4), "CHF", "user:", params.userId?.substring(0, 8));
    }
  } catch (error) {
    console.error('[api-cost-tracker] Failed to track API usage:', {
      action_type: params.actionType,
      error: error instanceof Error ? error.message : String(error),
      user_id: params.userId,
      org_id: params.organizationId,
    });
  }
}
