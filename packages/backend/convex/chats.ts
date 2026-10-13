import { roundTo, scaleNutrients, type MealSlot } from "@stride/core";
import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { transcribeAudio } from "./ai";
import { AI_INPUT_LIMITS, assertMaxChars } from "./ai_guard";
import { MAX_DAY_ENTRIES } from "./day_totals";
import { deleteEntryAs, editEntryAs } from "./entries";
import { isVisibleFood } from "./foods_db";
import { mealSlotValidator } from "./ledger_validators";
import { imageUrl } from "./pipeline/log";
import {
  PHOTO_MODEL,
  PIPELINE_MODEL,
  streamOpenRouter,
  type ChatMessage,
  type ContentPart,
  type JsonValue,
  type ToolDefinition,
} from "./pipeline/openrouter";
import { resolveFoodPortion, userFoodsOf, userMeasuresOf } from "./pipeline/resolve";
import { LOOKUP_TOOLS, parseToolArgs, runLookupTool, type SeenFoods } from "./pipeline/tools";
import { requireUserId, resolveLocalDay } from "./time_zone";
import { requireOwnUpload } from "./uploads";
import { assertLedgerWritable } from "./users";

/** Title a chat gets until its first message names it. */
export const DEFAULT_CHAT_TITLE = "New chat";
/** Most chats `listChats` returns. */
export const MAX_CHATS_LISTED = 50;
/** Most earlier messages the model sees each turn (D12). */
export const HISTORY_WINDOW = 20;
/** Rows read per window, so hidden replies from regenerating don't shrink the history the model sees. */
const HISTORY_READ_FACTOR = 3;
/** Most model calls in one chat turn. Each may run tools; the turn ends when the model stops calling them. */
export const MAX_CHAT_ITERATIONS = 4;

const MAX_SUBMISSION_ID_CHARS = 96;
const MAX_TITLE_CHARS = 60;
/** Most chats `searchChats` returns, and how many raw hits it reads to find them. */
const MAX_SEARCH_CHATS = 20;
const SEARCH_HITS = 50;
const SNIPPET_CHARS = 80;
const SNIPPET_LEAD_CHARS = 30;
/** Characters of a chat's newest message `listChats` previews, and how many recent rows it reads to find one. */
const PREVIEW_CHARS = 100;
const PREVIEW_SCAN = 5;
const MAX_CONTEXT_USER_FOODS = 30;
const MAX_TOOL_RESULT_CHARS = 4_000;
const PURGE_BATCH = 100;
const CHAT_MAX_TOKENS = 800;
/** How long a started turn holds its message. Matches the Convex action time limit, so a crashed turn frees it. */
const TURN_LEASE_MS = 10 * 60_000;
const MAX_PRIOR_DRAFTS = 10;
/** A streaming reply is written to its row at most this often, or once this many new characters arrive (A12). */
export const STREAM_FLUSH_MS = 300;
export const STREAM_FLUSH_CHARS = 200;
/** Most characters of the food text a "Log this" action keeps. */
const MAX_LOG_TEXT_CHARS = 500;
/** What the history says about a photo sent without words, and the question a photo turn asks when it has none. */
const PHOTO_HISTORY_TEXT = "(sent a photo)";
const PHOTO_QUESTION = "What's in this photo?";

const replyStatusValidator = v.union(v.literal("streaming"), v.literal("done"), v.literal("stopped"), v.literal("failed"));

/** True for a reply the user can read as final. Rows from before streaming have no status and are done. */
function isFinished(message: Doc<"messages">): boolean {
  return message.status === undefined || message.status === "done" || message.status === "stopped";
}

/** A reply's "Log this" button: opens Compose with this food text and/or this photo attached. */
const logActionValidator = v.object({ text: v.optional(v.string()), storageId: v.optional(v.id("_storage")) });
type LogAction = Infer<typeof logActionValidator>;

const messageViewValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  chatId: v.id("chats"),
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
  text: v.string(),
  attachments: v.array(v.object({ kind: v.union(v.literal("image"), v.literal("audio")), storageId: v.id("_storage") })),
  draftIds: v.array(v.id("drafts")),
  entryIds: v.array(v.id("entries")),
  status: replyStatusValidator,
  logAction: v.optional(logActionValidator),
  imageUrl: v.union(v.string(), v.null()),
});

const toolCallRecordValidator = v.object({ name: v.string(), argsJson: v.string(), resultJson: v.optional(v.string()) });
type ToolCallRecord = Infer<typeof toolCallRecordValidator>;
/** What a turn's work produced, before the reply is finished. `stopped` when the user stopped it mid-stream. */
type Turn = {
  reply: string;
  toolCalls: ToolCallRecord[];
  draftIds: Id<"drafts">[];
  entryIds: Id<"entries">[];
  stopped: boolean;
  logAction: LogAction | undefined;
};

/** What one chat turn produced: both messages, the reply text, and the drafts and entries its cards point at. */
const turnResultValidator = v.object({
  userMessageId: v.id("messages"),
  assistantMessageId: v.id("messages"),
  reply: v.string(),
  draftIds: v.array(v.id("drafts")),
  entryIds: v.array(v.id("entries")),
});
type TurnResult = Infer<typeof turnResultValidator>;

const regenerateResultValidator = v.object({ assistantMessageId: v.id("messages"), reply: v.string() });
type RegenerateResult = Infer<typeof regenerateResultValidator>;

/**
 * A claimed turn: its user message, the reply row it streams into, the claim time that fences the reply's writes,
 * whether an earlier attempt ran, and the text saved so far.
 */
const claimValidator = v.object({
  messageId: v.id("messages"),
  replyId: v.id("messages"),
  claimedAt: v.number(),
  retry: v.boolean(),
  text: v.string(),
  audioPending: v.boolean(),
});
type Claim = Infer<typeof claimValidator>;

/** Loads one of the user's chats or throws. */
async function ownChat(ctx: QueryCtx | MutationCtx, userId: string, chatId: Id<"chats">): Promise<Doc<"chats">> {
  const chat = await ctx.db.get("chats", chatId);
  if (chat === null || chat.userId !== userId) throw new Error("Chat not found");
  return chat;
}

