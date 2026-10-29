import { expandSets, instantAt, isLocalDate, normalizeExerciseName } from "@stride/core";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isRecord, type JsonValue } from "./pipeline/openrouter";
import { requireUserId, resolveLocalDay, resolveTimeZone } from "./time_zone";
import { assertLedgerWritable } from "./users";

export { parse } from "./pipeline/workout_parse";

const MAX_WORKOUT_TEXT_CHARS = 12_000;
const MAX_ITEMS = 30;
const MAX_SETS_PER_ITEM = 30;

/** Rejects invalid cardio measurements before they enter a committed workout. */
function cardioHasInvalidMeasurements(cardio: { durationMin?: number; distanceKm?: number; reportedKcal?: number; speedKmh?: number; inclinePct?: number } | undefined): boolean {
  if (cardio === undefined) return true;
  return (cardio.durationMin !== undefined && (!Number.isInteger(cardio.durationMin) || cardio.durationMin < 1 || cardio.durationMin > 1440)) ||
    (cardio.distanceKm !== undefined && (!Number.isFinite(cardio.distanceKm) || cardio.distanceKm < 0 || cardio.distanceKm > 500)) ||
    (cardio.reportedKcal !== undefined && (!Number.isFinite(cardio.reportedKcal) || cardio.reportedKcal < 0 || cardio.reportedKcal > 5000)) ||
    (cardio.speedKmh !== undefined && (!Number.isFinite(cardio.speedKmh) || cardio.speedKmh < 0 || cardio.speedKmh > 50)) ||
    (cardio.inclinePct !== undefined && (!Number.isFinite(cardio.inclinePct) || cardio.inclinePct < 0 || cardio.inclinePct > 40));
}

/** Requires a valid cardio measurement and at least one duration or distance. */
function cardioHasInvalidValues(cardio: { durationMin?: number; distanceKm?: number; reportedKcal?: number; speedKmh?: number; inclinePct?: number } | undefined): boolean {
  return cardioHasInvalidMeasurements(cardio) || (cardio?.durationMin === undefined && cardio?.distanceKm === undefined);
}

/** Rebuilds review problems from editable set and cardio values. */
function workoutItemProblems(item: WorkoutItem): string[] {
  if (item.kind === "cardio") {
    if (cardioHasInvalidValues(item.cardio)) return ["Add a valid duration or distance and check the cardio values."];
    return [];
  }
  if (item.sets.length === 0) return ["Add weights and reps."];
  if (item.sets.some((set) => set.weightKg === undefined || set.reps === undefined)) return ["Add both a weight and reps for every set."];
  if (item.sets.some((set) => !Number.isFinite(set.weightKg) || set.weightKg! < 0 || set.weightKg! > 1000 || !Number.isInteger(set.reps) || set.reps! < 1 || set.reps! > 1000)) return ["Check the weight and reps values."];
  return [];
}

/** Validates item counts and set values that exceed the allowed range. */
function itemsExceedLimits(items: WorkoutItem[]): boolean {
  return items.length > MAX_ITEMS || items.some((item) => item.sets.length > MAX_SETS_PER_ITEM) || items.reduce((sum, item) => sum + item.sets.length, 0) > 200;
}

const workoutItemValidator = v.object({
  key: v.string(), name: v.string(), kind: v.union(v.literal("strength"), v.literal("cardio")),
  exerciseId: v.optional(v.id("exercises")), candidateIds: v.array(v.id("exercises")),
  sets: v.array(v.object({ setId: v.optional(v.id("sets")), weightKg: v.optional(v.number()), reps: v.optional(v.number()), weightBasis: v.optional(v.union(v.literal("total"), v.literal("each"))) })),
  cardio: v.optional(v.object({ cardioId: v.optional(v.id("cardio")), durationMin: v.optional(v.number()), distanceKm: v.optional(v.number()), reportedKcal: v.optional(v.number()), speedKmh: v.optional(v.number()), inclinePct: v.optional(v.number()) })),
  problems: v.array(v.string()),
});
const workoutDraftValidator = v.object({
  _id: v.id("workout_drafts"), _creationTime: v.number(), userId: v.string(), submissionId: v.string(),
  status: v.union(v.literal("pending"), v.literal("committed"), v.literal("discarded")),
  source: v.union(v.literal("text"), v.literal("coach"), v.literal("copy"), v.literal("manual")), inputText: v.string(),
  mode: v.union(v.literal("new"), v.literal("append"), v.literal("revise")), targetSessionId: v.optional(v.id("workout_sessions")),
  needsTarget: v.boolean(), localDate: v.string(), startTime: v.optional(v.string()), durationMin: v.optional(v.number()),
  items: v.array(workoutItemValidator), createdAt: v.number(),
});
type WorkoutItem = Infer<typeof workoutItemValidator>;
type LoggedExerciseMap = Map<string, { exerciseId: Id<"exercises">; kind: "strength" | "cardio" }>;
type NumberedItem = { from: number; name: string; sets: WorkoutItem["sets"]; cardio?: WorkoutItem["cardio"] };
type RawItem = { name: string; kind: "strength" | "cardio"; weights: number[]; reps: number[]; unit: "kg" | "lb"; basis?: "total" | "each"; bodyweight: boolean; durationMin?: number; distanceKm?: number; reportedKcal?: number; speedKmh?: number; inclinePct?: number; from?: number | null };
type RawWorkout = { items: RawItem[]; durationMin?: number; date?: string; startTime?: string; targetIntent: "append" | "new" | "unclear" };

/** Returns the shared validation error for malformed model output. */
function invalidWorkoutOutput(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "BAD_WORKOUT_OUTPUT", message: "The workout could not be read. Try again or enter it by hand." });
}

/** Reads one optional finite number from model output. */
function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidWorkoutOutput();
  return value;
}

