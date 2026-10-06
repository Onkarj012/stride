import { isLocalDate, roundNutrients, scaleNutrients } from "@stride/core";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { applyToDayTotals, MAX_DAY_ENTRIES } from "./day_totals";
import {
  createdByValidator,
  entrySourceValidator,
  mealSlotValidator,
  nutrientsValidator,
  revisionOpValidator,
} from "./ledger_validators";
import { localDateOrToday, requireUserId, resolveLocalDay } from "./time_zone";

/** Most items one `addEntries` call may write. */
export const MAX_BATCH = 50;
/** Largest single entry, in grams. Anything bigger is a parsing mistake. */
export const MAX_ENTRY_GRAMS = 5000;
const MAX_SUBMISSION_ID_LENGTH = 128;

type EntryRow = Omit<Doc<"entries">, "_id" | "_creationTime">;
type RevisionOp = Infer<typeof revisionOpValidator>;
type CreatedBy = Infer<typeof createdByValidator>;

/** The part of an entry a revision can change. Revision bookkeeping and authorship live outside it. */
type EntryContent = Pick<
  EntryRow,
  "localDate" | "timeZone" | "slot" | "loggedAt" | "foodId" | "foodName" | "grams" | "nutrients" | "source" | "confidence" | "flags"
> & { deletedAt?: number };

/** One item for `addEntries`. Clients send a food and grams; the server computes nutrients. */
export const newEntryValidator = v.object({
  foodId: v.id("foods"),
  grams: v.number(),
  source: entrySourceValidator,
  slot: v.optional(mealSlotValidator),
  localDate: v.optional(v.string()),
  loggedAt: v.optional(v.number()),
  confidence: v.optional(v.number()),
  flags: v.optional(v.array(v.string())),
});
export type NewEntry = Infer<typeof newEntryValidator>;

/** Who and what produced a batch of new entries. Slice 4's pipeline passes `ai` with its chat ids. */
export interface EntryAuthor {
  createdBy: CreatedBy;
  chatId?: Id<"chats">;
  messageId?: Id<"messages">;
}

/** Entry as the day view shows it: current revision, nutrients rounded once for this entry. */
const entryViewValidator = v.object({
  _id: v.id("entries"),
  revision: v.number(),
  localDate: v.string(),
  slot: mealSlotValidator,
  loggedAt: v.number(),
  foodId: v.id("foods"),
  foodName: v.string(),
  grams: v.number(),
  nutrients: nutrientsValidator,
  source: entrySourceValidator,
  confidence: v.number(),
  flags: v.array(v.string()),
  createdBy: createdByValidator,
});

/** Rejects empty or oversized client submission ids. */
function checkSubmissionId(submissionId: string): void {
  if (submissionId.length === 0 || submissionId.length > MAX_SUBMISSION_ID_LENGTH) {
    throw new Error(`submissionId must be 1-${MAX_SUBMISSION_ID_LENGTH} characters`);
  }
}

/** Rejects grams that are not a positive finite amount within `MAX_ENTRY_GRAMS`. */
function checkGrams(grams: number): void {
  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_ENTRY_GRAMS) {
    throw new Error(`grams must be above 0 and at most ${MAX_ENTRY_GRAMS}, got ${grams}`);
  }
}

/** Loads a food the user may log or throws, so an entry never points at a missing row or another user's food. */
async function requireFood(ctx: MutationCtx, foodId: Id<"foods">, userId: string): Promise<Doc<"foods">> {
  const food = await ctx.db.get("foods", foodId);
  if (food === null || (food.ownerUserId !== undefined && food.ownerUserId !== userId)) {
    throw new Error(`Unknown food: ${foodId}`);
  }
  return food;
}

/** Rows already written under a submission id, oldest first. */
async function submissionRows(ctx: MutationCtx, userId: string, submissionId: string, limit: number) {
  return await ctx.db
    .query("entries")
    .withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", submissionId))
    .take(limit);
}

