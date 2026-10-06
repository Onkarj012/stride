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
import { extractItems, ITEM_JSON_SCHEMA, PARSE_RULES, parseItem } from "./pipeline/extract";
import { imageUrl, runPipeline } from "./pipeline/log";
import { callOpenRouter, PIPELINE_MODEL, type ChatMessage, type JsonValue, type ToolDefinition } from "./pipeline/openrouter";
import { resolveFoodPortion, userFoodsOf, userMeasuresOf, type LogResult } from "./pipeline/resolve";
import { LOOKUP_TOOLS, parseToolArgs, runLookupTool, type SeenFoods } from "./pipeline/tools";
import { requireUserId, resolveLocalDay } from "./time_zone";
import { assertLedgerWritable } from "./users";

/** Title a chat gets until its first message names it. */
export const DEFAULT_CHAT_TITLE = "New chat";
/** Most chats `listChats` returns. */
export const MAX_CHATS_LISTED = 50;
/** Most earlier messages the model sees each turn (D12). */
export const HISTORY_WINDOW = 20;
/** Most model calls in one chat turn. Each may run tools; the turn ends when the model stops calling them. */
export const MAX_CHAT_ITERATIONS = 4;

const MAX_SUBMISSION_ID_CHARS = 96;
const MAX_TITLE_CHARS = 60;
const MAX_CONTEXT_USER_FOODS = 30;
const MAX_TOOL_RESULT_CHARS = 4_000;
const PURGE_BATCH = 100;
const CHAT_MAX_TOKENS = 800;
/** How long a started turn holds its message. Matches the Convex action time limit, so a crashed turn frees it. */
const TURN_LEASE_MS = 10 * 60_000;
const MAX_PRIOR_DRAFTS = 10;

const messageViewValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  chatId: v.id("chats"),
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
  text: v.string(),
  attachments: v.array(v.object({ kind: v.union(v.literal("image"), v.literal("audio")), storageId: v.id("_storage") })),
  draftIds: v.array(v.id("drafts")),
  entryIds: v.array(v.id("entries")),
});

const toolCallRecordValidator = v.object({ name: v.string(), argsJson: v.string(), resultJson: v.optional(v.string()) });
type ToolCallRecord = Infer<typeof toolCallRecordValidator>;
/** What a turn's work produced, before the reply message is stored. */
type Turn = { reply: string; toolCalls: ToolCallRecord[]; draftIds: Id<"drafts">[]; entryIds: Id<"entries">[] };

/** What one chat turn produced: both messages, the reply text, and the drafts and entries its cards point at. */
const turnResultValidator = v.object({
  userMessageId: v.id("messages"),
  assistantMessageId: v.id("messages"),
  reply: v.string(),
  draftIds: v.array(v.id("drafts")),
  entryIds: v.array(v.id("entries")),
});
type TurnResult = Infer<typeof turnResultValidator>;

/** A claimed turn: its user message, whether an earlier attempt ran, and the text saved so far. */
const claimValidator = v.object({ messageId: v.id("messages"), retry: v.boolean(), text: v.string(), audioPending: v.boolean() });
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

/** The caller's chats, most recently active first. */
export const listChats = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("chats"), title: v.string(), updatedAt: v.number() })),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("chats")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_CHATS_LISTED);
    return rows.map((row) => ({ _id: row._id, title: row.title, updatedAt: row.updatedAt }));
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
    return {
      ...result,
      page: result.page.map((m) => ({
        _id: m._id,
        _creationTime: m._creationTime,
        chatId: m.chatId,
        role: m.role,
        text: m.text,
        attachments: m.attachments,
        draftIds: m.draftIds,
        entryIds: m.entryIds ?? [],
      })),
    };
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