/** Validates one model item and keeps only fields used by workout logging. */
function parseRawItem(value: unknown): RawItem {
  if (!isRecord(value) || typeof value.name !== "string" || (value.kind !== "strength" && value.kind !== "cardio") ||
    !Array.isArray(value.weights) || !Array.isArray(value.reps) || value.weights.length > MAX_SETS_PER_ITEM ||
    value.reps.length > MAX_SETS_PER_ITEM || (value.unit !== "kg" && value.unit !== "lb") ||
    (value.basis !== null && value.basis !== "each" && value.basis !== "total") || typeof value.bodyweight !== "boolean") {
    throw invalidWorkoutOutput();
  }
  if (value.weights.some((item) => typeof item !== "number" || !Number.isFinite(item)) ||
    value.reps.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw invalidWorkoutOutput();
  if (value.kind === "strength" && (value.weights.some((weight) => weight < 0 || weight > 1000) ||
    value.reps.some((reps) => !Number.isInteger(reps) || reps < 1 || reps > 1000))) throw invalidWorkoutOutput();
  if (value.from !== null && value.from !== undefined &&
    (typeof value.from !== "number" || !Number.isInteger(value.from) || value.from < 0 || value.from >= MAX_ITEMS)) {
    throw invalidWorkoutOutput();
  }
  const metrics = {
    durationMin: optionalNumber(value.durationMin), distanceKm: optionalNumber(value.distanceKm),
    reportedKcal: optionalNumber(value.reportedKcal), speedKmh: optionalNumber(value.speedKmh),
    inclinePct: optionalNumber(value.inclinePct),
  };
  if (value.kind === "cardio" && cardioHasInvalidMeasurements(metrics)) throw invalidWorkoutOutput();
  return {
    name: value.name, kind: value.kind,
    weights: value.weights.filter((item): item is number => typeof item === "number"),
    reps: value.reps.filter((item): item is number => typeof item === "number"), unit: value.unit,
    ...(value.basis === "each" || value.basis === "total" ? { basis: value.basis } : {}),
    bodyweight: value.bodyweight, ...metrics,
    ...(typeof value.from === "number" ? { from: value.from } : {}),
  };
}

/** Validates the structured workout model response before using any of its values. */
function parseRawWorkout(raw: unknown): RawWorkout {
  if (!isRecord(raw) || !Array.isArray(raw.items) || raw.items.length > MAX_ITEMS ||
    (raw.targetIntent !== "append" && raw.targetIntent !== "new" && raw.targetIntent !== "unclear")) {
    throw invalidWorkoutOutput();
  }
  const items = raw.items.map(parseRawItem);
  const durationMin = optionalNumber(raw.durationMin);
  const date = raw.date === null || raw.date === undefined ? undefined :
    typeof raw.date === "string" && isLocalDate(raw.date) ? raw.date : (() => { throw invalidWorkoutOutput(); })();
  const startTime = raw.startTime === null || raw.startTime === undefined ? undefined :
    typeof raw.startTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.startTime) ? raw.startTime : (() => { throw invalidWorkoutOutput(); })();
  if (durationMin !== undefined && (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1440)) throw invalidWorkoutOutput();
  return { items, targetIntent: raw.targetIntent, ...(durationMin === undefined ? {} : { durationMin }), ...(date === undefined ? {} : { date }), ...(startTime === undefined ? {} : { startTime }) };
}
export const WORKOUT_RESPONSE_FORMAT: { [key: string]: JsonValue } = {
  type: "json_schema",
  json_schema: {
    name: "workout_log",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items", "durationMin", "date", "startTime", "targetIntent"],
      properties: {
        items: { type: "array", maxItems: 30, items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "kind", "weights", "reps", "unit", "basis", "bodyweight", "durationMin", "distanceKm", "reportedKcal", "speedKmh", "inclinePct", "from"],
          properties: {
            name: { type: "string" },
            kind: { type: "string", enum: ["strength", "cardio"] },
            weights: { type: "array", items: { type: "number" }, maxItems: 30 },
            reps: { type: "array", items: { type: "number" }, maxItems: 30 },
            unit: { type: "string", enum: ["kg", "lb"] },
            basis: { type: ["string", "null"], enum: ["total", "each", null] },
            bodyweight: { type: "boolean" },
            durationMin: { type: ["number", "null"] },
            distanceKm: { type: ["number", "null"] },
            reportedKcal: { type: ["number", "null"] },
            speedKmh: { type: ["number", "null"] },
            inclinePct: { type: ["number", "null"] },
            from: { type: ["integer", "null"] },
          },
        } },
        durationMin: { type: ["integer", "null"] },
        date: { type: ["string", "null"] },
        startTime: { type: ["string", "null"] },
        targetIntent: { type: "string", enum: ["append", "new", "unclear"] },
      },
    },
  },
};

/** Numbers saved strength and cardio items in one stable exercise order. */
function numberSessionItems(sets: Doc<"sets">[], cardio: Doc<"cardio">[], names: Map<Id<"exercises">, string>): NumberedItem[] {
  const exerciseIds = [...new Set([...sets.map((set) => set.exerciseId), ...cardio.map((row) => row.exerciseId)])];
  return exerciseIds.map((exerciseId, from) => ({
    from,
    name: names.get(exerciseId) ?? "Exercise",
    sets: sets.filter((set) => set.exerciseId === exerciseId).sort((a, b) => a.setIndex - b.setIndex).map((set) => ({ setId: set._id, weightKg: set.weightKg, reps: set.reps, weightBasis: set.weightBasis })),
    ...(cardio.find((row) => row.exerciseId === exerciseId) === undefined ? {} : { cardio: (() => { const row = cardio.find((candidate) => candidate.exerciseId === exerciseId)!; return { cardioId: row._id, durationMin: row.durationMin, distanceKm: row.distanceKm, reportedKcal: row.reportedKcal, speedKmh: row.speedKmh, inclinePct: row.inclinePct }; })() }),
  }));
}

/** Reads saved workout items and exercise names for parse context or revision mapping. */
async function sessionItems(ctx: QueryCtx | MutationCtx, sessionId: Id<"workout_sessions">): Promise<NumberedItem[]> {
  const sets = await ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(200);
  const cardio = await ctx.db.query("cardio").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(100);
  const exerciseIds = [...new Set([...sets.map((set) => set.exerciseId), ...cardio.map((row) => row.exerciseId)])];
  const exercises = await Promise.all(exerciseIds.map((id) => ctx.db.get("exercises", id)));
  const names = new Map(exerciseIds.map((id, index) => [id, exercises[index]?.name ?? "Exercise"]));
  return numberSessionItems(sets, cardio, names);
}