/** Starts a new chat for the caller. */
export const createChat = mutation({
  args: { title: v.optional(v.string()) },
  returns: v.id("chats"),
  handler: async (ctx, { title }) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const clean = (title ?? "").trim().slice(0, MAX_TITLE_CHARS);
    return await ctx.db.insert("chats", { userId, title: clean === "" ? DEFAULT_CHAT_TITLE : clean, updatedAt: Date.now() });
  },
});

/** The caller's chats, most recently active first, each with a preview of its newest message. */
export const listChats = query({
  args: {},
  returns: v.array(
    v.object({ _id: v.id("chats"), title: v.string(), updatedAt: v.number(), lastMessage: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("chats")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_CHATS_LISTED);
    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        title: row.title,
        updatedAt: row.updatedAt,
        lastMessage: await previewOf(ctx, row._id),
      })),
    );
  },
});

/** The text of a chat's newest visible message, cut to the preview length. Null when there is none yet. */
async function previewOf(ctx: QueryCtx, chatId: Id<"chats">): Promise<string | null> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
    .order("desc")
    .take(PREVIEW_SCAN);
  // Empty text is a voice note still waiting for its transcript, or a reply not written yet.
  const newest = recent.find((m) => m.role !== "tool" && m.deletedAt === undefined && m.text !== "");
  return newest === undefined ? null : newest.text.slice(0, PREVIEW_CHARS);
}

/** One of the caller's chats by id, or null if it is gone or not theirs. The thread screen opens chats past the list's cap. */
export const getChat = query({
  args: { chatId: v.id("chats") },
  returns: v.union(v.null(), v.object({ _id: v.id("chats"), title: v.string(), updatedAt: v.number() })),
  handler: async (ctx, { chatId }) => {
    const userId = await requireUserId(ctx);
    const chat = await ctx.db.get("chats", chatId);
    if (chat === null || chat.userId !== userId) return null;
    return { _id: chat._id, title: chat.title, updatedAt: chat.updatedAt };
  },
});

/** Renames one of the caller's chats. Other chat fields, including the update time, stay as they are. */
export const renameChat = mutation({
  args: { chatId: v.id("chats"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, { chatId, title }) => {
    const userId = await requireUserId(ctx);
    await ownChat(ctx, userId, chatId);
    const clean = title.trim();
    if (clean === "" || clean.length > MAX_TITLE_CHARS) throw new Error(`Title must be 1-${MAX_TITLE_CHARS} characters`);
    await ctx.db.patch("chats", chatId, { title: clean });
    return null;
  },
});

/** Deletes a chat now and its messages in background batches. Entries it logged stay in the ledger. */
export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const userId = await requireUserId(ctx);
    await ownChat(ctx, userId, chatId);
    await ctx.db.delete("chats", chatId);
    await ctx.scheduler.runAfter(0, internal.chats.purgeMessages, { chatId });
    return null;
  },
});

/** Deletes one batch of a deleted chat's messages and reschedules itself until none are left. */
export const purgeMessages = internalMutation({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .take(PURGE_BATCH);
    for (const row of rows) await ctx.db.delete("messages", row._id);
    if (rows.length === PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.chats.purgeMessages, { chatId });
    return null;
  },
});