/** Writes a batch of new entries with server-computed nutrients. Same submission id twice returns the first result. */
export async function insertEntries(
  ctx: MutationCtx,
  userId: string,
  submissionId: string,
  items: readonly NewEntry[],
  author: EntryAuthor,
): Promise<Id<"entries">[]> {
  checkSubmissionId(submissionId);
  const prior = await submissionRows(ctx, userId, submissionId, MAX_BATCH);
  if (prior.length > 0) {
    if (prior.some((row) => row.op !== "add")) throw new Error("submissionId already used for a different change");
    return prior.map((row) => row._id);
  }
  if (items.length === 0 || items.length > MAX_BATCH) throw new Error(`addEntries takes 1-${MAX_BATCH} items`);

  const now = Date.now();
  const ids: Id<"entries">[] = [];
  for (const item of items) {
    checkGrams(item.grams);
    const confidence = item.confidence ?? 1;
    if (!(confidence >= 0 && confidence <= 1)) throw new Error(`confidence must be within 0-1, got ${confidence}`);
    if (item.localDate !== undefined && !isLocalDate(item.localDate)) {
      throw new Error(`Not a YYYY-MM-DD date: ${item.localDate}`);
    }
    const loggedAt = item.loggedAt ?? now;
    if (!Number.isFinite(loggedAt)) throw new Error("loggedAt must be a finite timestamp");
    const food = await requireFood(ctx, item.foodId, userId);
    const day = await resolveLocalDay(ctx, userId, loggedAt);
    const row: EntryRow = {
      userId,
      localDate: item.localDate ?? day.localDate,
      timeZone: day.timeZone,
      slot: item.slot ?? day.slot,
      loggedAt,
      foodId: food._id,
      foodName: food.name,
      grams: item.grams,
      nutrients: scaleNutrients(food.per100g, item.grams),
      source: item.source,
      confidence,
      flags: item.flags ?? [],
      revision: 1,
      op: "add",
      status: "live",
      createdBy: author.createdBy,
      submissionId,
      ...(author.chatId === undefined ? {} : { chatId: author.chatId }),
      ...(author.messageId === undefined ? {} : { messageId: author.messageId }),
    };
    ids.push(await ctx.db.insert("entries", row));
    await applyToDayTotals(ctx, userId, row.localDate, row.nutrients, 1);
  }
  return ids;
}

/** The editable content of a revision row. */
function contentOf(row: Doc<"entries">): EntryContent {
  return {
    localDate: row.localDate,
    timeZone: row.timeZone,
    slot: row.slot,
    loggedAt: row.loggedAt,
    foodId: row.foodId,
    foodName: row.foodName,
    grams: row.grams,
    nutrients: row.nutrients,
    source: row.source,
    confidence: row.confidence,
    flags: row.flags,
    ...(row.deletedAt === undefined ? {} : { deletedAt: row.deletedAt }),
  };
}

/** Loads the caller's current revision of an entry. Older revisions are rejected so edits never fork history. */
async function loadHead(ctx: MutationCtx, userId: string, entryId: Id<"entries">): Promise<Doc<"entries">> {
  const entry = await ctx.db.get("entries", entryId);
  if (entry === null || entry.userId !== userId) throw new Error("Entry not found");
  if (entry.status === "superseded") throw new Error("Entry has a newer revision. Reload and retry.");
  return entry;
}

/** The revision already written for a retried edit, delete or undo, or null on first use of the submission id. */
async function replayedRevision(
  ctx: MutationCtx,
  userId: string,
  submissionId: string,
  op: RevisionOp,
  entryId: Id<"entries">,
): Promise<Id<"entries"> | null> {
  checkSubmissionId(submissionId);
  const [row, extra] = await submissionRows(ctx, userId, submissionId, 2);
  if (row === undefined) return null;
  if (extra !== undefined || row.op !== op || row.supersedes !== entryId) {
    throw new Error("submissionId already used for a different change");
  }
  return row._id;
}

/** Appends a revision on top of `head`, marks `head` superseded and moves the day totals. */
async function writeRevision(
  ctx: MutationCtx,
  head: Doc<"entries">,
  content: EntryContent,
  op: RevisionOp,
  submissionId: string,
  createdBy: CreatedBy,
): Promise<Id<"entries">> {
  const row: EntryRow = {
    ...content,
    userId: head.userId,
    revision: head.revision + 1,
    supersedes: head._id,
    op,
    status: content.deletedAt === undefined ? "live" : "deleted",
    createdBy,
    submissionId,
  };
  if (head.status === "live") await applyToDayTotals(ctx, head.userId, head.localDate, head.nutrients, -1);
  await ctx.db.patch("entries", head._id, { status: "superseded" });
  const id = await ctx.db.insert("entries", row);
  if (row.status === "live") await applyToDayTotals(ctx, row.userId, row.localDate, row.nutrients, 1);
  return id;
}

/** Logs one or more foods for the caller. Retrying with the same submissionId writes nothing new. */
export const addEntries = mutation({
  args: { submissionId: v.string(), items: v.array(newEntryValidator) },
  returns: v.array(v.id("entries")),
  handler: async (ctx, { submissionId, items }) => {
    const userId = await requireUserId(ctx);
    return await insertEntries(ctx, userId, submissionId, items, { createdBy: "user" });
  },
});

/** The changes an edit may make. Grams always come from the caller or a portion resolver, never from a model. */
export interface EntryEdit {
  submissionId: string;
  entryId: Id<"entries">;
  grams?: number;
  foodId?: Id<"foods">;
  slot?: Infer<typeof mealSlotValidator>;
  localDate?: string;
}

