// Clients IA multi-modèle pour le pipeline d'estimation
// Chaque client envoie un plan (image base64) avec un prompt et retourne le JSON parsé

import type { Passe2Result } from './types';

interface AICallResult<T> {
  result: T | null;
  latency_ms: number;
  tokens_used: number;
  error: string | null;
}

// Extrait le JSON d'une réponse qui peut contenir des fences ```json ... ```
function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim();

  // Retirer les fences markdown
  const jsonFenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonFenceMatch) {
    cleaned = jsonFenceMatch[1].trim();
  }

  return JSON.parse(cleaned) as T;
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
    const client = new Anthropic({ timeout: 90_000 });

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

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
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
    });

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
    const client = new Anthropic({ timeout: 90_000 });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
    });

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
      model: "gpt-4o",
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

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
