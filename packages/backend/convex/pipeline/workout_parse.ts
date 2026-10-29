import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalAction } from "../_generated/server";
import { AI_INPUT_LIMITS } from "../ai_guard";
import { PIPELINE_MODEL, callOpenRouter } from "./openrouter";
import { WORKOUT_RESPONSE_FORMAT } from "../workouts";

/** Parses workout text into a review card without writing workout records. */
export const parse = action({
  args: { submissionId: v.string(), text: v.string(), sessionId: v.optional(v.id("workout_sessions")), draftId: v.optional(v.id("workout_drafts")) },
  returns: v.object({ draftId: v.id("workout_drafts") }),
  handler: async (ctx, args): Promise<{ draftId: Id<"workout_drafts"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    if (args.text.trim() === "" || args.text.length > Math.min(AI_INPUT_LIMITS.messageChars, 12_000) || args.submissionId.trim() === "" || args.submissionId.length > 128) throw new ConvexError({ code: "INVALID_TEXT", message: `Enter workout text up to ${AI_INPUT_LIMITS.messageChars} characters.` });
    const context: { enabled: boolean; timeZone: string; now: number; localDate: string; startTime: string; openSession: Doc<"workout_sessions"> | null; reviseItems: unknown[] } = await ctx.runQuery(internal.workouts.parseContext, { userId: identity.subject, ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }) });
    if (!context.enabled) throw new ConvexError({ code: "FEATURE_OFF", message: "Turn on Log workouts in words in Settings first." });
    const prior: Doc<"workout_drafts"> | null = await ctx.runQuery(internal.workouts.findSubmission, { userId: identity.subject, submissionId: args.submissionId });
    if (prior !== null) return { draftId: prior._id };
    const prompt = `Read the workout text only. Preserve every exercise name as written, including grip and equipment words. Return raw weight and reps lists in order; do not infer values. Convert lb only by marking unit lb. A single reps/weight value may be repeated by server rules. Cardio has no weights or reps. Report kcal only when stated by the user. Duration and date are null unless explicit. startTime is null unless the text states it. targetIntent is append only for a clear request to add to the open session, new for an explicit separate workout, otherwise unclear. Today is ${context.localDate}. Current local time is ${context.startTime}.${context.reviseItems.length === 0 ? "" : ` Current saved workout items are numbered; carry the matching from index into the full corrected list:\n${JSON.stringify(context.reviseItems)}`}`;
    let reply;
    try {
      reply = await callOpenRouter(ctx, identity.subject, { model: PIPELINE_MODEL, maxTokens: 1800, responseFormat: WORKOUT_RESPONSE_FORMAT, messages: [{ role: "system", content: prompt }, { role: "user", content: args.text }] });
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError({ code: "AI_UNAVAILABLE", message: "The workout could not be read. Try again or enter it by hand." });
    }
    if (reply.content === null) throw new ConvexError({ code: "AI_UNAVAILABLE", message: "The workout could not be read. Try again or enter it by hand." });
    const draftId: Id<"workout_drafts"> = await ctx.runMutation(internal.workouts.saveParsedDraft, { userId: identity.subject, submissionId: args.submissionId, text: args.text, source: "text", localDate: context.localDate, startTime: context.startTime, raw: reply.content, ...(args.draftId === undefined ? {} : { draftId: args.draftId }), ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }) });
    return { draftId };
  },
});

/** Prepares a Coach workout review and links it to the reply that offers it. */
export const parseCoach = internalAction({
  args: { userId: v.string(), submissionId: v.string(), text: v.string(), chatId: v.id("chats"), messageId: v.id("messages"), sessionId: v.optional(v.id("workout_sessions")), draftId: v.optional(v.id("workout_drafts")) },
  returns: v.id("workout_drafts"),
  handler: async (ctx, args): Promise<Id<"workout_drafts">> => {
    if (args.text.trim() === "" || args.text.length > Math.min(AI_INPUT_LIMITS.messageChars, 12_000)) throw new ConvexError({ code: "INVALID_TEXT", message: "Enter workout text up to 4,000 characters." });
    const context: { enabled: boolean; timeZone: string; now: number; localDate: string; startTime: string; openSession: Doc<"workout_sessions"> | null; reviseItems: unknown[] } = await ctx.runQuery(internal.workouts.parseContext, { userId: args.userId, ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }) });
    if (!context.enabled) throw new ConvexError({ code: "FEATURE_OFF", message: "Turn on Log workouts in words in Settings first." });
    const prior: Doc<"workout_drafts"> | null = await ctx.runQuery(internal.workouts.findSubmission, { userId: args.userId, submissionId: args.submissionId });
    if (prior !== null) return prior._id;
    const prompt = `Read the workout text only. Preserve names as written. Return raw weight and reps lists without inventing values. Cardio has no weights or reps. Report kcal only when stated. Duration/date/startTime are null unless explicit. targetIntent is append only when clearly requested, new when explicitly separate, otherwise unclear. Today is ${context.localDate}. Current local time is ${context.startTime}.${context.reviseItems.length === 0 ? "" : ` Current saved workout items are numbered; carry the matching from index into the full corrected list:\n${JSON.stringify(context.reviseItems)}`}`;
    let reply;
    try {
      reply = await callOpenRouter(ctx, args.userId, { model: PIPELINE_MODEL, maxTokens: 1800, responseFormat: WORKOUT_RESPONSE_FORMAT, messages: [{ role: "system", content: prompt }, { role: "user", content: args.text }] });
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError({ code: "AI_UNAVAILABLE", message: "The workout could not be read. Try again or enter it by hand." });
    }
    if (reply.content === null) throw new ConvexError({ code: "AI_UNAVAILABLE", message: "The workout could not be read. Try again or enter it by hand." });
    return await ctx.runMutation(internal.workouts.saveParsedDraft, { userId: args.userId, submissionId: args.submissionId, text: args.text, source: "coach", localDate: context.localDate, startTime: context.startTime, raw: reply.content, chatId: args.chatId, messageId: args.messageId, ...(args.draftId === undefined ? {} : { draftId: args.draftId }), ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }) });
  },
});