/** Numbers the current draft items so the model can carry ids across corrections. */
function numberDraftItems(items: WorkoutItem[]): NumberedItem[] {
  return items.map((item, from) => ({
    from, name: item.name, sets: item.sets,
    ...(item.cardio === undefined ? {} : { cardio: item.cardio }),
  }));
}

/** Builds copied draft items from one saved session without changing their order. */
function copiedWorkoutItems(
  exerciseIds: Id<"exercises">[],
  exercises: Map<Id<"exercises">, Doc<"exercises">>,
  sets: Doc<"sets">[],
  cardio: Doc<"cardio">[],
  copy: "names" | "everything",
): WorkoutItem[] {
  const items: WorkoutItem[] = [];
  for (const exerciseId of exerciseIds) {
    const exercise = exercises.get(exerciseId);
    if (exercise === undefined) continue;
    const group = sets.filter((set) => set.exerciseId === exerciseId);
    const cardioRows = cardio.filter((row) => row.exerciseId === exerciseId);
    const kind = exercise.category === "cardio" ? "cardio" : "strength";
    if (kind === "cardio" && copy === "everything") {
      for (const row of cardioRows) items.push({
        key: `copy-${items.length + 1}`, name: exercise.name, kind, exerciseId,
        candidateIds: [exerciseId], sets: [],
        cardio: { durationMin: row.durationMin, distanceKm: row.distanceKm, reportedKcal: row.reportedKcal, speedKmh: row.speedKmh, inclinePct: row.inclinePct },
        problems: [],
      });
      continue;
    }
    const firstCardio = cardioRows[0];
    const cardioValue = kind === "cardio" && copy === "everything" && firstCardio !== undefined
      ? { cardio: { durationMin: firstCardio.durationMin, distanceKm: firstCardio.distanceKm, reportedKcal: firstCardio.reportedKcal, speedKmh: firstCardio.speedKmh, inclinePct: firstCardio.inclinePct } }
      : {};
    items.push({
      key: `copy-${items.length + 1}`, name: exercise.name, kind, exerciseId,
      candidateIds: [exerciseId],
      sets: copy === "everything" ? group.map((set) => ({ weightKg: set.weightKg, reps: set.reps, ...(set.weightBasis === undefined ? {} : { weightBasis: set.weightBasis }) })) : [],
      ...cardioValue,
      problems: copy === "names" ? [kind === "cardio" ? "Add a duration or distance." : "Add weights and reps."] : [],
    });
  }
  return items;
}

/** Reads settings, local time and the caller's open session before parsing. */
export const parseContext = internalQuery({
  args: { userId: v.string(), sessionId: v.optional(v.id("workout_sessions")), draftId: v.optional(v.id("workout_drafts")) },
  handler: async (ctx, { userId, sessionId, draftId }) => {
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    const timeZone = await resolveTimeZone(ctx, userId);
    const now = Date.now();
    const day = await resolveLocalDay(ctx, userId, now);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const open = await ctx.db.query("workout_sessions").withIndex("by_userId_and_endedAt_and_deletedAt_and_startedAt", (q) => q.eq("userId", userId).eq("endedAt", undefined).eq("deletedAt", undefined)).order("desc").take(1);
    const pendingDraft = draftId === undefined ? null : await ctx.db.get("workout_drafts", draftId);
    if (draftId !== undefined && (pendingDraft === null || pendingDraft.userId !== userId || pendingDraft.status !== "pending")) throw new ConvexError({ code: "NOT_FOUND", message: "Pending workout draft not found" });
    const requestedSessionId = sessionId ?? pendingDraft?.targetSessionId;
    const session = requestedSessionId === undefined ? open[0] ?? null : await ctx.db.get("workout_sessions", requestedSessionId);
    if (requestedSessionId !== undefined && (session === null || session.userId !== userId || session.deletedAt !== undefined)) throw new ConvexError({ code: "NOT_FOUND", message: "Workout not found" });
    const currentItems = pendingDraft !== null ? numberDraftItems(pendingDraft.items) : session === null ? [] : await sessionItems(ctx, session._id);
    const mode = pendingDraft?.mode ?? (session?.endedAt !== undefined ? "revise" : session !== null ? "append" : "new");
    return { enabled: settings?.plainWorkouts === true, timeZone, now, localDate: day.localDate, startTime: `${values.hour}:${values.minute}`, openSession: open[0] ?? null, session, mode, currentItems };
  },
});

/** Finds or creates a personal row, while keeping catalog and history matching separate. */
async function loggedExercises(ctx: MutationCtx, userId: string): Promise<LoggedExerciseMap> {
  const sets = await ctx.db.query("sets").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "live")).order("desc").take(200);
  const exercises = await Promise.all([...new Set(sets.map((set) => set.exerciseId))].map((id) => ctx.db.get("exercises", id)));
  const matches: LoggedExerciseMap = new Map();
  for (const exercise of exercises) {
    if (exercise === null || (exercise.ownerId !== undefined && exercise.ownerId !== userId)) continue;
    const kind = exercise.category === "cardio" ? "cardio" : "strength";
    matches.set(normalizeExerciseName(exercise.name), { exerciseId: exercise._id, kind });
  }
  return matches;
}

