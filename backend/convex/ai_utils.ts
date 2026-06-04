/**
 * ai_utils.ts — shared HTTP client for OpenRouter.
 * Extracted from ai.ts so agents.ts can import it without circular deps.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const FALLBACK_MODEL = "anthropic/claude-3-haiku";

export interface AIMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export async function callAI(
  messages: AIMessage[],
  maxTokens = 300,
  model?: string,
  apiKey?: string,
): Promise<string> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const primaryModel = model || DEFAULT_MODEL;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const currentModel = attempt >= 2 ? FALLBACK_MODEL : primaryModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: currentModel, messages, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const status = res.status;
        const errBody = await res.text();
        if (status >= 500 || status === 429) { lastError = new Error(`OpenRouter ${status}: ${errBody}`); continue; }
        throw new Error(`OpenRouter ${status}: ${errBody}`);
      }
      const data = await res.json() as any;
      return data.choices?.[0]?.message?.content ?? "";
    } catch (e: any) {
      clearTimeout(timeout);
      if (e?.name === "AbortError") { lastError = new Error("Request timed out"); continue; }
      throw e;
    }
  }
  throw lastError ?? new Error("AI request failed");
}
