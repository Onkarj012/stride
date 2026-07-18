/**
 * ai/llm.ts — canonical OpenRouter client + model config.
 *
 * Single source of truth for callAI (previously duplicated in ai.ts and
 * ai_utils.ts). Imported by ai.ts, agents.ts, and anything needing an LLM call.
 */

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import {
  estimateCostUsd,
  estimateMessageTokens,
  hasDeploymentPricing,
  usageFromResponse,
} from "../ai_guard";

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
 * Call OpenRouter with retry + fallback. Up to 3 attempts; the final attempt
 * uses FALLBACK_MODEL. Only transient provider failures are retried.
 */
export async function callAI(ctx: ActionCtx, userId: string, messages: AIMessage[], maxTokens = 500, model?: string, apiKey?: string): Promise<string> {
  const primaryModel = model || DEFAULT_MODEL;
  const byokKey = apiKey?.trim();
  if (!byokKey && !hasDeploymentPricing(primaryModel)) {
    throw new Error(`MODEL_NOT_ALLOWED_WITH_DEPLOYMENT_KEY:${primaryModel}`);
  }
  const key = byokKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const estimatedInputTokens = estimateMessageTokens(messages);
  const estimatedOutputTokens = Math.max(1, Math.round(maxTokens));
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const backoffMs = 250 * 2 ** attempt;
    const currentModel = attempt >= 2 ? FALLBACK_MODEL : primaryModel;
    const estimatedCostUsd = byokKey
      ? 0
      : estimateCostUsd(currentModel, estimatedInputTokens, estimatedOutputTokens);
    const reservation = await ctx.runMutation(internal.ai_guard.checkAndReserve, {
      userId,
      model: currentModel,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd,
    });
    let providerCallStarted = false;
    let providerResponseReceived = false;
    let responseAccepted = false;
    let releaseCurrentReservation = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 60000);
      let res: Response;

      try {
        providerCallStarted = true;
        res = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: currentModel, messages, max_tokens: maxTokens }),
          signal: controller.signal,
        });
        providerResponseReceived = true;
      } catch (err) {
        const error = err as Error;
        const errorMessage = error.message.toLowerCase();
        const isTransient = error.name === "AbortError" || [
          "fetch failed",
          "econnrefused",
          "etimedout",
          "econnreset",
          "network",
        ].some((needle) => errorMessage.includes(needle));
        if (!isTransient) throw err;
        lastError = error.name === "AbortError"
          ? new Error("OpenRouter request timed out after 60s")
          : error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const status = res.status;
        const errBody = await res.text();
        // A provider response is definitive: this attempt cannot complete, so
        // its reserve must not survive into a retry or a future bucket.
        releaseCurrentReservation = true;
        if (status >= 500 || status === 429) {
          lastError = new Error(`OpenRouter error ${status}: ${errBody}`);
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          break;
        }
        throw new Error(`OpenRouter error ${status}: ${errBody}`);
      }

      const data = await res.json() as any;
      if (data.error) {
        releaseCurrentReservation = true;
        throw new Error(`OpenRouter API error: ${data.error.message}`);
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        releaseCurrentReservation = true;
        throw new Error("OpenRouter returned empty response");
      }
      responseAccepted = true;

      const usage = usageFromResponse(
        data.usage,
        estimatedInputTokens,
        Math.min(maxTokens, Math.max(1, Math.ceil(String(content).length / 3))),
      );
      await ctx.runMutation(internal.ai_guard.settleUsage, {
        reservationId: reservation.reservationId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        actualCostUsd: byokKey
          ? 0
          : estimateCostUsd(currentModel, usage.inputTokens, usage.outputTokens),
      });
      return content;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      // Once fetch starts, retain the reserve unless settlement succeeds: the provider may have billed us.
      if (
        !providerCallStarted ||
        releaseCurrentReservation ||
        (providerResponseReceived && !responseAccepted)
      ) {
        await ctx.runMutation(internal.ai_guard.releaseReservation, {
          reservationId: reservation.reservationId,
        });
      }
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