/** One chat's messages, newest first, a page at a time. */
export const listMessages = query({
  args: { chatId: v.id("chats"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(messageViewValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, { chatId, paginationOpts }) => {
    const userId = await requireUserId(ctx);
    await ownChat(ctx, userId, chatId);
    const result = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .order("desc")
      .paginate(paginationOpts);
    const live = result.page.filter((m) => m.deletedAt === undefined);
    const page = await Promise.all(
      live.map(async (m) => {
        const image = m.attachments.find((a) => a.kind === "image");
        return {
          _id: m._id,
          _creationTime: m._creationTime,
          chatId: m.chatId,
          role: m.role,
          text: m.text,
          attachments: m.attachments,
          draftIds: m.draftIds,
          entryIds: m.entryIds ?? [],
          status: m.status ?? "done",
          logAction: m.logAction,
          imageUrl: image === undefined ? null : await ctx.storage.getUrl(image.storageId),
        };
      }),
    );
    return { ...result, page };
  },
});

/** A message stored under a submission id, if any. */
async function messageBySubmission(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  submissionId: string,
): Promise<Doc<"messages"> | null> {
  return await ctx.db
    .query("messages")
    .withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", submissionId))
    .first();
}

/** Most replies to one user message a lookup reads. Regenerate hides the old one, so the live reply is the newest. */
const MAX_REPLIES_READ = 5;

/** The live (not regenerated away) assistant replies to one user message, oldest first. */
async function liveReplies(ctx: QueryCtx | MutationCtx, userMessageId: Id<"messages">): Promise<Doc<"messages">[]> {
  const rows = await ctx.db
    .query("messages")
    .withIndex("by_answersMessageId", (q) => q.eq("answersMessageId", userMessageId))
    .order("desc")
    .take(MAX_REPLIES_READ);
  return rows.filter((row) => row.deletedAt === undefined).reverse();
}

/** The finished (or stopped) turn for a submission id, so a retried send returns it without calling the model. */
export const findTurn = internalQuery({
  args: { userId: v.string(), submissionId: v.string() },
  returns: v.union(turnResultValidator, v.null()),
  handler: async (ctx, { userId, submissionId }): Promise<TurnResult | null> => {
    const user = await messageBySubmission(ctx, userId, submissionId);
    const reply = await messageBySubmission(ctx, userId, `${submissionId}:reply`);
    if (user === null || reply === null || reply.deletedAt !== undefined || !isFinished(reply)) return null;
    return {
      userMessageId: user._id,
      assistantMessageId: reply._id,
      reply: reply.text,
      draftIds: reply.draftIds,
      entryIds: reply.entryIds ?? [],
    };
  },
});

/**
 * Claims a turn before any model work: stores the user's message once per submission id, names an untitled chat
 * after it, bumps the chat, and opens the reply row the turn streams into. A second send while the first still runs
 * is refused; `retry` marks a failed turn, whose reply row is reset and reused.
 */
export const claimTurn = internalMutation({
  args: {
    userId: v.string(),
    chatId: v.id("chats"),
    submissionId: v.string(),
    text: v.string(),
    attachments: v.array(v.object({ kind: v.union(v.literal("image"), v.literal("audio")), storageId: v.id("_storage") })),
    audioPending: v.boolean(),
  },
  returns: claimValidator,
  handler: async (ctx, args): Promise<Claim> => {
    await assertLedgerWritable(ctx, args.userId);
    const chat = await ownChat(ctx, args.userId, args.chatId);
    const existing = await messageBySubmission(ctx, args.userId, args.submissionId);
    const replyKey = `${args.submissionId}:reply`;
    const now = Date.now();
    let claim: Omit<Claim, "replyId">;
    let reply: Doc<"messages"> | null = null;
    if (existing !== null) {
      const replies = await liveReplies(ctx, existing._id);
      const running = existing.claimedAt !== undefined && now - existing.claimedAt < TURN_LEASE_MS;
      if (running || replies.some(isFinished)) {
        throw new Error("This message is already being handled. Try again in a moment.");
      }
      await ctx.db.patch("messages", existing._id, { claimedAt: now });
      // The newest live reply is the failed attempt to reuse, if there is one.
      reply = replies.at(-1) ?? null;
      claim = { messageId: existing._id, claimedAt: now, retry: true, text: existing.text, audioPending: existing.audioPending === true };
    } else {
      const id = await ctx.db.insert("messages", {
        userId: args.userId,
        chatId: args.chatId,
        role: "user",
        text: args.text,
        attachments: args.attachments,
        toolCalls: [],
        draftIds: [],
        submissionId: args.submissionId,
        claimedAt: now,
        ...(args.audioPending ? { audioPending: true } : {}),
      });
      await ctx.db.patch("chats", chat._id, { title: titleFor(chat, args.text), updatedAt: now });
      claim = { messageId: id, claimedAt: now, retry: false, text: args.text, audioPending: args.audioPending };
    }

    // The reply row exists from the start so the client can show it filling in (A12).
    const fresh = { text: "", toolCalls: [], draftIds: [], entryIds: [], status: "streaming" as const, stopRequested: undefined, claimedAt: now };
    let replyId: Id<"messages">;
    if (reply === null) {
      replyId = await ctx.db.insert("messages", {
        userId: args.userId,
        chatId: args.chatId,
        role: "assistant",
        attachments: [],
        // A reply after a regenerate needs its own key, because the first reply keeps `${submissionId}:reply`.
        submissionId: existing === null ? replyKey : `${replyKey}:${now}`,
        answersMessageId: claim.messageId,
        ...fresh,
      });
    } else {
      replyId = reply._id;
      await ctx.db.patch("messages", replyId, fresh);
    }
    // A turn that dies without reaching its catch block (a crash or the action time limit) must not stream forever.
    await ctx.scheduler.runAfter(TURN_LEASE_MS, internal.chats.expireReply, { messageId: replyId, claimedAt: now });
    return { ...claim, replyId };
  },
});

/**
 * Starts a regenerate: hides the reply being replaced and opens a new streaming reply to the same user message.
 * The hidden reply keeps its text rows and entry links, so its undo cards still work.
 */
export const claimRegenerate = internalMutation({
  args: {
    userId: v.string(),
    chatId: v.id("chats"),
    userMessageId: v.id("messages"),
    userSubmissionId: v.string(),
    replyId: v.id("messages"),
  },
  returns: v.object({ replyId: v.id("messages"), claimedAt: v.number() }),
  handler: async (ctx, args): Promise<{ replyId: Id<"messages">; claimedAt: number }> => {
    await assertLedgerWritable(ctx, args.userId);
    await ownChat(ctx, args.userId, args.chatId);
    const old = await ctx.db.get("messages", args.replyId);
    if (old === null || old.userId !== args.userId || old.chatId !== args.chatId || old.deletedAt !== undefined || old.status === "streaming") {
      throw new Error("This reply can't be regenerated right now.");
    }
    const now = Date.now();
    await ctx.db.patch("messages", args.replyId, { deletedAt: now });
    await ctx.db.patch("messages", args.userMessageId, { claimedAt: now });
    const replyId = await ctx.db.insert("messages", {
      userId: args.userId,
      chatId: args.chatId,
      role: "assistant",
      text: "",
      attachments: [],
      toolCalls: [],
      // The hidden reply's cards move here now, so they survive even if this attempt fails.
      draftIds: old.draftIds,
      entryIds: old.entryIds ?? [],
      answersMessageId: args.userMessageId,
      submissionId: `${args.userSubmissionId}:reply:${now}`,
      status: "streaming",
      claimedAt: now,
    });
    await ctx.scheduler.runAfter(TURN_LEASE_MS, internal.chats.expireReply, { messageId: replyId, claimedAt: now });
    return { replyId, claimedAt: now };
  },
});

/** Loads a reply row only while the attempt that claimed it at `claimedAt` still owns it and it is streaming. */
async function ownedStream(ctx: MutationCtx, messageId: Id<"messages">, claimedAt: number): Promise<Doc<"messages"> | null> {
  const row = await ctx.db.get("messages", messageId);
  return row !== null && row.claimedAt === claimedAt && row.status === "streaming" ? row : null;
}

/**
 * Writes the reply text streamed so far. Returns true when the turn should stop: the user pressed stop, the chat was
 * deleted, or a newer attempt owns the row. Text that arrived after a stop is not written, so the reply ends where
 * the user saw it end.
 */
export const appendReply = internalMutation({
  args: { messageId: v.id("messages"), claimedAt: v.number(), text: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { messageId, claimedAt, text }) => {
    const row = await ownedStream(ctx, messageId, claimedAt);
    if (row === null || row.stopRequested === true) return true;
    if (row.text !== text) await ctx.db.patch("messages", messageId, { text });
    return false;
  },
});

/** Asks a streaming reply to stop. The turn keeps the text written so far and ends as `stopped`. */
export const stopMessage = mutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("messages", messageId);
    if (row === null || row.userId !== userId || row.role !== "assistant") throw new Error("Message not found");
    if (row.status === "streaming") await ctx.db.patch("messages", messageId, { stopRequested: true });
    return null;
  },
});

/** Marks a reply failed if the attempt that claimed it at `claimedAt` never finished it. */
export const expireReply = internalMutation({
  args: { messageId: v.id("messages"), claimedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { messageId, claimedAt }) => {
    if ((await ownedStream(ctx, messageId, claimedAt)) !== null) await ctx.db.patch("messages", messageId, { status: "failed" });
    return null;
  },
});