/** The finished turn for a submission id, so a retried send returns it without calling the model. */
export const findTurn = internalQuery({
  args: { userId: v.string(), submissionId: v.string() },
  returns: v.union(turnResultValidator, v.null()),
  handler: async (ctx, { userId, submissionId }): Promise<TurnResult | null> => {
    const user = await messageBySubmission(ctx, userId, submissionId);
    const reply = await messageBySubmission(ctx, userId, `${submissionId}:reply`);
    if (user === null || reply === null) return null;
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
 * after it, and bumps the chat. A second send while the first still runs is refused; `retry` marks a failed turn.
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
    const now = Date.now();
    if (existing !== null) {
      const reply = await messageBySubmission(ctx, args.userId, `${args.submissionId}:reply`);
      const running = existing.claimedAt !== undefined && now - existing.claimedAt < TURN_LEASE_MS;
      if (reply !== null || running) throw new Error("This message is already being handled. Try again in a moment.");
      await ctx.db.patch("messages", existing._id, { claimedAt: now });
      return { messageId: existing._id, retry: true, text: existing.text, audioPending: existing.audioPending === true };
    }
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
    return { messageId: id, retry: false, text: args.text, audioPending: args.audioPending };
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

/** Frees a failed turn's claim so the client can retry it right away. A voice message with no transcript yet is removed. */
export const releaseTurn = internalMutation({
  args: { userId: v.string(), messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { userId, messageId }) => {
    const message = await ctx.db.get("messages", messageId);
    if (message === null || message.userId !== userId) return null;
    // Nothing ran yet for a message still waiting on its transcript, so it leaves no empty bubble behind.
    if (message.audioPending === true) await ctx.db.delete("messages", messageId);
    else await ctx.db.patch("messages", messageId, { claimedAt: undefined });
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

/** Stores the assistant's reply with its tool calls and card links, once per turn. */
export const insertAssistantMessage = internalMutation({
  args: {
    userId: v.string(),
    chatId: v.id("chats"),
    submissionId: v.string(),
    text: v.string(),
    toolCalls: v.array(toolCallRecordValidator),
    draftIds: v.array(v.id("drafts")),
    entryIds: v.array(v.id("entries")),
  },
  returns: v.id("messages"),
  handler: async (ctx, args): Promise<Id<"messages">> => {
    await assertLedgerWritable(ctx, args.userId);
    const chat = await ctx.db.get("chats", args.chatId);
    const replyKey = `${args.submissionId}:reply`;
    const existing = await messageBySubmission(ctx, args.userId, replyKey);
    if (existing !== null) return existing._id;
    const id = await ctx.db.insert("messages", {
      userId: args.userId,
      chatId: args.chatId,
      role: "assistant",
      text: args.text,
      attachments: [],
      toolCalls: args.toolCalls,
      draftIds: args.draftIds,
      entryIds: args.entryIds,
      submissionId: replyKey,
    });
    // The chat may have been deleted mid-turn; then the purge job removes this message too.
    if (chat !== null) await ctx.db.patch("chats", chat._id, { updatedAt: Date.now() });
    else await ctx.scheduler.runAfter(0, internal.chats.purgeMessages, { chatId: args.chatId });
    return id;
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
      .take(HISTORY_WINDOW);
    const history = recent
      .reverse()
      .flatMap((m) =>
        m.role === "tool" || m.text === "" ? [] : [{ role: m.role, text: m.text.slice(0, AI_INPUT_LIMITS.historyEntryChars) }],
      );
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

/** D8 correction tools plus logging. `add_entry` takes the same item fields as extraction, so it runs the same pipeline. */
const CHAT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "add_entry",
      description: "Log one food the user ate. Call once per food. Amounts as the user said them; never grams you guessed.",
      parameters: ITEM_JSON_SCHEMA,
    },
  },
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
  ...LOOKUP_TOOLS,
];

/** System prompt for one turn, carrying the D12 context. */
function systemPrompt(context: TurnContext): string {
  const entries = context.entries.length === 0
    ? "(none yet)"
    : context.entries.map((e) => `- ${e.entryId} | ${e.slot} | ${e.foodName} | ${e.grams} g | ${e.kcal} kcal`).join("\n");
  return [
    "You are Polo, the coach in Stride, a nutrition tracker. Replies are short and plain.",
    "Log foods with add_entry. Fix or remove logged foods with edit_entry or delete_entry, using the entry ids below.",
    PARSE_RULES,
    "Only quote calorie numbers that tool results or the entry list give. Never work out nutrients yourself.",
    "If an add_entry result needs confirmation, tell the user to check the card.",
    `Today is ${context.localDate}. The current meal slot is ${context.slot}.`,
    `Today's entries (id | slot | food | grams | kcal):\n${entries}`,
    `The user's own foods: ${context.userFoods.length === 0 ? "(none)" : context.userFoods.join(", ")}.`,
  ].join("\n");
}

/** Tool-result JSON for a pipeline run, so the model can describe it. */
function logSummary(result: LogResult): JsonValue {
  const lines = result.lines.map((line) => ({ food: line.foodName ?? line.text, grams: line.grams, kcal: line.kcal, needs: line.reasons }));
  if (result.kind === "committed") return { status: "logged", entry_ids: result.entryIds, items: lines };
  if (result.kind === "draft") return { status: "needs_confirmation", draft_id: result.draftId, items: lines };
  return { status: "nothing_to_log" };
}

/** A plain reply for results the model did not describe (photo turns, or a turn that ran out of iterations). */
function describeResult(result: LogResult): string {
  if (result.kind === "empty") return "I couldn't find any food in that.";
  const list = result.lines
    .map((line) => `${line.foodName ?? line.text}${line.kcal === null ? "" : ` (${line.kcal} kcal)`}`)
    .join(", ");
  return result.kind === "committed" ? `Logged ${list}.` : `Please check the card before I log: ${list}.`;
}

/** Caps a tool result for storage on the message. */
function capJson(value: JsonValue): string {
  const json = JSON.stringify(value);
  return json.length > MAX_TOOL_RESULT_CHARS ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…` : json;
}

/** Ids of entries a pipeline result committed, or of the draft it opened. */
function collect(result: LogResult, draftIds: Id<"drafts">[], entryIds: Id<"entries">[]): void {
  if (result.kind === "committed") entryIds.push(...result.entryIds);
  if (result.kind === "draft") draftIds.push(result.draftId);
}

/** Runs one text turn: luna with the chat tools, in a bounded loop, executing ledger tools as it goes. */
async function runChatTurn(
  ctx: ActionCtx,
  userId: string,
  chatId: Id<"chats">,
  messageId: Id<"messages">,
  submissionId: string,
): Promise<Turn> {
  const context: TurnContext = await ctx.runQuery(internal.chats.turnContext, { userId, chatId });
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(context) },
    ...context.history.map((m): ChatMessage => ({ role: m.role, content: m.text })),
  ];
  const toolCalls: ToolCallRecord[] = [];
  const draftIds: Id<"drafts">[] = [];
  const entryIds: Id<"entries">[] = [];
  const seen: SeenFoods = new Map();
  const notes: string[] = [];

  for (let i = 0; i < MAX_CHAT_ITERATIONS; i++) {
    const reply = await callOpenRouter(ctx, userId, { model: PIPELINE_MODEL, maxTokens: CHAT_MAX_TOKENS, messages, tools: CHAT_TOOLS });
    if (reply.toolCalls.length === 0) return { reply: reply.content ?? "", toolCalls, draftIds, entryIds };
    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });

    // Every add_entry in one model step becomes one pipeline submission, so a meal lands as one card.
    const adds = reply.toolCalls.filter((call) => call.function.name === "add_entry");
    let addResult: JsonValue = { status: "nothing_to_log" };
    if (adds.length > 0) {
      const items = adds.flatMap((call) => {
        const item = parseItem({ ...parseToolArgs(call.function.arguments), fromPhoto: false });
        return item === null ? [] : [item];
      });
      const result = await runPipeline(ctx, userId, {
        submissionId: `${submissionId}:add:${i}`,
        inputKind: "chat",
        items,
        chatId,
        messageId,
      });
      collect(result, draftIds, entryIds);
      notes.push(describeResult(result));
      addResult = logSummary(result);
    }

    for (const [k, call] of reply.toolCalls.entries()) {
      const args = parseToolArgs(call.function.arguments);
      const subId = `${submissionId}:${call.function.name}:${i}:${k}`;
      let result: JsonValue;
      try {
        if (call.function.name === "add_entry") result = addResult;
        else if (call.function.name === "edit_entry" || call.function.name === "delete_entry") {
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
  return { reply: notes.length === 0 ? "Sorry, I couldn't finish that. Try again?" : notes.join(" "), toolCalls, draftIds, entryIds };
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
 * ledger tools; a photo runs the extraction pipeline on the image. Same submissionId twice returns the first turn.
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
    try {
      let text = claim.text;
      if (claim.audioPending) {
        if (args.audio === undefined) throw new Error("Send the voice note again.");
        text = [text, await transcribeAudio(ctx, userId, args.audio.data, args.audio.mimeType)].join(" ").trim();
        checkMessage(text, args.imageStorageId);
        await ctx.runMutation(internal.chats.saveTranscript, { userId, messageId: userMessageId, text });
      }
      const turn = await runTurn(ctx, userId, args, text, userMessageId, claim.retry);
      const assistantMessageId: Id<"messages"> = await ctx.runMutation(internal.chats.insertAssistantMessage, {
        userId,
        chatId: args.chatId,
        submissionId: args.submissionId,
        text: turn.reply,
        toolCalls: turn.toolCalls,
        draftIds: turn.draftIds,
        entryIds: turn.entryIds,
      });
      return { userMessageId, assistantMessageId, reply: turn.reply, draftIds: turn.draftIds, entryIds: turn.entryIds };
    } catch (err) {
      await ctx.runMutation(internal.chats.releaseTurn, { userId, messageId: userMessageId });
      throw err;
    }
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
  userMessageId: Id<"messages">,
  retry: boolean,
): Promise<Turn> {
  if (retry) {
    const prior: { reply: string; draftIds: Id<"drafts">[]; entryIds: Id<"entries">[] } = await ctx.runQuery(
      internal.chats.priorTurnWrites,
      { userId, submissionId: args.submissionId },
    );
    if (prior.reply !== "") return { reply: prior.reply, toolCalls: [], draftIds: prior.draftIds, entryIds: prior.entryIds };
  }
  if (args.imageStorageId === undefined) return await runChatTurn(ctx, userId, args.chatId, userMessageId, args.submissionId);
  const today = await ctx.runQuery(internal.pipeline.resolve.logContext, { userId });
  const items = await extractItems(ctx, userId, {
    text,
    today: today.localDate,
    slot: today.slot,
    imageUrl: await imageUrl(ctx, args.imageStorageId),
  });
  const result = await runPipeline(ctx, userId, {
    submissionId: `${args.submissionId}:photo`,
    inputKind: "photo",
    items,
    chatId: args.chatId,
    messageId: userMessageId,
  });
  const draftIds: Id<"drafts">[] = [];
  const entryIds: Id<"entries">[] = [];
  collect(result, draftIds, entryIds);
  return { reply: describeResult(result), toolCalls: [], draftIds, entryIds };
}