/** Finds a caller's exercise by exact personal, history, then catalog name matches. */
async function resolveExercise(ctx: MutationCtx, userId: string, name: string, kind: "strength" | "cardio", logged: LoggedExerciseMap): Promise<{ exerciseId?: Id<"exercises">; candidateIds: Id<"exercises">[] }> {
  const normalized = normalizeExerciseName(name);
  const own = await ctx.db.query("exercises").withIndex("by_ownerId_and_normalizedName", (q) => q.eq("ownerId", userId).eq("normalizedName", normalized)).unique();
  if (own !== null && own.category === kind) return { exerciseId: own._id, candidateIds: [own._id] };
  const prior = logged.get(normalized);
  if (prior?.kind === kind) return { exerciseId: prior.exerciseId, candidateIds: [prior.exerciseId] };
  const catalog = await ctx.db.query("exercises").withSearchIndex("search_name", (q) => q.search("name", name).eq("ownerId", undefined)).take(10);
  const candidates = catalog.filter((row) => row.ownerId === undefined && (kind === "cardio" ? row.category === "cardio" : row.category !== "cardio")).slice(0, 3);
  const exact = candidates.find((row) => normalizeExerciseName(row.name) === normalized);
  return { ...(exact === undefined ? {} : { exerciseId: exact._id }), candidateIds: candidates.map((row) => row._id) };
}

/** Saves one complete pending review after the model output has passed validation. */
export const saveParsedDraft = internalMutation({
  args: { userId: v.string(), submissionId: v.string(), text: v.string(), source: v.union(v.literal("text"), v.literal("coach")), localDate: v.string(), startTime: v.string(), raw: v.string(), draftId: v.optional(v.id("workout_drafts")), sessionId: v.optional(v.id("workout_sessions")), chatId: v.optional(v.id("chats")), messageId: v.optional(v.id("messages")) },
  returns: v.id("workout_drafts"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("workout_drafts").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", args.userId).eq("submissionId", args.submissionId)).unique();
    if (existing !== null) return existing._id;
    let value: unknown;
    try { value = JSON.parse(args.raw); } catch { throw new ConvexError({ code: "BAD_WORKOUT_OUTPUT", message: "The workout could not be read. Try again or enter it by hand." }); }
    const raw = parseRawWorkout(value);
    const timeZone = await resolveTimeZone(ctx, args.userId);
    const editedDraft = args.draftId === undefined ? null : await ctx.db.get("workout_drafts", args.draftId);
    if (args.draftId !== undefined && (editedDraft === null || editedDraft.userId !== args.userId || editedDraft.status !== "pending")) throw new ConvexError({ code: "NOT_FOUND", message: "Pending workout draft not found" });
    const targetId = args.sessionId ?? editedDraft?.targetSessionId;
    const target = targetId === undefined ? null : await ctx.db.get("workout_sessions", targetId);
    if (target !== null && (target.userId !== args.userId || target.deletedAt !== undefined)) throw new ConvexError({ code: "NOT_FOUND", message: "Workout not found" });
    const open = await ctx.db.query("workout_sessions").withIndex("by_userId_and_endedAt_and_deletedAt_and_startedAt", (q) => q.eq("userId", args.userId).eq("endedAt", undefined).eq("deletedAt", undefined)).order("desc").take(1);
    const targetSession = target ?? (raw.targetIntent === "append" ? open[0] ?? null : null);
    const mode: "new" | "append" | "revise" = editedDraft?.mode ?? (targetSession?.endedAt !== undefined ? "revise" : targetSession !== null ? "append" : "new");
    const needsTarget = target === null && open[0] !== undefined && raw.targetIntent === "unclear";
    const currentItems = editedDraft !== null ? numberDraftItems(editedDraft.items) : targetSession === null ? [] : await sessionItems(ctx, targetSession._id);
    const logged = await loggedExercises(ctx, args.userId);
    const items: WorkoutItem[] = [];
    for (const [index, item] of raw.items.entries()) {
      if (!isRecord(item) || typeof item.name !== "string" || item.name.trim() === "" || (item.kind !== "strength" && item.kind !== "cardio")) throw new ConvexError({ code: "BAD_WORKOUT_OUTPUT", message: "The workout could not be read. Try again or enter it by hand." });
      const name = item.name.trim().slice(0, 200);
      const match = await resolveExercise(ctx, args.userId, name, item.kind, logged);
      const problems: string[] = [];
      let sets: WorkoutItem["sets"] = [];
      let cardio: WorkoutItem["cardio"];
      if (item.kind === "strength") {
        const expanded = expandSets(Array.isArray(item.weights) ? item.weights as number[] : [], Array.isArray(item.reps) ? item.reps as number[] : [], { weightUnit: item.unit === "lb" ? "lb" : "kg", ...(item.basis === "each" || item.basis === "total" ? { weightBasis: item.basis } : {}), bodyweight: item.bodyweight === true });
        if (expanded.problem !== undefined) problems.push(expanded.problem);
        else sets = expanded.sets.slice(0, MAX_SETS_PER_ITEM);
      } else {
        const num = (key: "durationMin" | "distanceKm" | "reportedKcal" | "speedKmh" | "inclinePct") => {
          const value = item[key];
          return typeof value === "number" && Number.isFinite(value) ? value : undefined;
        };
        cardio = {
          ...(num("durationMin") === undefined ? {} : { durationMin: num("durationMin") }),
          ...(num("distanceKm") === undefined ? {} : { distanceKm: num("distanceKm") }),
          ...(num("reportedKcal") === undefined ? {} : { reportedKcal: num("reportedKcal") }),
          ...(num("speedKmh") === undefined ? {} : { speedKmh: num("speedKmh") }),
          ...(num("inclinePct") === undefined ? {} : { inclinePct: num("inclinePct") }),
        };
        if (cardio.durationMin === undefined && cardio.distanceKm === undefined) problems.push("Add a duration or distance.");
      }
      let setRows: WorkoutItem["sets"] = sets;
      let cardioContent = cardio;
      if (typeof item.from === "number") {
        const oldItem = currentItems[item.from];
        if (oldItem !== undefined && item.kind === "strength") {
          setRows = sets.map((set, setIndex) => {
            const oldSet = oldItem.sets[setIndex];
            return { ...set, ...(oldSet?.setId === undefined ? {} : { setId: oldSet.setId }), ...(set.weightBasis === undefined && oldSet?.weightBasis !== undefined ? { weightBasis: oldSet.weightBasis } : {}) };
          });
        }
        if (oldItem?.cardio?.cardioId !== undefined && item.kind === "cardio" && cardio !== undefined) {
          cardioContent = { ...cardio, cardioId: oldItem.cardio.cardioId };
        }
      }
      items.push({ key: `item-${index + 1}`, name, kind: item.kind, ...(match.exerciseId === undefined ? {} : { exerciseId: match.exerciseId }), candidateIds: match.candidateIds, sets: setRows, ...(cardioContent === undefined ? {} : { cardio: cardioContent }), problems });
    }
    if (items.reduce((sum, item) => sum + item.sets.length, 0) > 200) throw new ConvexError({ code: "LIMIT_REACHED", message: "A workout can contain at most 200 sets." });
    const id = args.draftId;
    const targetTimeZone = targetSession?.timeZone ?? timeZone;
    const targetStartTime = targetSession === null ? undefined : new Intl.DateTimeFormat("en-GB", { timeZone: targetTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(targetSession.startedAt));
    const date = raw.date ?? targetSession?.localDate ?? editedDraft?.localDate ?? args.localDate;
    if (!isLocalDate(date)) throw new ConvexError({ code: "BAD_WORKOUT_OUTPUT", message: "The workout date could not be read." });
    const startTime = raw.startTime ?? targetStartTime ?? editedDraft?.startTime ?? args.startTime;
    const durationMin = raw.durationMin ?? editedDraft?.durationMin ?? targetSession?.durationMin;
    const draft = {
      userId: args.userId,
      submissionId: args.submissionId,
      status: "pending" as const,
      source: args.source,
      inputText: args.text,
      ...(args.chatId === undefined ? {} : { chatId: args.chatId }),
      ...(args.messageId === undefined ? {} : { messageId: args.messageId }),
      mode,
      ...(targetSession === null ? {} : { targetSessionId: targetSession._id }),
      needsTarget,
      localDate: date,
      startTime,
      ...(durationMin === undefined ? {} : { durationMin }),
      items,
      createdAt: Date.now(),
    };
    if (id !== undefined) {
      const prior = await ctx.db.get("workout_drafts", id);
      if (prior === null || prior.userId !== args.userId || prior.status !== "pending") throw new ConvexError({ code: "NOT_FOUND", message: "Pending workout draft not found" });
      await ctx.db.patch("workout_drafts", id, { ...draft, submissionId: prior.submissionId });
      return id;
    }
    return await ctx.db.insert("workout_drafts", draft);
  },
});

/** Copies a saved workout into today's pending review. */
export const draftFromSession = mutation({
  args: { submissionId: v.string(), sessionId: v.id("workout_sessions"), copy: v.union(v.literal("names"), v.literal("everything")) }, returns: v.id("workout_drafts"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx); await assertLedgerWritable(ctx, userId);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings?.plainWorkouts !== true) throw new ConvexError({ code: "FEATURE_OFF", message: "Turn on Log workouts in words in Settings first." });
    const prior = await ctx.db.query("workout_drafts").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", args.submissionId)).unique();
    if (prior !== null) return prior._id;
    const session = await ctx.db.get("workout_sessions", args.sessionId);
    if (session === null || session.userId !== userId || session.deletedAt !== undefined) throw new ConvexError({ code: "NOT_FOUND", message: "Workout not found" });
    const timeZone = await resolveTimeZone(ctx, userId);
    const now = Date.now();
    const date = (await resolveLocalDay(ctx, userId, now)).localDate;
    const startTime = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now));
    const sets = await ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", session._id).eq("status", "live")).take(200);
    const cardio = await ctx.db.query("cardio").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", session._id).eq("status", "live")).take(100);
    const exerciseIds = [...new Set([...sets.map((set) => set.exerciseId), ...cardio.map((row) => row.exerciseId)])];
    const exerciseRows = await Promise.all(exerciseIds.map((id) => ctx.db.get("exercises", id)));
    const exercises = new Map(exerciseIds.flatMap((id, index) => {
      const exercise = exerciseRows[index];
      return exercise === null || exercise === undefined ? [] : [[id, exercise] as const];
    }));
    const items = copiedWorkoutItems(exerciseIds, exercises, sets, cardio, args.copy);
    return await ctx.db.insert("workout_drafts", { userId, submissionId: args.submissionId, status: "pending", source: "copy", inputText: "", mode: "new", needsTarget: false, localDate: date, startTime, ...(args.copy === "everything" && session.durationMin !== undefined ? { durationMin: session.durationMin } : {}), items, createdAt: now });
  },
});

