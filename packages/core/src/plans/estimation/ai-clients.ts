// Clients IA multi-modèle pour le pipeline d'estimation
// Chaque client envoie un plan (image base64) avec un prompt et retourne le JSON parsé

import type { Passe2Result } from './types';
import { parseAIJson, AI_MODELS, callAnthropicWithRetry } from '../../ai/ai-utils';

// Modèles tiers (hors Anthropic) — centralisés ici plutôt que dispersés en
// littéraux. Les modèles Claude passent par AI_MODELS (convention MODEL_FOR_TASK).
const GPT4O_MODEL = 'gpt-4o';
const GEMINI_MODEL = 'gemini-2.5-flash';

interface AICallResult<T> {
  result: T | null;
  latency_ms: number;
  tokens_used: number;
  error: string | null;
}

// Parse tolérant (fences markdown, préambules GPT/Gemini, virgules traînantes) —
// évite qu'un simple préambule textuel exclue un modèle du consensus (B18).
function parseJSONResponse<T>(text: string): T {
  const parsed = parseAIJson<T>(text);
  if (parsed === null) {
    throw new Error(`Réponse IA non parsable en JSON (${text.length} chars): ${text.slice(0, 200)}`);
  }
  return parsed;
}

// ─── Claude Vision ───

export async function callClaudeVision<T = Passe2Result>(
  imageBase64: string,
  mediaType: string,
  systemPrompt: string,
  userPrompt: string
): Promise<AICallResult<T>> {
  const start = Date.now();
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    // maxRetries:0 sur le client SDK — le retry contrôlé est délégué à
    // callAnthropicWithRetry (sinon double retry, cf. convention IA).
    const client = new Anthropic({ timeout: 90_000, maxRetries: 0 });

    // Claude supporte les PDF via type "document", les images via type "image"
    const isPdf = mediaType === 'application/pdf';
    const fileContent = isPdf
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: imageBase64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: imageBase64,
          },
        };

    const response = await callAnthropicWithRetry(
      () =>
        client.messages.create({
          model: AI_MODELS.SONNET,
          max_tokens: 8000,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                fileContent,
                {
                  type: "text",
                  text: userPrompt,
                },
              ],
            },
          ],
        }),
      { maxRetries: 2 }
    );

    const latency_ms = Date.now() - start;
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    const tokens_used = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    console.log(`[estimation] Claude: ${latency_ms}ms, ${tokens_used} tokens`);

    const result = parseJSONResponse<T>(text);
    return { result, latency_ms, tokens_used, error: null };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[estimation] Claude error: ${error}`);
    return { result: null, latency_ms, tokens_used: 0, error };
  }
}

// Version texte seul (pour Passe 3 et Passe 4)
export async function callClaudeText<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<AICallResult<T>> {
  const start = Date.now();
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ timeout: 90_000, maxRetries: 0 });

    const response = await callAnthropicWithRetry(
      () =>
        client.messages.create({
          model: AI_MODELS.SONNET,
          max_tokens: 8000,
          system: systemPrompt,
          messages: [
            { role: "user", content: userPrompt },
          ],
        }),
      { maxRetries: 2 }
    );

    const latency_ms = Date.now() - start;
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    const tokens_used = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    console.log(`[estimation] Claude (text): ${latency_ms}ms, ${tokens_used} tokens`);

    const result = parseJSONResponse<T>(text);
    return { result, latency_ms, tokens_used, error: null };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[estimation] Claude text error: ${error}`);
    return { result: null, latency_ms, tokens_used: 0, error };
  }
}

// ─── GPT-4o Vision ───

export async function callGPT4oVision<T = Passe2Result>(
  imageBase64: string,
  mediaType: string,
  systemPrompt: string,
  userPrompt: string
): Promise<AICallResult<T>> {
  const start = Date.now();
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI();

    // GPT-4o : PDF via type "file", images via type "image_url"
    const isPdf = mediaType === 'application/pdf';
    const fileContent = isPdf
      ? {
          type: "file" as const,
          file: {
            filename: "plan.pdf",
            file_data: `data:application/pdf;base64,${imageBase64}`,
          },
        }
      : {
          type: "image_url" as const,
          image_url: {
            url: `data:${mediaType};base64,${imageBase64}`,
          },
        };

    const response = await client.chat.completions.create({
      model: GPT4O_MODEL,
      max_tokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            fileContent as any,
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
    });

    const latency_ms = Date.now() - start;
    const text = response.choices[0]?.message?.content ?? "";
    const tokens_used = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

    console.log(`[estimation] GPT-4o: ${latency_ms}ms, ${tokens_used} tokens`);

    const result = parseJSONResponse<T>(text);
    return { result, latency_ms, tokens_used, error: null };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[estimation] GPT-4o error: ${error}`);
    return { result: null, latency_ms, tokens_used: 0, error };
  }
}

// ─── Gemini Vision ───

export async function callGeminiVision<T = Passe2Result>(
  imageBase64: string,
  mediaType: string,
  systemPrompt: string,
  userPrompt: string
): Promise<AICallResult<T>> {
  const start = Date.now();
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            {
              inlineData: {
                mimeType: mediaType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8000,
      },
    });

    const latency_ms = Date.now() - start;
    const text = result.response.text();
    const tokens_used = result.response.usageMetadata?.totalTokenCount ?? 0;

    console.log(`[estimation] Gemini: ${latency_ms}ms, ${tokens_used} tokens`);

    const parsed = parseJSONResponse<T>(text);
    return { result: parsed, latency_ms, tokens_used, error: null };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[estimation] Gemini error: ${error}`);
    return { result: null, latency_ms, tokens_used: 0, error };
  }
}