/** Writes an edit revision on behalf of `createdBy`. Shared by `editEntry` and the chat correction tools. */
export async function editEntryAs(
  ctx: MutationCtx,
  userId: string,
  edit: EntryEdit,
  createdBy: CreatedBy,
): Promise<Id<"entries">> {
  const { submissionId, entryId, grams, foodId, slot, localDate } = edit;
  const replayed = await replayedRevision(ctx, userId, submissionId, "edit", entryId);
  if (replayed !== null) return replayed;
  if (grams === undefined && foodId === undefined && slot === undefined && localDate === undefined) {
    throw new Error("editEntry needs at least one change");
  }
  const head = await loadHead(ctx, userId, entryId);
  if (head.status === "deleted") throw new Error("Entry is deleted. Undo the delete first.");
  if (grams !== undefined) checkGrams(grams);
  if (localDate !== undefined && !isLocalDate(localDate)) throw new Error(`Not a YYYY-MM-DD date: ${localDate}`);

  const content = contentOf(head);
  if (grams !== undefined || foodId !== undefined) {
    const food = await requireFood(ctx, foodId ?? head.foodId, userId);
    content.foodId = food._id;
    content.foodName = food.name;
    content.grams = grams ?? head.grams;
    content.nutrients = scaleNutrients(food.per100g, content.grams);
  }
  if (slot !== undefined) content.slot = slot;
  if (localDate !== undefined) content.localDate = localDate;
  return await writeRevision(ctx, head, content, "edit", submissionId, createdBy);
}

/** Writes a deleted revision on behalf of `createdBy`. Shared by `deleteEntry` and the chat correction tools. */
export async function deleteEntryAs(
  ctx: MutationCtx,
  userId: string,
  submissionId: string,
  entryId: Id<"entries">,
  createdBy: CreatedBy,
): Promise<Id<"entries">> {
  const replayed = await replayedRevision(ctx, userId, submissionId, "delete", entryId);
  if (replayed !== null) return replayed;
  const head = await loadHead(ctx, userId, entryId);
  if (head.status === "deleted") throw new Error("Entry is already deleted");
  return await writeRevision(ctx, head, { ...contentOf(head), deletedAt: Date.now() }, "delete", submissionId, createdBy);
}

/** Changes grams, food, slot or date of a live entry by writing a new revision. Returns the new revision id. */
export const editEntry = mutation({
  args: {
    submissionId: v.string(),
    entryId: v.id("entries"),
    grams: v.optional(v.number()),
    foodId: v.optional(v.id("foods")),
    slot: v.optional(mealSlotValidator),
    localDate: v.optional(v.string()),
  },
  returns: v.id("entries"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await editEntryAs(ctx, userId, args, "user");
  },
});

/** Soft-deletes a live entry by writing a deleted revision. Returns the new revision id. */
export const deleteEntry = mutation({
  args: { submissionId: v.string(), entryId: v.id("entries") },
  returns: v.id("entries"),
  handler: async (ctx, { submissionId, entryId }) => {
    const userId = await requireUserId(ctx);
    return await deleteEntryAs(ctx, userId, submissionId, entryId, "user");
  },
});

/** Reverts an entry's latest change by writing a revision equal to the one before it. Undoing an add deletes it. */
export const undoRevision = mutation({
  args: { submissionId: v.string(), entryId: v.id("entries") },
  returns: v.id("entries"),
  handler: async (ctx, { submissionId, entryId }) => {
    const userId = await requireUserId(ctx);
    const replayed = await replayedRevision(ctx, userId, submissionId, "undo", entryId);
    if (replayed !== null) return replayed;
    const head = await loadHead(ctx, userId, entryId);
    let content: EntryContent;
    if (head.supersedes === undefined) {
      content = { ...contentOf(head), deletedAt: Date.now() };
    } else {
      const previous = await ctx.db.get("entries", head.supersedes);
      if (previous === null) throw new Error("Previous revision is missing");
      content = contentOf(previous);
    }
    return await writeRevision(ctx, head, content, "undo", submissionId, "user");
  },
});

/** The caller's live entries for one day (default today), current revisions only, ordered by time eaten. */
export const entriesForDay = query({
  args: { localDate: v.optional(v.string()) },
  returns: v.array(entryViewValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const localDate = await localDateOrToday(ctx, userId, args.localDate);
    const rows = await ctx.db
      .query("entries")
      .withIndex("by_userId_and_localDate_and_status", (q) =>
        q.eq("userId", userId).eq("localDate", localDate).eq("status", "live"),
      )
      .take(MAX_DAY_ENTRIES);
    return rows
      .sort((a, b) => a.loggedAt - b.loggedAt)
      .map((row) => ({
        _id: row._id,
        revision: row.revision,
        localDate: row.localDate,
        slot: row.slot,
        loggedAt: row.loggedAt,
        foodId: row.foodId,
        foodName: row.foodName,
        grams: row.grams,
        nutrients: roundNutrients(row.nutrients),
        source: row.source,
        confidence: row.confidence,
        flags: row.flags,
        createdBy: row.createdBy,
      }));
  },
});
