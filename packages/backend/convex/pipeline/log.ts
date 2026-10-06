import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalQuery, type ActionCtx } from "../_generated/server";
import { AI_INPUT_LIMITS, assertMaxChars } from "../ai_guard";
import { extractItems, type ExtractedItem } from "./extract";
import { logResultValidator, type InputKind, type LogResult, type UnresolvedItem } from "./resolve";
import { runToolPass } from "./tools";

/** Where a pipeline run came from, so its entries and drafts link back to the chat message. */
export interface PipelineRun {
  submissionId: string;
  inputKind: InputKind;
  items: ExtractedItem[];
  chatId?: Id<"chats">;
  messageId?: Id<"messages">;
}

/**
 * Plan 3.3 steps 3-7 for already-extracted items: match, resolve portions, and if any food is unplaced run the
 * D14 tool pass, then gate and commit (or draft) in one mutation. Shared by the input bar and chat turns.
 */
export async function runPipeline(ctx: ActionCtx, userId: string, run: PipelineRun): Promise<LogResult> {
  if (run.items.length === 0) return { kind: "empty", submissionId: run.submissionId, lines: [] };
  const unresolved: UnresolvedItem[] = await ctx.runQuery(internal.pipeline.resolve.previewLog, {
    userId,
    inputKind: run.inputKind,
    items: run.items,
  });
  const picks = await runToolPass(ctx, userId, unresolved);
  return await ctx.runMutation(internal.pipeline.resolve.commitLog, {
    userId,
    submissionId: run.submissionId,
    inputKind: run.inputKind,
    items: run.items,
    picks,
    ...(run.chatId === undefined ? {} : { chatId: run.chatId }),
    ...(run.messageId === undefined ? {} : { messageId: run.messageId }),
  });
}

/** Turns base64 audio into text with Groq Whisper, through the existing `ai.transcribe` action and its budget guard. */
export async function transcribe(ctx: ActionCtx, audio: string, mimeType: string | undefined): Promise<string> {
  const { transcript }: { transcript: string } = await ctx.runAction(api.ai.transcribe, {
    audio,
    ...(mimeType === undefined ? {} : { mimeType }),
  });
  return transcript;
}

/** Size and type of an uploaded file, from the `_storage` system table. Null when it does not exist. */
export const photoInfo = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.object({ size: v.number(), contentType: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, { storageId }) => {
    const file = await ctx.db.system.get("_storage", storageId);
    return file === null ? null : { size: file.size, contentType: file.contentType ?? null };
  },
});

/** A signed URL the photo model can fetch for an uploaded image. Rejects oversized or non-image files before any model call. */
export async function imageUrl(ctx: ActionCtx, storageId: Id<"_storage">): Promise<string> {
  const info: { size: number; contentType: string | null } | null = await ctx.runQuery(internal.pipeline.log.photoInfo, {
    storageId,
  });
  if (info === null) throw new Error("Photo not found. Upload it again.");
  if (info.size > AI_INPUT_LIMITS.imageBytes) throw new Error(`Photo is too large. The limit is ${AI_INPUT_LIMITS.imageBytes} bytes.`);
  // Uploads without a Content-Type have no stored type; the model rejects those if they are not images.
  if (info.contentType !== null && !info.contentType.startsWith("image/")) throw new Error("That file is not an image.");
  const url = await ctx.storage.getUrl(storageId);
  if (url === null) throw new Error("Photo not found. Upload it again.");
  return url;
}

/**
 * The global input bar (D5): text, voice or photo in, structured result out. Auto-commits when every item passes
 * the D7 gate (undo for 10 s), else returns a draft that asks. Retrying with the same submissionId returns the
 * first result without calling the model again.
 */
export const logInput = action({
  args: {
    submissionId: v.string(),
    input: v.union(
      v.object({ kind: v.literal("text"), text: v.string() }),
      v.object({ kind: v.literal("voice"), audio: v.string(), mimeType: v.optional(v.string()) }),
      v.object({ kind: v.literal("photo"), storageId: v.id("_storage"), text: v.optional(v.string()) }),
    ),
  },
  returns: logResultValidator,
  handler: async (ctx, { submissionId, input }): Promise<LogResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Unauthenticated");
    const userId = identity.subject;
    if (submissionId.length === 0 || submissionId.length > 128) throw new Error("submissionId must be 1-128 characters");
    const prior: LogResult | null = await ctx.runQuery(internal.pipeline.resolve.findLog, { userId, submissionId });
    if (prior !== null) return prior;

    const today = await ctx.runQuery(internal.pipeline.resolve.logContext, { userId });
    let text: string;
    let photoUrl: string | undefined;
    if (input.kind === "text") text = input.text;
    else if (input.kind === "voice") text = await transcribe(ctx, input.audio, input.mimeType);
    else {
      text = input.text ?? "";
      photoUrl = await imageUrl(ctx, input.storageId);
    }
    text = text.trim();
    assertMaxChars(text, AI_INPUT_LIMITS.textChars, "text");
    if (text === "" && photoUrl === undefined) return { kind: "empty", submissionId, lines: [] };

    const items = await extractItems(ctx, userId, {
      text,
      today: today.localDate,
      slot: today.slot,
      ...(photoUrl === undefined ? {} : { imageUrl: photoUrl }),
    });
    return await runPipeline(ctx, userId, { submissionId, inputKind: input.kind, items });
  },
});