/** An untitled chat takes its first message text as its title. */
function titleFor(chat: Doc<"chats">, text: string): string {
  return chat.title === DEFAULT_CHAT_TITLE && text !== "" ? text.slice(0, MAX_TITLE_CHARS) : chat.title;
}

/** Saves a claimed voice message's full text once Groq has transcribed it, so a retry never pays for it again. */
export const saveTranscript = internalMutation({
  args: { userId: v.string(), messageId: v.id("messages"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, messageId, text }) => {
    const message = await ctx.db.get("messages", messageId);
    if (message === null || message.userId !== userId) throw new Error("Message not found");
    await ctx.db.patch("messages", messageId, { text, audioPending: undefined });
    const chat = await ctx.db.get("chats", message.chatId);
    if (chat !== null) await ctx.db.patch("chats", chat._id, { title: titleFor(chat, text) });
    return null;
  },
});

/**
 * Frees a failed turn's claim so the client can retry it right away, and marks its reply failed with the text it
 * reached. A voice message with no transcript yet is removed together with its empty reply.
 */
export const releaseTurn = internalMutation({
  args: { userId: v.string(), messageId: v.id("messages"), replyId: v.id("messages"), claimedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, messageId, replyId, claimedAt }) => {
    const message = await ctx.db.get("messages", messageId);
    if (message === null || message.userId !== userId) return null;
    const reply = await ownedStream(ctx, replyId, claimedAt);
    // Nothing ran yet for a message still waiting on its transcript, so it leaves no empty bubble behind.
    if (message.audioPending === true) {
      await ctx.db.delete("messages", messageId);
      if (reply !== null) await ctx.db.delete("messages", replyId);
      return null;
    }
    if (message.claimedAt === claimedAt) await ctx.db.patch("messages", messageId, { claimedAt: undefined });
    if (reply !== null) await ctx.db.patch("messages", replyId, { status: "failed", stopRequested: undefined });
    return null;
  },
});

/** Entries and drafts an earlier, failed attempt at this turn already wrote, with a reply describing them. */
export const priorTurnWrites = internalQuery({
  args: { userId: v.string(), submissionId: v.string() },
  returns: v.object({ reply: v.string(), draftIds: v.array(v.id("drafts")), entryIds: v.array(v.id("entries")) }),
  handler: async (ctx, { userId, submissionId }) => {
    // Every write of a turn uses a `${submissionId}:...` key, so one index range finds them all.
    const prefix = `${submissionId}:`;
    const end = `${prefix}\uffff`;
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).gte("submissionId", prefix).lt("submissionId", end))
      .take(MAX_DAY_ENTRIES);
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).gte("submissionId", prefix).lt("submissionId", end))
      .take(MAX_PRIOR_DRAFTS);
    const names = [...new Set(entries.map((row) => row.foodName))];
    const parts = [
      ...(names.length === 0 ? [] : [`Part of this was saved before an error: ${names.join(", ")}.`]),
      ...(drafts.length === 0 ? [] : ["A card is waiting for you to check."]),
      "Send the rest again if anything is missing.",
    ];
    return {
      reply: entries.length === 0 && drafts.length === 0 ? "" : parts.join(" "),
      draftIds: drafts.map((row) => row._id),
      entryIds: entries.map((row) => row._id),
    };
  },
});

/**
 * Ends a turn: writes the reply's final text, tool calls and card links, and marks it done or stopped. A stop that
 * landed after the last streamed write still wins, keeping the text the user saw. Only the attempt that claimed the
 * row writes; a stale one changes nothing and gets null. Returns the reply as stored.
 */
export const finishReply = internalMutation({
  args: {
    userId: v.string(),
    messageId: v.id("messages"),
    claimedAt: v.number(),
    status: v.union(v.literal("done"), v.literal("stopped")),
    text: v.string(),
    toolCalls: v.array(toolCallRecordValidator),
    draftIds: v.array(v.id("drafts")),
    entryIds: v.array(v.id("entries")),
    logAction: v.optional(logActionValidator),
  },
  returns: v.union(v.null(), v.object({ text: v.string(), status: v.union(v.literal("done"), v.literal("stopped")) })),
  handler: async (ctx, args) => {
    await assertLedgerWritable(ctx, args.userId);
    const row = await ownedStream(ctx, args.messageId, args.claimedAt);
    if (row === null || row.userId !== args.userId) return null;
    const final = row.stopRequested === true ? { text: row.text, status: "stopped" as const } : { text: args.text, status: args.status };
    await ctx.db.patch("messages", args.messageId, {
      ...final,
      toolCalls: args.toolCalls,
      draftIds: args.draftIds,
      entryIds: args.entryIds,
      logAction: args.logAction,
      stopRequested: undefined,
    });
    // The chat may have been deleted mid-turn; then the purge job removes this message too.
    const chat = await ctx.db.get("chats", row.chatId);
    if (chat !== null) await ctx.db.patch("chats", chat._id, { updatedAt: Date.now() });
    else await ctx.scheduler.runAfter(0, internal.chats.purgeMessages, { chatId: row.chatId });
    return final;
  },
});

const contextValidator = v.object({
  localDate: v.string(),
  slot: mealSlotValidator,
  history: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string() })),
  entries: v.array(
    v.object({ entryId: v.id("entries"), slot: mealSlotValidator, foodName: v.string(), grams: v.number(), kcal: v.number() }),
  ),
  userFoods: v.array(v.string()),
});
type TurnContext = Infer<typeof contextValidator>;

