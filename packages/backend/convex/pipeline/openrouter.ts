import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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
/** How often a quiet stream still calls back, so stops and buffered text don't wait for the next chunk. */
const STREAM_TICK_MS = 300;

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

/** Settles a reservation with the reported usage, or an estimate from the reply's size when none came back. */
async function settleCall(
  ctx: ActionCtx,
  reservationId: Id<"ai_usage_reservations">,
  model: string,
  reported: ReturnType<typeof readUsage>,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  content: string | null,
  toolCalls: ToolCall[],
): Promise<void> {
  // Tool-call arguments are output too, so a tool-only reply is not settled as one token.
  const outputChars = (content ?? "").length + (toolCalls.length === 0 ? 0 : JSON.stringify(toolCalls).length);
  const usage = usageFromResponse(
    reported,
    estimatedInputTokens,
    Math.min(estimatedOutputTokens, Math.max(1, Math.ceil(outputChars / 3))),
  );
  await ctx.runMutation(internal.ai_guard.settleUsage, {
    reservationId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    actualCostUsd: estimateCostUsd(model, usage.inputTokens, usage.outputTokens),
  });
}

/** Waits a little before a retry. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The request body, plus the token estimates every attempt reserves against the budget. */
function preparedRequest(request: ChatRequest, stream: boolean) {
  const payload = JSON.stringify({
    model: request.model,
    messages: request.messages,
    max_tokens: request.maxTokens,
    ...(request.responseFormat === undefined ? {} : { response_format: request.responseFormat }),
    ...(request.tools === undefined || request.tools.length === 0 ? {} : { tools: request.tools }),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  });
  const estimatedInputTokens =
    estimateMessageTokens(request.messages) + Math.ceil(JSON.stringify(request.tools ?? []).length / 3);
  const estimatedOutputTokens = Math.max(1, Math.round(request.maxTokens));
  return { payload, estimatedInputTokens, estimatedOutputTokens };
}

/** The OpenRouter key, or a clear error when the deployment has none. */
function openRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  return key;
}

/**
 * Calls OpenRouter once (plus one retry on transient failure). Every attempt reserves spend through the
 * `ai_guard` budget first and settles or releases it afterwards, so no call can skip the budget.
 */
