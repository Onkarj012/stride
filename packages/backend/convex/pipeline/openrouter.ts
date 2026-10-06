import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { estimateCostUsd, estimateMessageTokens, usageFromResponse } from "../ai_guard";

/** OpenRouter chat completions endpoint. Every restart-pipeline LLM call goes through `callOpenRouter`. */
export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** D13: extraction, chat and tool calls. */
export const PIPELINE_MODEL = "openai/gpt-5.6-luna";

/**
 * D13 photo model. Plan 007 prefers luna if it accepts images; that is unverified (section 6), so photos use
 * Gemini 3.8 Flash until someone confirms luna vision and flips this constant.
 */
export const PHOTO_MODEL = "google/gemini-3.8-flash";

const REQUEST_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = 500;
/** One retry on 429, 5xx or a network failure. Callers are idempotent by submission id, so the user can resend. */
const MAX_ATTEMPTS = 2;

/** A JSON value, for tool parameter and response schemas. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** One part of a multimodal user message. */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/** A tool call the model asked for. `arguments` is a JSON string the caller must validate. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** One chat message in OpenRouter (OpenAI) format. */
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** A function tool the model may call. */
export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: { [key: string]: JsonValue } };
}

/** One request to OpenRouter. */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  responseFormat?: { [key: string]: JsonValue };
  tools?: ToolDefinition[];
}

/** The model's reply: text, tool calls, or both. */
export interface ChatReply {
  content: string | null;
  toolCalls: ToolCall[];
}

/** Narrows an unknown value to a plain object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads well-formed tool calls from a response message, dropping anything malformed. */
function readToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: ToolCall[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== "string" || !isRecord(raw.function)) continue;
    const { name, arguments: args } = raw.function;
    if (typeof name !== "string" || typeof args !== "string") continue;
    calls.push({ id: raw.id, type: "function", function: { name, arguments: args } });
  }
  return calls;
}

/** Token usage block from a response, if present. */
function readUsage(value: unknown): { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined {
  if (!isRecord(value)) return undefined;
  const num = (key: string) => (typeof value[key] === "number" ? value[key] : undefined);
  return { prompt_tokens: num("prompt_tokens"), completion_tokens: num("completion_tokens"), total_tokens: num("total_tokens") };
}

/** Waits a little before a retry. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls OpenRouter once (plus one retry on transient failure). Every attempt reserves spend through the
 * `ai_guard` budget first and settles or releases it afterwards, so no call can skip the budget.
 */
export async function callOpenRouter(ctx: ActionCtx, userId: string, request: ChatRequest): Promise<ChatReply> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const payload = JSON.stringify({
    model: request.model,
    messages: request.messages,
    max_tokens: request.maxTokens,
    ...(request.responseFormat === undefined ? {} : { response_format: request.responseFormat }),
    ...(request.tools === undefined || request.tools.length === 0 ? {} : { tools: request.tools }),
  });

  const estimatedInputTokens =
    estimateMessageTokens(request.messages) + Math.ceil(JSON.stringify(request.tools ?? []).length / 3);
  const estimatedOutputTokens = Math.max(1, Math.round(request.maxTokens));
  let lastError: Error = new Error("OpenRouter call failed");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS);
    const reservation = await ctx.runMutation(internal.ai_guard.checkAndReserve, {
      userId,
      model: request.model,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd: estimateCostUsd(request.model, estimatedInputTokens, estimatedOutputTokens),
    });
    // Once fetch may have reached the provider, the reserve stays unless we settle: the call may be billed.
    let release = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let res: Response;
      try {
        release = false;
        res = await fetch(OPENROUTER_CHAT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: payload,
          signal: controller.signal,
        });
      } catch (err) {
        lastError = err instanceof Error && err.name === "AbortError"
          ? new Error(`OpenRouter timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
          : err instanceof Error ? err : new Error(String(err));
        continue;
      }
      if (!res.ok) {
        release = true;
        lastError = new Error(`OpenRouter error ${res.status}: ${(await res.text()).slice(0, 300)}`);
        if (res.status === 429 || res.status >= 500) continue;
        throw lastError;
      }

      const data: unknown = await res.json();
      if (!isRecord(data)) {
        release = true;
        throw new Error("OpenRouter returned a non-object response");
      }
      const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
      const message = isRecord(choice) && isRecord(choice.message) ? choice.message : undefined;
      const content = message !== undefined && typeof message.content === "string" ? message.content : null;
      const toolCalls = readToolCalls(message?.tool_calls);
      const finishReason = isRecord(choice) ? choice.finish_reason : undefined;
      const usage = usageFromResponse(
        readUsage(data.usage),
        estimatedInputTokens,
        Math.min(estimatedOutputTokens, Math.max(1, Math.ceil((content ?? "").length / 3))),
      );
      await ctx.runMutation(internal.ai_guard.settleUsage, {
        reservationId: reservation.reservationId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        actualCostUsd: estimateCostUsd(request.model, usage.inputTokens, usage.outputTokens),
      });
      if (finishReason === "length") throw new Error("OpenRouter reply was cut off (finish_reason: length)");
      if (content === null && toolCalls.length === 0) throw new Error("OpenRouter returned an empty reply");
      return { content, toolCalls };
    } finally {
      clearTimeout(timeout);
      if (release) await ctx.runMutation(internal.ai_guard.releaseReservation, { reservationId: reservation.reservationId });
    }
  }
  throw lastError;
}
