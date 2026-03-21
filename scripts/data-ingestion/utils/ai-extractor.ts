import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from '../config';

const anthropic = new Anthropic({ apiKey: CONFIG.anthropic.apiKey });

// Semaphore pour limiter les appels concurrents
let activeRequests = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRequests < CONFIG.anthropic.maxConcurrent) {
      activeRequests++;
      resolve();
    } else {
      queue.push(() => {
        activeRequests++;
        resolve();
      });
    }
  });
}

function releaseSlot() {
  activeRequests--;
  if (queue.length > 0) {
    const next = queue.shift()!;
    next();
  }
}

// Appel Claude avec rate limiting et retry
export async function callClaude(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  await acquireSlot();

  try {
    // Délai entre les appels
    await new Promise((r) => setTimeout(r, CONFIG.anthropic.delayBetweenCalls));

    const response = await anthropic.messages.create({
      model: CONFIG.anthropic.model,
      max_tokens: params.maxTokens || CONFIG.limits.maxTokensPerCall,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: params.userPrompt }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return text;
  } catch (error: any) {
    if (error?.status === 429) {
      // Rate limit — attendre et retry
      console.log('  ⏳ Rate limit atteint, pause 30 secondes...');
      await new Promise((r) => setTimeout(r, 30000));
      releaseSlot();
      return callClaude(params); // Retry
    }
    console.error('  ❌ Erreur Claude:', error?.message || error);
    return null;
  } finally {
    releaseSlot();
  }
}

// Appel Claude Vision (pour les plans en image/PDF)
export async function callClaudeVision(params: {
  systemPrompt: string;
  userPrompt: string;
  imageBase64: string;
  mediaType: 'application/pdf' | 'image/png' | 'image/jpeg';
  maxTokens?: number;
}): Promise<string | null> {
  await acquireSlot();

  try {
    await new Promise((r) => setTimeout(r, CONFIG.anthropic.delayBetweenCalls));

    const response = await anthropic.messages.create({
      model: CONFIG.anthropic.model,
      max_tokens: params.maxTokens || CONFIG.limits.maxTokensPerCall,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: params.mediaType,
                data: params.imageBase64,
              },
            },
            { type: 'text', text: params.userPrompt },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return text;
  } catch (error: any) {
    if (error?.status === 429) {
      console.log('  ⏳ Rate limit Vision, pause 30 secondes...');
      await new Promise((r) => setTimeout(r, 30000));
      releaseSlot();
      return callClaudeVision(params);
    }
    console.error('  ❌ Erreur Claude Vision:', error?.message || error);
    return null;
  } finally {
    releaseSlot();
  }
}

// Parse JSON sécurisé
export function safeParseJSON<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