/** Finds a prior draft by its idempotency key. */
export const findSubmission = internalQuery({
  args: { userId: v.string(), submissionId: v.string() },
  handler: async (ctx, args) => await ctx.db.query("workout_drafts").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", args.userId).eq("submissionId", args.submissionId)).unique(),
});

/** Creates a blank review for manual entry or AI failure recovery. */
export const blankDraft = mutation({
  args: { submissionId: v.string(), text: v.optional(v.string()), sessionId: v.optional(v.id("workout_sessions")) }, returns: v.id("workout_drafts"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx); await assertLedgerWritable(ctx, userId);
    const prior = await ctx.db.query("workout_drafts").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", args.submissionId)).unique();
    if (prior !== null) return prior._id;
    const timeZone = await resolveTimeZone(ctx, userId); const now = Date.now();
    const localDate = (await resolveLocalDay(ctx, userId, now)).localDate;
    const startTime = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now));
    const session = args.sessionId === undefined ? null : await ctx.db.get("workout_sessions", args.sessionId);
    if (session !== null && session.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Workout not found" });
    return await ctx.db.insert("workout_drafts", { userId, submissionId: args.submissionId, status: "pending", source: "manual", inputText: args.text ?? "", mode: session === null ? "new" : "append", ...(session === null ? {} : { targetSessionId: session._id }), needsTarget: false, localDate, startTime, items: [], createdAt: now });
  },
});