export async function callOpenRouter(ctx: ActionCtx, userId: string, request: ChatRequest): Promise<ChatReply> {
  const key = openRouterKey();
  const { payload, estimatedInputTokens, estimatedOutputTokens } = preparedRequest(request, false);
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
      await settleCall(ctx, reservation.reservationId, request.model, readUsage(data.usage), estimatedInputTokens, estimatedOutputTokens, content, toolCalls);
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

/** A streamed reply. `stopped` is true when the caller ended it early; its tool calls are then dropped. */
export interface StreamedReply extends ChatReply {
  stopped: boolean;
}

/** What a stream has delivered so far. Tool calls arrive in pieces keyed by their index. */
interface StreamState {
  content: string;
  tools: { id: string; name: string; arguments: string }[];
  finishReason: unknown;
  usage: ReturnType<typeof readUsage>;
}

/** Folds one stream chunk into the state and returns its new text. A chunk carrying an error throws. */
function applyChunk(chunk: unknown, state: StreamState): string {
  if (!isRecord(chunk)) return "";
  if (isRecord(chunk.error)) throw new Error(`OpenRouter stream error: ${String(chunk.error.message ?? "unknown").slice(0, 300)}`);
  if (chunk.usage !== undefined) state.usage = readUsage(chunk.usage);
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  if (!isRecord(choice)) return "";
  if (choice.finish_reason !== undefined && choice.finish_reason !== null) state.finishReason = choice.finish_reason;
  const delta = isRecord(choice.delta) ? choice.delta : undefined;
  if (Array.isArray(delta?.tool_calls)) {
    for (const raw of delta.tool_calls) {
      if (!isRecord(raw) || typeof raw.index !== "number") continue;
      const call = (state.tools[raw.index] ??= { id: "", name: "", arguments: "" });
      if (typeof raw.id === "string") call.id = raw.id;
      const fn = isRecord(raw.function) ? raw.function : undefined;
      if (typeof fn?.name === "string") call.name += fn.name;
      if (typeof fn?.arguments === "string") call.arguments += fn.arguments;
    }
  }
  const text = typeof delta?.content === "string" ? delta.content : "";
  state.content += text;
  return text;
}

/**
 * Streams one OpenRouter reply, passing each new piece of text to `onText`, and "" every STREAM_TICK_MS while nothing
 * arrives. When `onText` returns true the stream
 * is cancelled and the text so far comes back with `stopped`. Retries only before any of the body is read, and
 * reserves and settles spend through `ai_guard` like `callOpenRouter`.
 */
export async function streamOpenRouter(
  ctx: ActionCtx,
  userId: string,
  request: ChatRequest,
  onText: (text: string) => Promise<boolean>,
): Promise<StreamedReply> {
  const key = openRouterKey();
  const { payload, estimatedInputTokens, estimatedOutputTokens } = preparedRequest(request, true);
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
    let release = true;
    const controller = new AbortController();
    // An idle timeout: each chunk that arrives restarts it, so a long reply is not cut off while it is still coming.
    let timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
      if (res.body === null) {
        release = true;
        throw new Error("OpenRouter returned no stream");
      }

      // From here on there is no retry: the caller may already have shown part of this reply.
      const state: StreamState = { content: "", tools: [], finishReason: undefined, usage: undefined };
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      let sawDone = false;
      let stopped = false;
      // Reads settle to a value, never reject, so a read left pending behind an idle tick can't go unhandled.
      const read = () => reader.read().then((result) => ({ result }), (error: unknown) => ({ error }));
      let pending = read();
      try {
        while (!finished && !stopped) {
          const next = await Promise.race([pending, sleep(STREAM_TICK_MS).then(() => null)]);
          if (next === null) {
            // No bytes for a tick: let the caller write buffered text and notice a stop, even mid tool call or keep-alive.
            if (await onText("")) stopped = true;
            continue;
          }
          if ("error" in next) {
            const err = next.error;
            throw err instanceof Error && err.name === "AbortError"
              ? new Error(`OpenRouter stream stalled for ${REQUEST_TIMEOUT_MS / 1000}s`)
              : err;
          }
          const chunk = next.result;
          if (!chunk.done) pending = read();
          clearTimeout(timeout);
          timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          buffer += chunk.done ? decoder.decode() + "\n" : decoder.decode(chunk.value, { stream: true });
          finished = chunk.done;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            // SSE comments (": OPENROUTER PROCESSING") and blank separators carry no data.
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              finished = true;
              sawDone = true;
              break;
            }
            const text = applyChunk(JSON.parse(data), state);
            if (text !== "" && (await onText(text))) {
              stopped = true;
              break;
            }
          }
        }
      } finally {
        if (!finished) await reader.cancel().catch(() => undefined);
      }

      const toolCalls: ToolCall[] = stopped
        ? []
        : state.tools
            .filter((call) => call !== undefined && call.id !== "" && call.name !== "")
            .map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } }));
      const content = state.content === "" ? null : state.content;
      await settleCall(ctx, reservation.reservationId, request.model, state.usage, estimatedInputTokens, estimatedOutputTokens, content, toolCalls);
      if (stopped) return { content, toolCalls, stopped };
      // A connection closed cleanly mid-answer looks like EOF; only a finish reason or [DONE] means the reply is whole.
      if (!sawDone && state.finishReason === undefined) throw new Error("OpenRouter stream ended before the reply finished");
      if (state.finishReason === "length") throw new Error("OpenRouter reply was cut off (finish_reason: length)");
      if (content === null && toolCalls.length === 0) throw new Error("OpenRouter returned an empty reply");
      return { content, toolCalls, stopped };
    } finally {
      clearTimeout(timeout);
      if (release) await ctx.runMutation(internal.ai_guard.releaseReservation, { reservationId: reservation.reservationId });
    }
  }
  throw lastError;
}
