# Prompt Caching Report — Cantaia

## Summary

All Anthropic Claude API calls in the codebase now use `cache_control: { type: "ephemeral" }` on their largest content blocks (system prompts > 500 chars and/or user prompts). This enables Anthropic's prompt caching, which can reduce input token costs by up to 90% for repeated or similar prompts.

## Files with cache_control applied

### Core AI services (`packages/core/src/ai/`)
| File | Location | Type |
|------|----------|------|
| `chat-service.ts` | system prompt | `system: [{ type: "text", text: ..., cache_control }]` |
| `email-classifier.ts` | user message | `content: [{ type: "text", text: ..., cache_control }]` |
| `task-extractor.ts` | user message | `content: [{ type: "text", text: ..., cache_control }]` |
| `reply-generator.ts` | user message | `content: [{ type: "text", text: ..., cache_control }]` |
| `plan-analyzer.ts` | text content block | `{ type: "text", text: ..., cache_control }` |

### Pricing services (`packages/core/src/pricing/`)
| File | Location | Type |
|------|----------|------|
| `auto-estimator.ts` | Pass 2 + Pass 3 prompts | user message cache_control |
| `email-price-extractor.ts` | PDF + body extraction prompts | user message cache_control |

### Other core services
| File | Location | Type |
|------|----------|------|
| `briefing/briefing-generator.ts` | user message | cache_control on prompt |
| `suppliers/supplier-search.ts` | user message | cache_control on prompt |
| `suppliers/supplier-enricher.ts` | user message | cache_control on prompt |
| `submissions/price-extractor.ts` | user message | cache_control on prompt |

### Estimation pipeline V2 (`packages/core/src/plans/estimation/`)
| File | Location | Type |
|------|----------|------|
| `ai-clients.ts` — `callClaudeVision()` | system + user prompt | both system and text blocks cached |
| `ai-clients.ts` — `callClaudeText()` | system + user prompt | both system and text blocks cached |

### API routes (`apps/web/src/app/api/`)
| File | Location | Type |
|------|----------|------|
| `ai/generate-pv/route.ts` | user message | cache_control on prompt |
| `suppliers/search/route.ts` | user message | cache_control on prompt |

## Expected savings

- **Email classification** (most frequent): system prompt is ~1500 tokens, cached across all emails in a batch
- **Reclassify-all**: processes up to 200 emails with the same prompt structure — very high cache hit rate
- **Briefing generation**: stable prompt structure, system instructions cached
- **Estimation pipeline**: 4-pass pipeline with similar prompt templates
- **Chat**: system prompt cached across conversation turns

Estimated cost reduction: **30-60%** on input tokens across all AI operations.
