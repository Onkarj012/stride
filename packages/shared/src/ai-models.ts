/** Models the deployment OpenRouter key may call. The backend prices each one in ai_guard.ts. */
export const AI_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', lab: 'OpenAI' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', lab: 'Anthropic' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', lab: 'Anthropic' },
] as const

export type AIModelId = (typeof AI_MODELS)[number]['id']
