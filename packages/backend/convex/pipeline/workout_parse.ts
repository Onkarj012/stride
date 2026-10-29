import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { AI_INPUT_LIMITS } from "../ai_guard";
import { PIPELINE_MODEL, callOpenRouter } from "./openrouter";
import { WORKOUT_RESPONSE_FORMAT } from "../workouts";

type ParseInput = {
  userId: string;
  submissionId: string;
  text: string;
  source: "text" | "coach";
  sessionId?: Id<"workout_sessions">;
  draftId?: Id<"workout_drafts">;
  chatId?: Id<"chats">;
  messageId?: Id<"messages">;
};

/** Validates, prompts, parses, and saves one workout review for either entry point. */
export async function parseWorkout(ctx: ActionCtx, args: ParseInput): Promise<Id<"workout_drafts">> {
  if (args.text.trim() === "" || args.text.length > Math.min(AI_INPUT_LIMITS.messageChars, 12_000) || args.submissionId.trim() === "" || args.submissionId.length > 128) {
    throw new ConvexError({ code: "INVALID_TEXT", message: `Enter workout text up to ${AI_INPUT_LIMITS.messageChars} characters.` });
  }
  const context = await ctx.runQuery(internal.workouts.parseContext, {
    userId: args.userId,
    ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
    ...(args.draftId === undefined ? {} : { draftId: args.draftId }),
  });
  if (!context.enabled) throw new ConvexError({ code: "FEATURE_OFF", message: "Turn on Log workouts in words in Settings first." });
  const prior = await ctx.runQuery(internal.workouts.findSubmission, { userId: args.userId, submissionId: args.submissionId });
  if (prior !== null) return prior._id;
  const contextItems = context.currentItems.length === 0
    ? ""
    : `\nCurrent workout items are numbered. For append, return only new items or existing items being corrected with their from index. Do not remove other items. For revise or draft corrections, return the full corrected list. Carry each matching from index so set positions keep their ids:\n${JSON.stringify(context.currentItems)}`;
  const prompt = `Read only the workout text. Preserve every exercise name as written, including grip and equipment words. Return raw weight and reps lists in order without inventing values. Convert lb by marking unit lb. A single reps or weight value may repeat by server rules. Cardio has no weights or reps. Report kcal only when stated. Duration, date and startTime are null unless explicit. targetIntent is append only for a clear request to add to the open session, new for an explicit separate workout, otherwise unclear. Current mode is ${context.mode}. Today is ${context.localDate}. Current local time is ${context.startTime}.${contextItems}`;
  let reply;
  try {
    reply = await callOpenRouter(ctx, args.userId, {
      model: PIPELINE_MODEL,
      maxTokens: 1800,
      responseFormat: WORKOUT_RESPONSE_FORMAT,
      messages: [{ role: "system", content: prompt }, { role: "user", content: args.text }],
    });
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    throw new ConvexError({ code: "AI_UNAVAILABLE", message: "The workout could not be read. Try again or enter it by hand." });
  }
  if (reply.content === null) throw new ConvexError({ code: "AI_UNAVAILABLE", message: "The workout could not be read. Try again or enter it by hand." });
  return await ctx.runMutation(internal.workouts.saveParsedDraft, {
    userId: args.userId,
    submissionId: args.submissionId,
    text: args.text,
    source: args.source,
    localDate: context.localDate,
    startTime: context.startTime,
    raw: reply.content,
    ...(args.draftId === undefined ? {} : { draftId: args.draftId }),
    ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
    ...(args.chatId === undefined ? {} : { chatId: args.chatId }),
    ...(args.messageId === undefined ? {} : { messageId: args.messageId }),
    contextItems: context.currentItems.map((item) => ({ from: item.from, name: item.name, sets: item.sets.map(({ setId, weightKg, reps, weightBasis }) => ({ ...(setId === undefined ? {} : { setId }), ...(weightKg === undefined ? {} : { weightKg }), ...(reps === undefined ? {} : { reps }), ...(weightBasis === undefined ? {} : { weightBasis }) })), ...(item.cardio === undefined ? {} : { cardio: item.cardio }) })),
    ...(context.headSetIds === undefined ? {} : { headSetIds: context.headSetIds }),
    ...(context.headCardioIds === undefined ? {} : { headCardioIds: context.headCardioIds }),
    ...(args.draftId === undefined ? {} : { version: context.version }),
  });
}

/** Parses workout text into a review card without writing workout records. */
export const parse = action({
  args: { submissionId: v.string(), text: v.string(), sessionId: v.optional(v.id("workout_sessions")), draftId: v.optional(v.id("workout_drafts")) },
  returns: v.object({ draftId: v.id("workout_drafts") }),
  handler: async (ctx, args): Promise<{ draftId: Id<"workout_drafts"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    const draftId = await parseWorkout(ctx, { ...args, userId: identity.subject, source: "text" });
    return { draftId };
  },
});

/** Prepares a Coach workout review and links it to the reply that offers it. */
export const parseCoach = internalAction({
  args: { userId: v.string(), submissionId: v.string(), text: v.string(), chatId: v.id("chats"), messageId: v.id("messages"), sessionId: v.optional(v.id("workout_sessions")), draftId: v.optional(v.id("workout_drafts")) },
  returns: v.id("workout_drafts"),
  handler: async (ctx, args) => await parseWorkout(ctx, { ...args, source: "coach" }),
});