/** Returns a pending draft with its matched exercises and target session. */
export const draft = query({
  args: { draftId: v.id("workout_drafts") },
  handler: async (ctx, { draftId }) => {
    const userId = await requireUserId(ctx); const row = await ctx.db.get("workout_drafts", draftId);
    if (row === null || row.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Workout draft not found" });
    const ids = [...new Set(row.items.flatMap((item) => [...item.candidateIds, ...(item.exerciseId === undefined ? [] : [item.exerciseId])]))];
    const exercises = await Promise.all(ids.map(async (id) => await ctx.db.get("exercises", id)));
    const targetSession = row.targetSessionId === undefined ? null : await ctx.db.get("workout_sessions", row.targetSessionId);
    const openSessions = await ctx.db.query("workout_sessions").withIndex("by_userId_and_endedAt_and_deletedAt_and_startedAt", (q) => q.eq("userId", userId).eq("endedAt", undefined).eq("deletedAt", undefined)).order("desc").take(1);
    return { draft: row, exercises: exercises.filter((exercise): exercise is Doc<"exercises"> => exercise !== null && (exercise.ownerId === undefined || exercise.ownerId === userId)), targetSession, openSession: openSessions[0] ?? null };
  },
});

/** Lists the caller's pending reviews that were not made in a chat, newest first. */
export const pendingDrafts = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("workout_drafts"), localDate: v.string(), source: v.union(v.literal("text"), v.literal("coach"), v.literal("copy"), v.literal("manual")), itemCount: v.number() })),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Reads the newest 20 pending reviews, then keeps the non-chat ones, so chat reviews can use up part of the window.
    const rows = await ctx.db.query("workout_drafts").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "pending")).order("desc").take(20);
    return rows.filter((row) => row.chatId === undefined).slice(0, 5).map((row) => ({ _id: row._id, localDate: row.localDate, source: row.source, itemCount: row.items.length }));
  },
});

/** Replaces editable fields on a pending draft after validating the entire plate. */
export const updateDraft = mutation({
  args: { draftId: v.id("workout_drafts"), localDate: v.string(), startTime: v.string(), durationMin: v.union(v.number(), v.null()), needsTarget: v.boolean(), targetSessionId: v.union(v.id("workout_sessions"), v.null()), items: v.array(workoutItemValidator) }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx); await assertLedgerWritable(ctx, userId);
    const row = await ctx.db.get("workout_drafts", args.draftId);
    if (row === null || row.userId !== userId || row.status !== "pending") throw new ConvexError({ code: "NOT_FOUND", message: "Pending workout draft not found" });
    if (!isLocalDate(args.localDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.startTime) || (args.durationMin !== null && (!Number.isInteger(args.durationMin) || args.durationMin < 1 || args.durationMin > 1440)) || itemsExceedLimits(args.items)) throw new ConvexError({ code: "INVALID_DRAFT", message: "Check the date, time, duration and workout items." });
    const target = args.targetSessionId === null ? null : await ctx.db.get("workout_sessions", args.targetSessionId);
    if (target !== null && (target.userId !== userId || target.deletedAt !== undefined)) throw new ConvexError({ code: "NOT_FOUND", message: "Workout not found" });
    const mode = target === null ? "new" : row.mode === "revise" && target._id === row.targetSessionId ? "revise" : "append";
    const items = args.items.map((item) => ({ ...item, problems: workoutItemProblems(item) }));
    await ctx.db.patch("workout_drafts", row._id, { localDate: args.localDate, startTime: args.startTime, ...(args.durationMin === null ? { durationMin: undefined } : { durationMin: args.durationMin }), needsTarget: args.needsTarget, ...(target === null ? { targetSessionId: undefined } : { targetSessionId: target._id }), mode, items });
    return null;
  },
});

