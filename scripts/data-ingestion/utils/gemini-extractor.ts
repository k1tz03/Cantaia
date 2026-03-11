import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('⚠ GEMINI_API_KEY non définie — Gemini indisponible');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Extract structured data using Gemini 2.5 Flash.
 * Retries on 429 (rate limit) and 503 (service unavailable) with exponential backoff.
 * Base delays: 10s, 20s, 40s.
 * Returns null after all retries exhausted (caller should skip the file).
 */
export async function extractWithGemini(
  systemPrompt: string,
  userContent: string,
  maxRetries: number = 3
): Promise<string | null> {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY non configurée');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
    },
  });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent(
        systemPrompt + '\n\n' + userContent
      );
      return result.response.text();
    } catch (error: any) {
      const status = error.status || error.httpCode;
      const isRetryable = status === 429 || status === 503;

      if (isRetryable && attempt < maxRetries - 1) {
        const delay = 10000 * Math.pow(2, attempt); // 10s, 20s, 40s
        console.log(`  ⏸ Gemini ${status} (attempt ${attempt + 1}/${maxRetries}), retry in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (isRetryable) {
        // All retries exhausted — return null so caller can skip
        console.warn(`  ⚠ WARNING: Gemini ${status} after ${maxRetries} attempts — skipping file`);
        return null;
      }

      // Non-retryable error — throw immediately
      throw error;
    }
  }
  return null;
}