/** D12 context for one turn: recent chat history, today's live entries (current revisions) and the user's foods. */
export const turnContext = internalQuery({
  args: { userId: v.string(), chatId: v.id("chats") },
  returns: contextValidator,
  handler: async (ctx, { userId, chatId }): Promise<TurnContext> => {
    await ownChat(ctx, userId, chatId);
    const day = await resolveLocalDay(ctx, userId, Date.now());
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .order("desc")
      .take(HISTORY_WINDOW * HISTORY_READ_FACTOR);
    // Hidden (regenerated) replies are dropped before the window is cut, so they can't push the question out.
    const history = recent
      .filter((m) => m.deletedAt === undefined)
      .slice(0, HISTORY_WINDOW)
      .reverse()
      // A reply still streaming (this turn's own) or one that failed was never a finished answer.
      .flatMap((m) => {
        if (m.role === "tool" || !isFinished(m)) return [];
        // A photo sent without words still shows in history, so the model knows this turn's image came with it.
        const text = m.text === "" ? (m.attachments.length > 0 ? PHOTO_HISTORY_TEXT : "") : m.text;
        return text === "" ? [] : [{ role: m.role, text: text.slice(0, AI_INPUT_LIMITS.historyEntryChars) }];
      });
    const live = await ctx.db
      .query("entries")
      .withIndex("by_userId_and_localDate_and_status", (q) =>
        q.eq("userId", userId).eq("localDate", day.localDate).eq("status", "live"),
      )
      .take(MAX_DAY_ENTRIES);
    const entries = live
      .sort((a, b) => a.loggedAt - b.loggedAt)
      .map((row) => ({
        entryId: row._id,
        slot: row.slot,
        foodName: row.foodName,
        grams: roundTo(row.grams, 0),
        kcal: roundTo(row.nutrients.kcal, 0),
      }));
    const userFoods = (await userFoodsOf(ctx, userId)).slice(0, MAX_CONTEXT_USER_FOODS).map((food) => food.name);
    return { localDate: day.localDate, slot: day.slot, history, entries, userFoods };
  },
});

const changedEntryValidator = v.object({
  entry_id: v.id("entries"),
  food: v.string(),
  grams: v.number(),
  kcal: v.number(),
  slot: mealSlotValidator,
  date: v.string(),
});

/** Describes a revision for the model: the new head's id, food, grams and kcal from `foods` × grams. */
function describeRevision(row: Doc<"entries">): Infer<typeof changedEntryValidator> {
  return {
    entry_id: row._id,
    food: row.foodName,
    grams: roundTo(row.grams, 0),
    kcal: roundTo(row.nutrients.kcal, 0),
    slot: row.slot,
    date: row.localDate,
  };
}

/**
 * D8 `edit_entry`: writes a new revision (createdBy "ai") through the slice 3 entries code. Amounts arrive as
 * quantity + unit and become grams through the portion resolver; nutrients are recomputed from `foods`.
 */
export const applyEdit = internalMutation({
  args: {
    userId: v.string(),
    submissionId: v.string(),
    entryId: v.string(),
    foodId: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.union(v.string(), v.null())),
    slot: v.optional(mealSlotValidator),
    localDate: v.optional(v.string()),
  },
  returns: changedEntryValidator,
  handler: async (ctx, args) => {
    const entryId = ctx.db.normalizeId("entries", args.entryId);
    const head = entryId === null ? null : await ctx.db.get("entries", entryId);
    if (entryId === null || head === null || head.userId !== args.userId) throw new Error("Unknown entry_id");

    let foodId: Id<"foods"> | undefined;
    if (args.foodId !== undefined) {
      const id = ctx.db.normalizeId("foods", args.foodId);
      const food = id === null ? null : await ctx.db.get("foods", id);
      if (id === null || food === null || !isVisibleFood(food, args.userId)) throw new Error("Unknown food_id");
      foodId = id;
    }
    let grams: number | undefined;
    if (args.quantity !== undefined) {
      const food = await ctx.db.get("foods", foodId ?? head.foodId);
      if (food === null) throw new Error("Unknown food");
      const portion = await resolveFoodPortion(ctx, food, args.quantity, args.unit ?? null, await userMeasuresOf(ctx, args.userId));
      if (portion.status !== "resolved") throw new Error(`Cannot turn that amount into grams (${portion.reason}). Ask the user for grams.`);
      grams = portion.grams;
    }
    const revisionId = await editEntryAs(
      ctx,
      args.userId,
      {
        submissionId: args.submissionId,
        entryId,
        ...(grams === undefined ? {} : { grams }),
        ...(foodId === undefined ? {} : { foodId }),
        ...(args.slot === undefined ? {} : { slot: args.slot }),
        ...(args.localDate === undefined ? {} : { localDate: args.localDate }),
      },
      "ai",
    );
    const row = await ctx.db.get("entries", revisionId);
    if (row === null) throw new Error("Revision is missing");
    return describeRevision(row);
  },
});

/** D8 `delete_entry`: writes a deleted revision (createdBy "ai"). Undo is `entries.undoRevision` on the returned id. */
export const applyDelete = internalMutation({
  args: { userId: v.string(), submissionId: v.string(), entryId: v.string() },
  returns: changedEntryValidator,
  handler: async (ctx, args) => {
    const entryId = ctx.db.normalizeId("entries", args.entryId);
    const head = entryId === null ? null : await ctx.db.get("entries", entryId);
    if (entryId === null || head === null || head.userId !== args.userId) throw new Error("Unknown entry_id");
    const revisionId = await deleteEntryAs(ctx, args.userId, args.submissionId, entryId, "ai");
    const row = await ctx.db.get("entries", revisionId);
    if (row === null) throw new Error("Revision is missing");
    return describeRevision(row);
  },
});

/** D8 correction tools and the Log this offer. The chat cannot log food; Compose does that. */
const CHAT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "edit_entry",
      description: "Change a logged entry: amount (quantity + unit), food_id, slot or date. Use entry ids from context.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["entry_id"],
        properties: {
          entry_id: { type: "string" },
          food_id: { type: "string" },
          quantity: { type: "number" },
          unit: { type: ["string", "null"] },
          slot: { type: "string", enum: ["breakfast", "lunch", "snack", "dinner"] },
          date: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_entry",
      description: "Remove a logged entry the user says is wrong or did not happen.",
      parameters: { type: "object", additionalProperties: false, required: ["entry_id"], properties: { entry_id: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "offer_log",
      description: "Call when the user wants to log food. Shows a Log this button that opens Compose with this text. You cannot log food yourself.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: { type: "string", description: "What to log, in the user's words" } },
      },
    },
  },
  ...LOOKUP_TOOLS,
];

/** Tools for a regenerated reply: the earlier reply already made its log changes, so they can't run twice. */
const REGENERATE_TOOLS: ToolDefinition[] = CHAT_TOOLS.filter(
  (tool) => tool.function.name !== "edit_entry" && tool.function.name !== "delete_entry",
);
/** Told to the model when it rewrites a reply, so it doesn't promise changes it can no longer make. */
const REGENERATE_NOTE =
  "You are rewriting your last reply. Any log changes it made are already saved and can't be repeated; only answer again.";

