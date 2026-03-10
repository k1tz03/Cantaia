import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('⚠ GEMINI_API_KEY non définie — Gemini indisponible, fallback Claude sera utilisé');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function extractWithGemini(
  systemPrompt: string,
  userContent: string,
  maxRetries: number = 2
): Promise<string> {
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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(
        systemPrompt + '\n\n' + userContent
      );
      return result.response.text();
    } catch (error: any) {
      if (error.status === 429 && attempt < maxRetries) {
        console.log(`  ⏸ Rate limit Gemini, attente 10s...`);
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
