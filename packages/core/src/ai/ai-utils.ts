// ============================================================
// AI Utilities — Shared infrastructure for all AI services
// Retry, caching, model routing, email cleaning
// ============================================================

// ── Model Constants ──────────────────────────────────────────

export const AI_MODELS = {
  /** Complex tasks requiring high accuracy */
  SONNET: "claude-sonnet-4-5-20250929",
  /** Simple tasks where speed/cost matters more */
  HAIKU: "claude-haiku-4-5-20251001",
} as const;

export type AIModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

/** Model recommendations by task type */
export const MODEL_FOR_TASK = {
  email_classification: AI_MODELS.SONNET,
  task_extraction: AI_MODELS.HAIKU,
  reply_generation: AI_MODELS.SONNET,
  plan_analysis: AI_MODELS.SONNET,
  briefing: AI_MODELS.HAIKU,
  chat: AI_MODELS.SONNET,
  supplier_search: AI_MODELS.HAIKU,
  supplier_enrichment: AI_MODELS.HAIKU,
  price_extraction: AI_MODELS.SONNET,
  pv_generation: AI_MODELS.SONNET,
} as const;

// ── Retry with Exponential Backoff ───────────────────────────

interface RetryOptions {
  maxRetries?: number;
  backoff?: number[];
}

/**
 * Call an async function with retry and exponential backoff.
 * Only retries on rate limit (429) or server errors (500+).
 * Does NOT retry on client errors (400, 401, 403).
 */
export async function callAnthropicWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const backoff = options?.backoff ?? [1000, 3000, 5000];

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      // Extract HTTP status from Anthropic SDK errors
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status: number }).status
          : undefined;

      // Don't retry on client errors (400, 401, 403)
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }

      // Only retry on 429 (rate limit) or 500+ (server errors), or unknown errors
      const isRetryable =
        status === undefined || status === 429 || status >= 500;

      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }

      const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? 5000;
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[callAnthropicWithRetry] Attempt ${attempt + 1}/${maxRetries} failed (status=${status ?? "unknown"}), retrying in ${delay}ms...`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ── Email Body Cleaning ──────────────────────────────────────

/**
 * Clean an email body (HTML or text) for AI consumption.
 * Strips HTML, signatures, disclaimers, collapses whitespace,
 * and truncates at sentence boundary.
 */
export function cleanEmailForAI(html: string, maxChars = 8000): string {
  if (!html) return "";

  let text = html;

  // Remove <style> and <script> blocks entirely
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Replace <br>, <p>, <div>, <li> with newlines for structure
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(p|div|li|tr|h[1-6])[^>]*>/gi, "\n");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");

  // Remove email signatures (line starting with -- followed by optional whitespace)
  text = text.replace(/^--\s*$/m, "\n---SIGNATURE---");
  const sigIdx = text.indexOf("---SIGNATURE---");
  if (sigIdx > 0) {
    text = text.substring(0, sigIdx);
  }

  // Remove legal disclaimers (FR/EN/DE patterns)
  const disclaimerPatterns = [
    // French
    /Ce (?:message|courriel|e-?mail) (?:et ses pièces jointes )?(?:est|sont) (?:confidentiel|destiné)[\s\S]{0,500}$/im,
    /Avertissement\s*:?\s*Ce (?:message|courriel)[\s\S]{0,500}$/im,
    /AVIS DE CONFIDENTIALIT[ÉE][\s\S]{0,500}$/im,
    // English
    /This (?:message|email|e-mail) (?:and any attachments )?(?:is|are) (?:intended|confidential)[\s\S]{0,500}$/im,
    /CONFIDENTIALITY NOTICE[\s\S]{0,500}$/im,
    /DISCLAIMER[\s\S]{0,500}$/im,
    // German
    /Diese (?:Nachricht|E-?Mail) (?:und ihre Anhänge )?(?:ist|sind) (?:vertraulich|ausschliesslich)[\s\S]{0,500}$/im,
    /VERTRAULICHKEITSHINWEIS[\s\S]{0,500}$/im,
  ];

  for (const pattern of disclaimerPatterns) {
    text = text.replace(pattern, "");
  }

  // Collapse multiple blank lines into one
  text = text.replace(/\n{3,}/g, "\n\n");

  // Collapse multiple spaces into one
  text = text.replace(/[ \t]+/g, " ");

  // Trim each line
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  // Truncate at sentence boundary if over maxChars
  if (text.length > maxChars) {
    const truncated = text.substring(0, maxChars);
    // Find the last sentence boundary (. ! ? followed by space or newline)
    const lastSentence = truncated.search(/[.!?][\s\n][^.!?]*$/);
    if (lastSentence > maxChars * 0.7) {
      text = truncated.substring(0, lastSentence + 1);
    } else {
      // Fall back to last newline
      const lastNewline = truncated.lastIndexOf("\n");
      if (lastNewline > maxChars * 0.7) {
        text = truncated.substring(0, lastNewline);
      } else {
        text = truncated;
      }
    }
  }

  return text;
}

// ── Cached Anthropic Client Factory ──────────────────────────

// WeakRef-compatible cache by API key
const clientCache = new Map<string, unknown>();

/**
 * Create or reuse an Anthropic client instance with optional timeout.
 * Uses a simple cache keyed by API key.
 */
export function createAnthropicClient(
  apiKey: string,
  timeoutMs = 60000
): unknown {
  const cacheKey = `${apiKey}:${timeoutMs}`;

  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  // We return a factory promise since Anthropic SDK is dynamically imported
  // The caller should await this in an async context
  // For now, we store the config and let callers use it
  const config = {
    apiKey,
    timeout: timeoutMs,
  };

  clientCache.set(cacheKey, config);
  return config;
}