/** System prompt for one turn, carrying the D12 context. */
function systemPrompt(context: TurnContext): string {
  const entries = context.entries.length === 0
    ? "(none yet)"
    : context.entries.map((e) => `- ${e.entryId} | ${e.slot} | ${e.foodName} | ${e.grams} g | ${e.kcal} kcal`).join("\n");
  return [
    "You are Polo, the coach in Stride, a nutrition tracker. Replies are short and plain.",
    "Fix or remove logged foods with edit_entry or delete_entry, using the entry ids below.",
    "You cannot log food. If the user wants to log something, call offer_log and tell them to tap Log this.",
    "When the user sends a photo, describe what you see and its rough nutrition if asked. You cannot log it; the app shows a Log this button.",
    "Only quote calorie numbers that tool results or the entry list give. Never work out nutrients yourself.",
    `Today is ${context.localDate}. The current meal slot is ${context.slot}.`,
    `Today's entries (id | slot | food | grams | kcal):\n${entries}`,
    `The user's own foods: ${context.userFoods.length === 0 ? "(none)" : context.userFoods.join(", ")}.`,
  ].join("\n");
}

/** Caps a tool result for storage on the message. */
function capJson(value: JsonValue): string {
  const json = JSON.stringify(value);
  return json.length > MAX_TOOL_RESULT_CHARS ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…` : json;
}

/** The reply row a turn streams into, and the claim time that proves this attempt still owns it. */
type ReplyTarget = { messageId: Id<"messages">; claimedAt: number };

/** Writes a streaming reply to its row in batches (A12) and reports when the user asked it to stop. */
class ReplyStream {
  /** Everything streamed so far, across model steps. */
  text = "";
  /** The text last written to the row: what the user has seen. A stopped reply ends here. */
  shown = "";
  private lastFlush = 0;
  private paragraph = false;
  private stopped = false;

  constructor(
    private readonly ctx: ActionCtx,
    private readonly target: ReplyTarget,
  ) {}

  /** Adds streamed text and writes it once enough has built up. True means stop the stream. */
  async push(text: string): Promise<boolean> {
    // An empty push is the stream's idle tick: it writes buffered text that is due and checks for a stop.
    if (text === "") return Date.now() - this.lastFlush >= STREAM_FLUSH_MS ? await this.flush() : false;
    if (this.paragraph && this.text !== "") this.text += "\n\n";
    this.paragraph = false;
    this.text += text;
    const due = this.text.length - this.shown.length >= STREAM_FLUSH_CHARS || Date.now() - this.lastFlush >= STREAM_FLUSH_MS;
    return due ? await this.flush() : false;
  }

  /** Writes the text so far and checks for a stop. True means stop. */
  async flush(): Promise<boolean> {
    if (this.stopped) return true;
    this.lastFlush = Date.now();
    this.stopped = await this.ctx.runMutation(internal.chats.appendReply, { ...this.target, text: this.text });
    if (!this.stopped) this.shown = this.text;
    return this.stopped;
  }

  /** Starts the next model step's text on a new paragraph. */
  nextStep(): void {
    this.paragraph = true;
  }
}

/** A photo sent in a chat turn: its storage id, a URL the model can fetch, and the words sent with it ("" for none). */
type PhotoInput = { storageId: Id<"_storage">; url: string; text: string };

/** The photo turn's user message: the words sent with the image, or a question when there are none. */
function photoMessage(photo: PhotoInput): ChatMessage {
  const parts: ContentPart[] = [
    { type: "text", text: photo.text === "" ? PHOTO_QUESTION : photo.text },
    { type: "image_url", image_url: { url: photo.url } },
  ];
  return { role: "user", content: parts };
}

/**
 * Runs one chat turn: luna with the chat tools, in a bounded loop, streaming text and executing ledger tools as it
 * goes. A photo turn uses the photo model instead and only discusses the image; the reply offers Log this for it.
 */
async function runChatTurn(
  ctx: ActionCtx,
  userId: string,
  chatId: Id<"chats">,
  submissionId: string,
  target: ReplyTarget,
  photo?: PhotoInput,
  regenerating = false,
): Promise<Turn> {
  const context: TurnContext = await ctx.runQuery(internal.chats.turnContext, { userId, chatId });
  const system = systemPrompt(context);
  const tools = regenerating ? REGENERATE_TOOLS : CHAT_TOOLS;
  const messages: ChatMessage[] = [
    { role: "system", content: regenerating ? `${system}\n${REGENERATE_NOTE}` : system },
    ...context.history.map((m): ChatMessage => ({ role: m.role, content: m.text })),
  ];
  // The newest history entry is this turn's own user message; the photo takes its place.
  if (photo !== undefined) {
    if (messages.at(-1)?.role !== "user") throw new Error("Photo message is missing");
    messages[messages.length - 1] = photoMessage(photo);
  }
  const model = photo === undefined ? PIPELINE_MODEL : PHOTO_MODEL;
  const toolCalls: ToolCallRecord[] = [];
  const draftIds: Id<"drafts">[] = [];
  const entryIds: Id<"entries">[] = [];
  const seen: SeenFoods = new Map();
  const notes: string[] = [];
  let offered: LogAction | undefined;
  // A photo's Log this always opens Compose with that photo; a text turn's Log this carries the food the model named.
  const logAction = (): LogAction | undefined =>
    photo === undefined ? offered : { storageId: photo.storageId, ...(photo.text === "" ? {} : { text: photo.text }) };
  const stream = new ReplyStream(ctx, target);
  const stopped = (): Turn => ({ reply: stream.shown, toolCalls, draftIds, entryIds, stopped: true, logAction: logAction() });

  for (let i = 0; i < MAX_CHAT_ITERATIONS; i++) {
    // A stop pressed while tools ran ends the turn before the next model call.
    if (i > 0 && (await stream.flush())) return stopped();
    stream.nextStep();
    const reply = await streamOpenRouter(
      ctx,
      userId,
      { model, maxTokens: CHAT_MAX_TOKENS, messages, tools },
      (text) => stream.push(text),
    );
    if (reply.stopped) return stopped();
    if (reply.toolCalls.length === 0) {
      return { reply: stream.text, toolCalls, draftIds, entryIds, stopped: false, logAction: logAction() };
    }
    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });

    for (const [k, call] of reply.toolCalls.entries()) {
      // A tool-only stream never calls back with text, so a stop must be checked before each ledger write.
      if (await stream.flush()) return stopped();
      const args = parseToolArgs(call.function.arguments);
      const subId = `${submissionId}:${call.function.name}:${i}:${k}`;
      let result: JsonValue;
      try {
        if (call.function.name === "edit_entry" || call.function.name === "delete_entry") {
          if (typeof args.entry_id !== "string") throw new Error("entry_id must be a string");
          const changed = call.function.name === "delete_entry"
            ? await ctx.runMutation(internal.chats.applyDelete, { userId, submissionId: subId, entryId: args.entry_id })
            : await ctx.runMutation(internal.chats.applyEdit, {
                userId,
                submissionId: subId,
                entryId: args.entry_id,
                ...(typeof args.food_id === "string" ? { foodId: args.food_id } : {}),
                ...(typeof args.quantity === "number" ? { quantity: args.quantity } : {}),
                ...(typeof args.unit === "string" ? { unit: args.unit } : {}),
                ...(isSlot(args.slot) ? { slot: args.slot } : {}),
                ...(typeof args.date === "string" ? { localDate: args.date } : {}),
              });
          entryIds.push(changed.entry_id);
          notes.push(`${call.function.name === "delete_entry" ? "Removed" : "Updated"} ${changed.food}.`);
          result = { status: "ok", ...changed };
        } else if (call.function.name === "offer_log") {
          if (typeof args.text !== "string" || args.text.trim() === "") throw new Error("text must be the food to log");
          offered = { text: args.text.trim().slice(0, MAX_LOG_TEXT_CHARS) };
          result = { status: "button_shown" };
        } else {
          result = (await runLookupTool(ctx, userId, call.function.name, args, seen)) ?? { error: `Unknown tool ${call.function.name}` };
        }
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      toolCalls.push({ name: call.function.name, argsJson: call.function.arguments.slice(0, MAX_TOOL_RESULT_CHARS), resultJson: capJson(result) });
    }
  }
  const fallback = notes.length === 0 ? "Sorry, I couldn't finish that. Try again?" : notes.join(" ");
  return {
    reply: [stream.text, fallback].filter((part) => part !== "").join("\n\n"),
    toolCalls,
    draftIds,
    entryIds,
    stopped: false,
    logAction: logAction(),
  };
}

/** Refuses an empty or oversized message before any model work. */
function checkMessage(text: string, imageStorageId: Id<"_storage"> | undefined): void {
  assertMaxChars(text, AI_INPUT_LIMITS.messageChars, "message");
  if (text === "" && imageStorageId === undefined) throw new Error("Message is empty");
}

const SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

/** True when a value is one of the four meal slots. */
function isSlot(value: unknown): value is MealSlot {
  return SLOTS.some((slot) => slot === value);
}

/**
 * Sends one message to a chat and returns the reply. Text and voice (Groq Whisper) run a luna turn with the
 * ledger tools; a photo is discussed by the photo model and never logged. Same submissionId twice returns the first turn.
 */
export const sendMessage = action({
  args: {
    chatId: v.id("chats"),
    submissionId: v.string(),
    text: v.optional(v.string()),
    audio: v.optional(v.object({ data: v.string(), mimeType: v.optional(v.string()) })),
    imageStorageId: v.optional(v.id("_storage")),
  },
  returns: turnResultValidator,
  handler: async (ctx, args): Promise<TurnResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Unauthenticated");
    const userId = identity.subject;
    // Turn writes use `${submissionId}:...` keys, so a ':' in a client id could collide with another turn's keys.
    if (args.submissionId.length === 0 || args.submissionId.length > MAX_SUBMISSION_ID_CHARS || args.submissionId.includes(":")) {
      throw new Error(`submissionId must be 1-${MAX_SUBMISSION_ID_CHARS} characters with no ':'`);
    }
    const prior: TurnResult | null = await ctx.runQuery(internal.chats.findTurn, { userId, submissionId: args.submissionId });
    if (prior !== null) return prior;

    if (args.imageStorageId !== undefined) await requireOwnUpload(ctx, userId, args.imageStorageId);
    const typed = (args.text ?? "").trim();
    if (args.audio === undefined) checkMessage(typed, args.imageStorageId);
    // Claim before transcribing, so a concurrent duplicate is refused before it pays for a Groq call.
    const claim: Claim = await ctx.runMutation(internal.chats.claimTurn, {
      userId,
      chatId: args.chatId,
      submissionId: args.submissionId,
      text: typed,
      attachments: args.imageStorageId === undefined ? [] : [{ kind: "image", storageId: args.imageStorageId }],
      audioPending: args.audio !== undefined,
    });
    const userMessageId = claim.messageId;
    const target: ReplyTarget = { messageId: claim.replyId, claimedAt: claim.claimedAt };
    try {
      let text = claim.text;
      if (claim.audioPending) {
        if (args.audio === undefined) throw new Error("Send the voice note again.");
        text = [text, await transcribeAudio(ctx, userId, args.audio.data, args.audio.mimeType)].join(" ").trim();
        checkMessage(text, args.imageStorageId);
        await ctx.runMutation(internal.chats.saveTranscript, { userId, messageId: userMessageId, text });
      }
      const turn = await runTurn(ctx, userId, args, text, claim.retry, target);
      const stored: { text: string } | null = await ctx.runMutation(internal.chats.finishReply, {
        userId,
        ...target,
        status: turn.stopped ? "stopped" : "done",
        text: turn.reply,
        toolCalls: turn.toolCalls,
        draftIds: turn.draftIds,
        entryIds: turn.entryIds,
        logAction: turn.logAction,
      });
      return {
        userMessageId,
        assistantMessageId: claim.replyId,
        reply: stored?.text ?? turn.reply,
        draftIds: turn.draftIds,
        entryIds: turn.entryIds,
      };
    } catch (err) {
      await ctx.runMutation(internal.chats.releaseTurn, { userId, messageId: userMessageId, replyId: target.messageId, claimedAt: target.claimedAt });
      throw err;
    }
  },
});

/** The newest visible reply of a chat and the user message it answers. Refuses a photo turn or a reply still streaming. */
export const regenerateTarget = internalQuery({
  args: { userId: v.string(), chatId: v.id("chats") },
  returns: v.object({
    userMessageId: v.id("messages"),
    userSubmissionId: v.string(),
    replyId: v.id("messages"),
    draftIds: v.array(v.id("drafts")),
    entryIds: v.array(v.id("entries")),
  }),
  handler: async (ctx, { userId, chatId }) => {
    await ownChat(ctx, userId, chatId);
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .order("desc")
      .take(HISTORY_WINDOW);
    const reply = recent.find((m) => m.role === "assistant" && m.deletedAt === undefined);
    if (reply === undefined) throw new Error("Nothing to regenerate yet.");
    if (reply.status === "streaming") throw new Error("Wait for the reply to finish, then regenerate it.");
    const user = reply.answersMessageId === undefined ? null : await ctx.db.get("messages", reply.answersMessageId);
    if (user === null || user.userId !== userId || user.submissionId === undefined) throw new Error("Nothing to regenerate yet.");
    if (user.attachments.some((a) => a.kind === "image")) throw new Error("Photo replies can't be regenerated yet.");
    return { userMessageId: user._id, userSubmissionId: user.submissionId, replyId: reply._id, draftIds: reply.draftIds, entryIds: reply.entryIds ?? [] };
  },
});

/** Writes a new reply to the newest answer in a chat. The old reply is hidden; the entries it logged or edited stay. */
export const regenerate = action({
  args: { chatId: v.id("chats") },
  returns: regenerateResultValidator,
  handler: async (ctx, { chatId }): Promise<RegenerateResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const old: {
      userMessageId: Id<"messages">;
      userSubmissionId: string;
      replyId: Id<"messages">;
      draftIds: Id<"drafts">[];
      entryIds: Id<"entries">[];
    } = await ctx.runQuery(
      internal.chats.regenerateTarget,
      { userId, chatId },
    );
    const claim: { replyId: Id<"messages">; claimedAt: number } = await ctx.runMutation(internal.chats.claimRegenerate, {
      userId,
      chatId,
      userMessageId: old.userMessageId,
      userSubmissionId: old.userSubmissionId,
      replyId: old.replyId,
    });
    const target: ReplyTarget = { messageId: claim.replyId, claimedAt: claim.claimedAt };
    try {
      // The claim time keeps this attempt's tool writes apart from the replaced reply's.
      const turn = await runChatTurn(ctx, userId, chatId, `${old.userSubmissionId}:regen:${claim.claimedAt}`, target, undefined, true);
      const stored: { text: string } | null = await ctx.runMutation(internal.chats.finishReply, {
        userId,
        ...target,
        status: turn.stopped ? "stopped" : "done",
        text: turn.reply,
        toolCalls: turn.toolCalls,
        // The hidden reply's cards move to its replacement, so the entries it changed stay undoable from the chat.
        draftIds: [...new Set([...old.draftIds, ...turn.draftIds])],
        entryIds: [...new Set([...old.entryIds, ...turn.entryIds])],
        logAction: turn.logAction,
      });
      return { assistantMessageId: claim.replyId, reply: stored?.text ?? turn.reply };
    } catch (err) {
      await ctx.runMutation(internal.chats.releaseTurn, {
        userId,
        messageId: old.userMessageId,
        replyId: claim.replyId,
        claimedAt: claim.claimedAt,
      });
      throw err;
    }
  },
});

const searchHitValidator = v.object({
  chatId: v.id("chats"),
  title: v.string(),
  snippet: v.string(),
  messageId: v.id("messages"),
});
type SearchHit = Infer<typeof searchHitValidator>;

/** About SNIPPET_CHARS of a message, starting a little before the first place the search term appears. */
function snippetOf(text: string, term: string): string {
  const at = term === "" ? -1 : text.toLowerCase().indexOf(term);
  const start = at === -1 ? 0 : Math.max(0, at - SNIPPET_LEAD_CHARS);
  return text.slice(start, start + SNIPPET_CHARS);
}

/** The caller's chats whose messages match a search: one hit per chat, best match first. */
export const searchChats = query({
  args: { query: v.string() },
  returns: v.array(searchHitValidator),
  handler: async (ctx, args): Promise<SearchHit[]> => {
    const userId = await requireUserId(ctx);
    const phrase = args.query.trim();
    if (phrase === "") return [];
    const hits = await ctx.db
      .query("messages")
      .withSearchIndex("search_text", (q) => q.search("text", phrase).eq("userId", userId))
      .take(SEARCH_HITS);
    const term = (phrase.split(/\s+/)[0] ?? "").toLowerCase();
    const seen = new Set<Id<"chats">>();
    const results: SearchHit[] = [];
    for (const hit of hits) {
      if (hit.deletedAt !== undefined || hit.role === "tool" || seen.has(hit.chatId)) continue;
      const chat = await ctx.db.get("chats", hit.chatId);
      if (chat === null || chat.userId !== userId) continue;
      seen.add(hit.chatId);
      results.push({ chatId: chat._id, title: chat.title, snippet: snippetOf(hit.text, term), messageId: hit._id });
      if (results.length === MAX_SEARCH_CHATS) break;
    }
    return results;
  },
});

/**
 * The work of one claimed turn. A retry whose earlier attempt already wrote entries or drafts reports those instead
 * of asking the model again, because a new model run could log the same meal under a different key.
 */
async function runTurn(
  ctx: ActionCtx,
  userId: string,
  args: { chatId: Id<"chats">; submissionId: string; imageStorageId?: Id<"_storage"> },
  text: string,
  retry: boolean,
  target: ReplyTarget,
): Promise<Turn> {
  if (retry) {
    const prior: { reply: string; draftIds: Id<"drafts">[]; entryIds: Id<"entries">[] } = await ctx.runQuery(
      internal.chats.priorTurnWrites,
      { userId, submissionId: args.submissionId },
    );
    if (prior.reply !== "") {
      return { reply: prior.reply, toolCalls: [], draftIds: prior.draftIds, entryIds: prior.entryIds, stopped: false, logAction: undefined };
    }
  }
  const photo: PhotoInput | undefined =
    args.imageStorageId === undefined
      ? undefined
      : { storageId: args.imageStorageId, url: await imageUrl(ctx, args.imageStorageId), text };
  return await runChatTurn(ctx, userId, args.chatId, args.submissionId, target, photo);
}
