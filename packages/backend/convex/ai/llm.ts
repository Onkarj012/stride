/**
 * ai/llm.ts — canonical OpenRouter client + model config.
 *
 * Single source of truth for callAI (previously duplicated in ai.ts and
 * ai_utils.ts). Imported by ai.ts, agents.ts, and anything needing an LLM call.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Split-model strategy: cheap model for high-volume parsing/extraction,
// upgraded model for chat replies users actually read.
export const DEFAULT_MODEL = "openai/gpt-4o-mini";       // parsing, extraction, titles
export const CHAT_MODEL = "anthropic/claude-sonnet-4.6"; // coach + homepage chat replies
export const FALLBACK_MODEL = "anthropic/claude-haiku-4.5"; // retry fallback when primary fails

export const VISION_MODELS = new Set([
  "openai/gpt-4o", "openai/gpt-4o-mini", "openai/gpt-4-turbo",
  "openai/gpt-5-mini",
  "anthropic/claude-3-opus", "anthropic/claude-3-sonnet", "anthropic/claude-3-haiku",
  "anthropic/claude-3.5-sonnet", "anthropic/claude-3.5-haiku",
  "anthropic/claude-sonnet-4.6", "anthropic/claude-haiku-4.5",
  "google/gemini-1.5-pro", "google/gemini-1.5-flash", "google/gemini-2.0-flash",
  "google/gemini-3.5-flash", "google/gemini-3.1-flash-lite",
  "google/gemini-2.5-flash-lite-preview-09-2025",
  "meta-llama/llama-3.2-11b-vision", "meta-llama/llama-3.2-90b-vision",
  "x-ai/grok-build-0.1",
]);

export interface AIMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

/**
 * Call OpenRouter with retry + fallback. Up to 4 attempts; attempts 3–4 use
 * FALLBACK_MODEL. Retries on 5xx, 429, empty content, network errors, 60s abort.
 */
export async function callAI(messages: AIMessage[], maxTokens = 500, model?: string, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const primaryModel = model || DEFAULT_MODEL;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const backoffMs = 250 * 2 ** attempt;
    const wait = () => new Promise((r) => setTimeout(r, backoffMs));
    const useFallback = attempt >= 2;
    const currentModel = useFallback ? FALLBACK_MODEL : primaryModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: currentModel, messages, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const status = res.status;
        const errBody = await res.text();
        if (status >= 500 || status === 429) {
          lastError = new Error(`OpenRouter error ${status}: ${errBody}`);
          await wait();
          continue;
        }
        throw new Error(`OpenRouter error ${status}: ${errBody}`);
      }
      const data = await res.json() as any;
      if (data.error) {
        lastError = new Error(`OpenRouter API error: ${data.error.message}`);
        await wait();
        continue;
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error("OpenRouter returned empty response");
        await wait();
        continue;
      }
      return content;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error("OpenRouter request timed out after 60s");
        await wait();
        continue;
      }
      const error = err as Error;
      if (
        error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ECONNRESET") ||
        error.message.includes("network")
      ) {
        lastError = error;
        await wait();
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("OpenRouter failed after maximum retries");
}

/** Extract and parse the first JSON object/array from LLM text, or null. */
export function tryParseJSON<T>(text: string): T | null {
  const objIdx = text.indexOf("{");
  const arrIdx = text.indexOf("[");
  const start =
    objIdx === -1 ? arrIdx :
    arrIdx === -1 ? objIdx :
    Math.min(objIdx, arrIdx);

  if (start === -1) {
    try { return JSON.parse(text) as T; } catch { return null; }
  }

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) as T; } catch { return null; }
      }
    }
  }
  return null;
}

/** Extract and parse the first JSON object/array from LLM text, or fallback. */
export function parseJSON<T>(text: string, fallback: T): T {
  const parsed = tryParseJSON<T>(text);
  if (parsed == null) return fallback;
  return parsed;
}
