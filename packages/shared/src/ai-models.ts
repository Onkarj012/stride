/** Models the deployment OpenRouter key may call. The backend prices each one in ai_guard.ts. */
export const AI_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', lab: 'OpenAI' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', lab: 'Anthropic' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', lab: 'Anthropic' },
  { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', lab: 'OpenAI' },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', lab: 'Google' },
] as const

export type AIModelId = (typeof AI_MODELS)[number]['id']