/** Creates a workout session and its complete set/cardio batch in one transaction. */
export const commitDraft = mutation({
  args: { draftId: v.id("workout_drafts"), submissionId: v.string() },
  returns: v.object({ sessionId: v.id("workout_sessions"), setIds: v.array(v.id("sets")), cardioIds: v.array(v.id("cardio")) }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx); await assertLedgerWritable(ctx, userId);
    const row = await ctx.db.get("workout_drafts", args.draftId);
    if (row === null || row.userId !== userId || row.status === "discarded") throw new ConvexError({ code: "NOT_FOUND", message: "Workout draft not found" });
    if (row.committedSubmissionId !== undefined) {
      if (row.committedSubmissionId !== args.submissionId || row.written === undefined) throw new Error("submissionId already used for another workout change");
      return { sessionId: row.written.sessionId, setIds: row.written.setRevisionIds, cardioIds: row.written.cardioRevisionIds };
    }
    if (row.status !== "pending" || row.needsTarget || row.items.some((item) => workoutItemProblems(item).length > 0)) throw new ConvexError({ code: "WORKOUT_NEEDS_REVIEW", message: "Fix every workout item and choose a target before saving." });
    const timeZone = await resolveTimeZone(ctx, userId);
    const startedAt = instantAt(row.localDate, row.startTime ?? "12:00", timeZone);
    let session = row.targetSessionId === undefined ? null : await ctx.db.get("workout_sessions", row.targetSessionId);
    if (session !== null && (session.userId !== userId || session.deletedAt !== undefined || (row.mode === "append" && session.endedAt !== undefined))) throw new ConvexError({ code: "INVALID_TARGET", message: "That workout can no longer be changed." });
    const createdSession = session === null;
    if (session === null) {
      const local = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(startedAt));
      if (local !== row.localDate) throw new ConvexError({ code: "INVALID_DATE", message: "The workout date does not match the selected time zone." });
      const sameDay = await ctx.db.query("workout_sessions").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).eq("localDate", row.localDate)).take(30);
      if (sameDay.length >= 30) throw new ConvexError({ code: "LIMIT_REACHED", message: "Day exceeds 30 workout sessions" });
      const sessionId = await ctx.db.insert("workout_sessions", { userId, localDate: row.localDate, timeZone, startedAt, endedAt: row.durationMin === undefined ? startedAt : startedAt + row.durationMin * 60_000, durationMin: row.durationMin, timing: "logged", submissionId: `${args.submissionId}:session` });
      session = await ctx.db.get("workout_sessions", sessionId);
    }
    if (session === null) throw new Error("Workout session insert failed");
    let previousSession: { localDate: string; timeZone: string; startedAt: number; endedAt?: number; durationMin?: number; timing?: "live" | "logged" } | undefined;
    if (!createdSession) {
      const local = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(startedAt));
      if (local !== row.localDate) throw new ConvexError({ code: "INVALID_DATE", message: "The workout date does not match the selected time zone." });
      const sessionPatch: Partial<Doc<"workout_sessions">> = {};
      if (session.localDate !== row.localDate) sessionPatch.localDate = row.localDate;
      if (session.timeZone !== timeZone) sessionPatch.timeZone = timeZone;
      if (session.startedAt !== startedAt) sessionPatch.startedAt = startedAt;
      if (session.endedAt !== undefined) {
        if (session.durationMin !== row.durationMin) {
          sessionPatch.durationMin = row.durationMin;
          sessionPatch.endedAt = row.durationMin === undefined ? startedAt : startedAt + row.durationMin * 60_000;
        } else if (row.durationMin !== undefined && session.startedAt !== startedAt) {
          sessionPatch.endedAt = startedAt + row.durationMin * 60_000;
        }
      }
      if (Object.keys(sessionPatch).length > 0) {
        previousSession = {
          localDate: session.localDate, timeZone: session.timeZone, startedAt: session.startedAt,
          ...(session.endedAt === undefined ? {} : { endedAt: session.endedAt }),
          ...(session.durationMin === undefined ? {} : { durationMin: session.durationMin }),
          ...(session.timing === undefined ? {} : { timing: session.timing }),
        };
        await ctx.db.patch("workout_sessions", session._id, sessionPatch);
      }
    }
    const existingSets = await ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", session!._id).eq("status", "live")).take(201);
    const existingCardio = await ctx.db.query("cardio").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", session!._id).eq("status", "live")).take(101);
    const additions = row.items.reduce((sum, item) => sum + (item.kind === "strength" ? item.sets.filter((set) => set.setId === undefined).length : 0), 0);
    const finalSetCount = row.mode === "revise" ? row.items.reduce((sum, item) => sum + (item.kind === "strength" ? item.sets.length : 0), 0) : existingSets.length + additions;
    if (finalSetCount > 200) throw new ConvexError({ code: "LIMIT_REACHED", message: "A workout can contain at most 200 sets." });
    const setIds: Id<"sets">[] = []; const cardioIds: Id<"cardio">[] = [];
    const retainedSets = new Set<Id<"sets">>(); const retainedCardio = new Set<Id<"cardio">>();
    for (const [itemIndex, item] of row.items.entries()) {
      const chosen = item.exerciseId === undefined ? await createPersonalInMutation(ctx, userId, item.name, item.kind) : item.exerciseId;
      const exercise = await ctx.db.get("exercises", chosen);
      if (exercise === null || (exercise.ownerId !== undefined && exercise.ownerId !== userId)) throw new ConvexError({ code: "NOT_FOUND", message: "Exercise not found" });
      if (item.kind === "strength") {
        for (const [setIndex, set] of item.sets.entries()) {
          const old = set.setId === undefined ? null : await ctx.db.get("sets", set.setId);
          if (old !== null && (old.userId !== userId || old.sessionId !== session._id || old.status !== "live")) throw new ConvexError({ code: "STALE_REVISION", message: "A workout set changed. Reload the review and try again." });
          if (old !== null) retainedSets.add(old._id);
          const desiredIndex = old?.exerciseId === chosen ? old.setIndex : existingSets.filter((rowSet) => rowSet.exerciseId === chosen).reduce((max, rowSet) => Math.max(max, rowSet.setIndex), 0) + setIndex + 1;
          const changed = old !== null && (old.exerciseId !== chosen || old.weightKg !== set.weightKg || old.reps !== set.reps || old.weightBasis !== set.weightBasis || old.setIndex !== desiredIndex);
          if (old !== null && !changed) continue;
          if (old !== null) await ctx.db.patch("sets", old._id, { status: "superseded" });
          const revisionId = await ctx.db.insert("sets", {
            userId, sessionId: session._id, exerciseId: chosen, setIndex: desiredIndex,
            weightKg: set.weightKg!, reps: set.reps!,
            ...(set.weightBasis === undefined ? {} : { weightBasis: set.weightBasis }),
            revision: (old?.revision ?? 0) + 1,
            ...(old === null ? {} : { supersedes: old._id }),
            op: old === null ? "add" : "edit", status: "live",
            submissionId: `${args.submissionId}:set:${itemIndex}:${setIndex}`,
          });
          setIds.push(revisionId);
        }
      } else {
        const c = item.cardio!;
        const old = c.cardioId === undefined ? null : await ctx.db.get("cardio", c.cardioId);
        if (old !== null && (old.userId !== userId || old.sessionId !== session._id || old.status !== "live")) throw new ConvexError({ code: "STALE_REVISION", message: "A cardio item changed. Reload the review and try again." });
        if (old !== null) retainedCardio.add(old._id);
        const changed = old !== null && (old.exerciseId !== chosen || old.durationMin !== c.durationMin || old.distanceKm !== c.distanceKm || old.reportedKcal !== c.reportedKcal || old.speedKmh !== c.speedKmh || old.inclinePct !== c.inclinePct || old.position !== itemIndex);
        if (old !== null && !changed) continue;
        if (old !== null) await ctx.db.patch("cardio", old._id, { status: "superseded" });
        cardioIds.push(await ctx.db.insert("cardio", {
          userId, sessionId: session._id, exerciseId: chosen, position: itemIndex,
          durationMin: c.durationMin, distanceKm: c.distanceKm, reportedKcal: c.reportedKcal,
          speedKmh: c.speedKmh, inclinePct: c.inclinePct,
          revision: (old?.revision ?? 0) + 1,
          ...(old === null ? {} : { supersedes: old._id }),
          op: old === null ? "add" : "edit", status: "live",
          submissionId: `${args.submissionId}:cardio:${itemIndex}`,
        }));
      }
    }
    if (row.mode === "revise") {
      for (const old of existingSets) if (!retainedSets.has(old._id)) {
        await ctx.db.patch("sets", old._id, { status: "superseded" });
        setIds.push(await ctx.db.insert("sets", {
          userId, sessionId: session._id, exerciseId: old.exerciseId,
          setIndex: old.setIndex, weightKg: old.weightKg, reps: old.reps,
          weightBasis: old.weightBasis, revision: old.revision + 1,
          supersedes: old._id, op: "delete", status: "deleted",
          submissionId: `${args.submissionId}:delete:${old._id}`, deletedAt: Date.now(),
        }));
      }
      for (const old of existingCardio) if (!retainedCardio.has(old._id)) {
        await ctx.db.patch("cardio", old._id, { status: "superseded" });
        cardioIds.push(await ctx.db.insert("cardio", {
          userId, sessionId: session._id, exerciseId: old.exerciseId, position: old.position,
          durationMin: old.durationMin, distanceKm: old.distanceKm, reportedKcal: old.reportedKcal,
          speedKmh: old.speedKmh, inclinePct: old.inclinePct, revision: old.revision + 1,
          supersedes: old._id, op: "delete", status: "deleted",
          submissionId: `${args.submissionId}:delete-cardio:${old._id}`, deletedAt: Date.now(),
        }));
      }
    }
    await ctx.db.patch("workout_drafts", row._id, { status: "committed", committedSubmissionId: args.submissionId, written: { sessionId: session._id, createdSession, setRevisionIds: setIds, cardioRevisionIds: cardioIds, ...(previousSession === undefined ? {} : { previousSession }) } });
    return { sessionId: session._id, setIds, cardioIds };
  },
});

/** Creates a user's personal exercise inside an existing workout transaction. */
async function createPersonalInMutation(ctx: MutationCtx, userId: string, name: string, kind: "strength" | "cardio"): Promise<Id<"exercises">> {
  const normalized = normalizeExerciseName(name);
  const prior = await ctx.db.query("exercises").withIndex("by_ownerId_and_normalizedName", (q) => q.eq("ownerId", userId).eq("normalizedName", normalized)).unique();
  if (prior !== null) {
    if (prior.category !== kind) throw new ConvexError({ code: "EXERCISE_KIND_CONFLICT", message: "This name is already saved for another exercise type." });
    return prior._id;
  }
  return await ctx.db.insert("exercises", { ownerId: userId, normalizedName: normalized, sourceId: `personal:${userId}:${normalized}`, name: name.trim(), category: kind, equipment: null, mechanic: null, level: null, primaryMuscles: [], secondaryMuscles: [] });
}

/** Undoes a committed batch with tombstone revisions and soft-deletes a created session. */
export const undoDraft = mutation({
  args: { draftId: v.id("workout_drafts"), submissionId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx); await assertLedgerWritable(ctx, userId);
    const row = await ctx.db.get("workout_drafts", args.draftId);
    if (row === null || row.userId !== userId || row.written === undefined) throw new ConvexError({ code: "NOT_FOUND", message: "Saved workout not found" });
    if (row.undoneAt !== undefined) return null;
    for (const id of row.written.setRevisionIds) {
      const head = await ctx.db.get("sets", id); if (head === null || head.status === "superseded") throw new ConvexError({ code: "STALE_REVISION", message: "A workout set changed after it was saved." });
      const previous = head.supersedes === undefined ? null : await ctx.db.get("sets", head.supersedes);
      await ctx.db.patch("sets", head._id, { status: "superseded" });
      const restored = previous ?? head;
      await ctx.db.insert("sets", {
        userId, sessionId: restored.sessionId, exerciseId: restored.exerciseId,
        setIndex: restored.setIndex, weightKg: restored.weightKg, reps: restored.reps,
        ...(restored.weightBasis === undefined ? {} : { weightBasis: restored.weightBasis }),
        revision: head.revision + 1, supersedes: head._id, op: "undo",
        status: previous === null ? "deleted" : "live",
        ...(previous === null ? { deletedAt: Date.now() } : {}),
        submissionId: `${args.submissionId}:set:${head._id}`,
      });
    }
    for (const id of row.written.cardioRevisionIds) {
      const head = await ctx.db.get("cardio", id); if (head === null || head.status === "superseded") throw new ConvexError({ code: "STALE_REVISION", message: "A cardio item changed after it was saved." });
      const previous = head.supersedes === undefined ? null : await ctx.db.get("cardio", head.supersedes);
      await ctx.db.patch("cardio", head._id, { status: "superseded" });
      const restored = previous ?? head;
      await ctx.db.insert("cardio", {
        userId, sessionId: restored.sessionId, exerciseId: restored.exerciseId,
        position: restored.position,
        ...(restored.durationMin === undefined ? {} : { durationMin: restored.durationMin }),
        ...(restored.distanceKm === undefined ? {} : { distanceKm: restored.distanceKm }),
        ...(restored.reportedKcal === undefined ? {} : { reportedKcal: restored.reportedKcal }),
        ...(restored.speedKmh === undefined ? {} : { speedKmh: restored.speedKmh }),
        ...(restored.inclinePct === undefined ? {} : { inclinePct: restored.inclinePct }),
        revision: head.revision + 1, supersedes: head._id, op: "undo",
        status: previous === null ? "deleted" : "live",
        ...(previous === null ? { deletedAt: Date.now() } : {}),
        submissionId: `${args.submissionId}:cardio:${head._id}`,
      });
    }
    if (row.written.createdSession) await ctx.db.patch("workout_sessions", row.written.sessionId, { deletedAt: Date.now() });
    else if (row.written.previousSession !== undefined) await ctx.db.patch("workout_sessions", row.written.sessionId, row.written.previousSession);
    await ctx.db.patch("workout_drafts", row._id, { undoneAt: Date.now() });
    return null;
  },
});

/** Discards a pending workout review. */
export const discardDraft = mutation({
  args: { draftId: v.id("workout_drafts") }, returns: v.null(),
  handler: async (ctx, { draftId }) => { const userId = await requireUserId(ctx); const row = await ctx.db.get("workout_drafts", draftId); if (row === null || row.userId !== userId || row.status !== "pending") throw new ConvexError({ code: "NOT_FOUND", message: "Pending workout draft not found" }); await ctx.db.patch("workout_drafts", draftId, { status: "discarded" }); return null; },
});
