import { action, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { callAI, parseJSON } from "./ai/llm";

type CheckInWindow = "morning" | "day" | "evening" | "night";
type CheckInSource = "registry" | "llm" | "template";
type AnswerType = "choice" | "number" | "scale" | "yes_no";
type StructuredKind = "sleep" | "mood" | "water" | "steps" | "weight";
type CoverageKind = "breakfast" | "lunch" | "workout" | "sleep" | "water" | "steps" | "mood";
type UnitsPreference = "metric" | "imperial";

type CheckInOption = { label: string; value: string; prompt?: string };

export type CheckInCandidate = {
  id: string;
  source: CheckInSource;
  title: string;
  body?: string;
  answerType: AnswerType;
  options?: CheckInOption[];
  templateId?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  family?: string;
  coverage?: CoverageKind;
  structuredKind?: StructuredKind;
  windows: Partial<Record<CheckInWindow, number>>;
  goalScores?: Record<string, number>;
  baseScore?: number;
};

export type AnswerLite = {
  questionId: string;
  date: string;
  value: string;
  skipped: boolean;
};

export type SelectionContext = {
  date: string;
  window: CheckInWindow;
  profileGoal?: string | null;
  meals: Array<Pick<Doc<"meals">, "name" | "mealType" | "time">>;
  workoutCount: number;
  waterMl: number;
  hasSleep: boolean;
  stepsCount: number;
  moodCount: number;
};

const DAILY_QUESTION_LIMIT = 4;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LB_TO_KG = 0.453592;

const windowValidator = v.union(
  v.literal("morning"),
  v.literal("day"),
  v.literal("evening"),
  v.literal("night"),
);

const sourceValidator = v.union(v.literal("registry"), v.literal("llm"), v.literal("template"));
const answerTypeValidator = v.union(v.literal("choice"), v.literal("number"), v.literal("scale"), v.literal("yes_no"));

const SKIP_OPTION: CheckInOption = { label: "Skip", value: "skip" };

const REGISTRY_QUESTIONS: CheckInCandidate[] = [
  {
    id: "sleep_quality_morning",
    source: "registry",
    title: "How did you sleep?",
    body: "Recovery context helps me shape today's plan.",
    answerType: "choice",
    options: [
      { label: "Under 6h", value: "under_6" },
      { label: "6-8h", value: "six_to_eight" },
      { label: "8h+", value: "eight_plus" },
    ],
    family: "sleep",
    coverage: "sleep",
    structuredKind: "sleep",
    windows: { morning: 11, night: 2 },
    goalScores: { muscle_gain: 2, lean_gain: 2, recomp: 2, aggressive_loss: 1 },
  },
  {
    id: "energy_morning",
    source: "registry",
    title: "How's your energy this morning?",
    answerType: "choice",
    options: [
      { label: "Low", value: "low" },
      { label: "Okay", value: "ok" },
      { label: "Good", value: "good" },
    ],
    family: "energy",
    windows: { morning: 8 },
    goalScores: { muscle_gain: 1, recomp: 1 },
  },
  {
    id: "breakfast_status",
    source: "registry",
    title: "Have you had breakfast?",
    answerType: "choice",
    options: [
      { label: "Not yet", value: "not_yet", prompt: "I have not had breakfast yet" },
      { label: "Yes, log it", value: "log_breakfast", prompt: "Help me log breakfast" },
      { label: "Suggest one", value: "suggest_breakfast", prompt: "Suggest a simple breakfast" },
    ],
    family: "meal",
    coverage: "breakfast",
    windows: { morning: 9, day: 2 },
    goalScores: { aggressive_loss: 1, moderate_loss: 1, mild_loss: 1, muscle_gain: 1 },
  },
  {
    id: "lunch_status",
    source: "registry",
    title: "What did lunch look like?",
    body: "A rough answer is enough.",
    answerType: "choice",
    options: [
      { label: "Log lunch", value: "log_lunch", prompt: "Help me log lunch" },
      { label: "Skipped it", value: "skipped_lunch" },
      { label: "Not yet", value: "not_yet" },
    ],
    family: "meal",
    coverage: "lunch",
    windows: { day: 10 },
    goalScores: { aggressive_loss: 1, moderate_loss: 1, muscle_gain: 1 },
  },
  {
    id: "energy_day",
    source: "registry",
    title: "Where's your energy now?",
    answerType: "choice",
    options: [
      { label: "Low", value: "low" },
      { label: "Steady", value: "steady" },
      { label: "High", value: "high" },
    ],
    family: "energy",
    windows: { day: 7 },
    goalScores: { muscle_gain: 1, recomp: 1 },
  },
  {
    id: "hydration_day",
    source: "registry",
    title: "Hydration check",
    body: "Quick context helps me avoid overcorrecting later.",
    answerType: "choice",
    options: [
      { label: "Behind", value: "behind" },
      { label: "On track", value: "on_track" },
      { label: "Log water", value: "log_water", prompt: "Help me log water" },
    ],
    family: "hydration",
    coverage: "water",
    windows: { day: 6, evening: 3 },
    goalScores: { aggressive_loss: 1, moderate_loss: 1, recomp: 1 },
  },
  {
    id: "mood_evening",
    source: "registry",
    title: "How was today, 1 to 5?",
    answerType: "scale",
    options: [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" },
      { label: "5", value: "5" },
    ],
    family: "mood",
    coverage: "mood",
    structuredKind: "mood",
    windows: { evening: 10, night: 4 },
    goalScores: { recomp: 1, maintain: 1 },
  },
  {
    id: "movement_evening",
    source: "registry",
    title: "Did movement happen today?",
    answerType: "choice",
    options: [
      { label: "Yes, log it", value: "log_workout", prompt: "Help me log today's workout" },
      { label: "No workout", value: "no_workout" },
      { label: "Light walk", value: "walk", prompt: "I did a light walk today" },
    ],
    family: "workout",
    coverage: "workout",
    windows: { evening: 7 },
    goalScores: { muscle_gain: 2, lean_gain: 1, recomp: 1 },
  },
  {
    id: "night_winddown",
    source: "registry",
    title: "What do you need for wind-down?",
    answerType: "choice",
    options: [
      { label: "Sleep plan", value: "sleep_plan", prompt: "Help me set a sleep plan" },
      { label: "Stress is high", value: "stress_high", prompt: "Stress is high tonight" },
      { label: "I'm good", value: "good" },
    ],
    family: "recovery",
    windows: { night: 9 },
    goalScores: { muscle_gain: 1, recomp: 1, aggressive_loss: 1 },
  },
];

const TEMPLATE_DEFINITIONS: Array<{
  templateId: string;
  title: string;
  description: string;
  answerType: AnswerType;
  structuredKind: StructuredKind;
  defaultWindow: CheckInWindow;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}> = [
  {
    templateId: "daily_weigh_in",
    title: "What's your weight today?",
    description: "Updates profile weight and appends to weight history.",
    answerType: "number",
    structuredKind: "weight",
    defaultWindow: "morning",
    unit: "kg",
    min: 20,
    max: 400,
    step: 0.1,
    placeholder: "72.4",
  },
  {
    templateId: "water_intake",
    title: "How much water have you had?",
    description: "Logs a water entry for today.",
    answerType: "number",
    structuredKind: "water",
    defaultWindow: "day",
    unit: "ml",
    min: 1,
    max: 5000,
    step: 50,
    placeholder: "500",
  },
  {
    templateId: "steps_check",
    title: "Steps so far?",
    description: "Updates today's step count.",
    answerType: "number",
    structuredKind: "steps",
    defaultWindow: "evening",
    unit: "steps",
    min: 0,
    max: 100000,
    step: 100,
    placeholder: "8500",
  },
  {
    templateId: "mood_scale",
    title: "Mood right now, 1 to 5?",
    description: "Adds a mood point for today.",
    answerType: "scale",
    structuredKind: "mood",
    defaultWindow: "evening",
    min: 1,
    max: 5,
    step: 1,
  },
  {
    templateId: "sleep_hours",
    title: "How many hours did you sleep?",
    description: "Updates today's sleep log.",
    answerType: "number",
    structuredKind: "sleep",
    defaultWindow: "morning",
    unit: "h",
    min: 0,
    max: 16,
    step: 0.25,
    placeholder: "7.5",
  },
];

function templateById(templateId?: string) {
  return TEMPLATE_DEFINITIONS.find((t) => t.templateId === templateId) ?? null;
}

function normalizeUnits(units?: string | null): UnitsPreference {
  return units === "imperial" ? "imperial" : "metric";
}

async function getUserUnits(ctx: QueryCtx | MutationCtx, userId: string): Promise<UnitsPreference> {
  const settings = await ctx.db
    .query("user_settings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return normalizeUnits(settings?.units);
}

function kgToLb(weightKg: number): number {
  return weightKg / LB_TO_KG;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function weightPlaceholderForUnits(placeholder: string | undefined, units: UnitsPreference): string | undefined {
  if (units !== "imperial" || placeholder == null) return placeholder;
  const parsed = Number(placeholder);
  return Number.isFinite(parsed) ? String(Math.round(kgToLb(parsed))) : placeholder;
}

function templateDisplayFields(definition: typeof TEMPLATE_DEFINITIONS[number], units: UnitsPreference) {
  if (definition.structuredKind !== "weight" || units !== "imperial") {
    return {
      unit: definition.unit,
      min: definition.min,
      max: definition.max,
      step: definition.step,
      placeholder: definition.placeholder,
    };
  }
  return {
    unit: "lb",
    min: definition.min == null ? undefined : roundToTenth(kgToLb(definition.min)),
    max: definition.max == null ? undefined : roundToTenth(kgToLb(definition.max)),
    step: definition.step,
    placeholder: weightPlaceholderForUnits(definition.placeholder, units),
  };
}

async function requireUserId(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function assertDate(date: string) {
  if (!DATE_RE.test(date)) throw new Error("date must be YYYY-MM-DD");
}

function dateAdd(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateBefore(date: string): string {
  return dateAdd(date, -1);
}

function hasMealType(meals: SelectionContext["meals"], type: "breakfast" | "lunch") {
  const endHour = type === "breakfast" ? 11 : 16;
  const startHour = type === "breakfast" ? 4 : 11;
  return meals.some((meal) => {
    const mealType = meal.mealType?.toLowerCase();
    if (mealType === type) return true;
    const hour = Number((meal.time ?? "").slice(0, 2));
    return Number.isFinite(hour) && hour >= startHour && hour < endHour;
  });
}

export function isCovered(candidate: CheckInCandidate, ctx: SelectionContext): boolean {
  switch (candidate.coverage) {
    case "breakfast":
      return hasMealType(ctx.meals, "breakfast");
    case "lunch":
      return hasMealType(ctx.meals, "lunch");
    case "workout":
      return ctx.workoutCount > 0;
    case "sleep":
      return ctx.hasSleep;
    case "water":
      return ctx.waterMl > 0;
    case "steps":
      return ctx.stepsCount > 0;
    case "mood":
      return ctx.moodCount > 0;
    default:
      return false;
  }
}

function normalizedGoal(goal?: string | null): string {
  return goal ?? "maintain";
}

export function scoreCheckInCandidate(candidate: CheckInCandidate, ctx: SelectionContext): number {
  const windowScore = candidate.windows[ctx.window] ?? 0;
  if (windowScore <= 0) return Number.NEGATIVE_INFINITY;

  let score = (candidate.baseScore ?? 0) + windowScore;
  score += candidate.goalScores?.[normalizedGoal(ctx.profileGoal)] ?? 0;

  if (candidate.coverage === "breakfast" && ctx.window === "morning" && ctx.meals.length === 0) score += 2;
  if (candidate.coverage === "lunch" && ctx.window === "day" && ctx.meals.length <= 1) score += 2;
  if (candidate.coverage === "water" && ctx.window !== "morning" && ctx.waterMl === 0) score += 1.5;
  if (candidate.structuredKind === "sleep" && !ctx.hasSleep) score += 1.5;
  if (candidate.source === "template") score += 1.25;
  if (candidate.source === "llm") score += 0.75;

  return score;
}

export function isQuestionBackedOff(questionId: string, date: string, history: AnswerLite[]): boolean {
  const previous = history
    .filter((row) => row.questionId === questionId && row.date < date)
    .sort((a, b) => b.date.localeCompare(a.date));

  let cursor: string | null = null;
  let skipStreak = 0;
  for (const row of previous) {
    if (!row.skipped) return false;
    if (cursor !== null && row.date !== dateBefore(cursor)) return false;
    cursor = row.date;
    skipStreak += 1;
    if (skipStreak >= 3) {
      const backoffUntil = dateAdd(previous[0].date, 3);
      return date <= backoffUntil;
    }
  }
  return false;
}

export function chooseCheckInCandidate(args: {
  candidates: CheckInCandidate[];
  context: SelectionContext;
  todayAnswers: AnswerLite[];
  history: AnswerLite[];
}): CheckInCandidate | null {
  if (args.todayAnswers.length >= DAILY_QUESTION_LIMIT) return null;

  const answeredIds = new Set(args.todayAnswers.map((row) => row.questionId));
  const familyCounts = new Map<string, number>();
  for (const row of args.todayAnswers) {
    const candidate = args.candidates.find((c) => c.id === row.questionId);
    if (candidate?.family) familyCounts.set(candidate.family, (familyCounts.get(candidate.family) ?? 0) + 1);
  }

  const eligible = args.candidates
    .filter((candidate) => !answeredIds.has(candidate.id))
    .filter((candidate) => !isCovered(candidate, args.context))
    .filter((candidate) => !isQuestionBackedOff(candidate.id, args.context.date, args.history))
    .filter((candidate) => {
      if (!candidate.family || (candidate.family !== "mood" && candidate.family !== "energy")) return true;
      return (familyCounts.get(candidate.family) ?? 0) < 2;
    })
    .map((candidate) => ({ candidate, score: scoreCheckInCandidate(candidate, args.context) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  return eligible[0]?.candidate ?? null;
}

function appendSkip(options: CheckInOption[] | undefined): CheckInOption[] {
  const base = options ?? [];
  return base.some((option) => option.value === "skip") ? base : [...base, SKIP_OPTION];
}

function scaleOptions(min = 1, max = 5): CheckInOption[] {
  const options: CheckInOption[] = [];
  for (let n = min; n <= max; n++) options.push({ label: String(n), value: String(n) });
  return options;
}

function yesNoOptions(): CheckInOption[] {
  return [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ];
}

function toClientQuestion(candidate: CheckInCandidate, window: CheckInWindow) {
  const options =
    candidate.answerType === "scale"
      ? appendSkip(candidate.options ?? scaleOptions(candidate.min, candidate.max))
      : candidate.answerType === "yes_no"
        ? appendSkip(candidate.options ?? yesNoOptions())
        : appendSkip(candidate.options);

  return {
    type: "quick_question" as const,
    id: candidate.id,
    source: candidate.source,
    templateId: candidate.templateId,
    title: candidate.title,
    body: candidate.body,
    answerType: candidate.answerType,
    options,
    unit: candidate.unit,
    min: candidate.min,
    max: candidate.max,
    step: candidate.step,
    placeholder: candidate.placeholder,
    window,
  };
}

function templateCandidate(definition: typeof TEMPLATE_DEFINITIONS[number], window: CheckInWindow, units: UnitsPreference): CheckInCandidate {
  const coverage: CoverageKind | undefined =
    definition.structuredKind === "weight" ? undefined :
    definition.structuredKind;
  const display = templateDisplayFields(definition, units);
  return {
    id: `template_${definition.templateId}`,
    source: "template",
    templateId: definition.templateId,
    title: definition.title,
    body: definition.description,
    answerType: definition.answerType,
    options: definition.answerType === "scale" ? scaleOptions(definition.min, definition.max) : undefined,
    family: definition.structuredKind,
    coverage,
    structuredKind: definition.structuredKind,
    windows: { [window]: 9 },
    unit: display.unit,
    min: display.min,
    max: display.max,
    step: display.step,
    placeholder: display.placeholder,
    baseScore: 1,
  };
}

function sanitizeLlmQuestions(rawQuestions: unknown, fallbackWindow: CheckInWindow): CheckInCandidate[] {
  if (!Array.isArray(rawQuestions)) return [];
  return rawQuestions.slice(0, 3).flatMap((raw, idx) => {
    if (!raw || typeof raw !== "object") return [];
    const obj = raw as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title || title.length > 90) return [];
    const idBase = typeof obj.id === "string" ? obj.id : title;
    const id = `llm_${idBase.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || idx}`;
    const window = obj.window === "morning" || obj.window === "day" || obj.window === "evening" || obj.window === "night"
      ? obj.window
      : fallbackWindow;
    const options = Array.isArray(obj.options)
      ? obj.options.slice(0, 3).flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const optionObj = option as Record<string, unknown>;
          const label = typeof optionObj.label === "string" ? optionObj.label.trim() : "";
          const value = typeof optionObj.value === "string" ? optionObj.value.trim() : label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
          return label ? [{ label: label.slice(0, 28), value: value.slice(0, 40) || "answer" }] : [];
        })
      : [];
    if (options.length < 2) return [];
    return [{
      id,
      source: "llm" as const,
      title,
      body: typeof obj.body === "string" ? obj.body.slice(0, 140) : undefined,
      answerType: "choice" as const,
      options,
      family: "llm",
      windows: { [window]: 8 },
      baseScore: 0.5,
    }];
  });
}

function parseLlmCache(row: Doc<"check_in_llm_questions"> | null, fallbackWindow: CheckInWindow): CheckInCandidate[] {
  if (!row) return [];
  try {
    return sanitizeLlmQuestions(JSON.parse(row.questions), fallbackWindow);
  } catch {
    return [];
  }
}

async function loadRecentHistory(ctx: QueryCtx, userId: string, date: string, candidates: CheckInCandidate[]) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  if (candidateIds.size === 0) return [];
  const rows = await ctx.db
    .query("check_in_answers")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", dateAdd(date, -6)).lte("date", date))
    .collect();
  return rows
    .filter((row) => candidateIds.has(row.questionId))
    .map((row) => ({
      questionId: row.questionId,
      date: row.date,
      value: row.value,
      skipped: row.skipped,
    }));
}

export async function getNextCheckInForContext(ctx: QueryCtx, args: {
  userId: string;
  date: string;
  window: CheckInWindow;
  profile: Doc<"user_profiles"> | null;
  todayMeals: Doc<"meals">[];
  todayWorkouts: Doc<"workouts">[];
  waterMl: number;
  sleep: Doc<"sleep_logs"> | null;
  steps: Doc<"steps_logs"> | null;
  moodCount: number;
  units?: string | null;
}) {
  assertDate(args.date);

  const [todayRows, templateRows, llmRow] = await Promise.all([
    ctx.db
      .query("check_in_answers")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", args.date))
      .collect(),
    ctx.db
      .query("check_in_template_settings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(50),
    ctx.db
      .query("check_in_llm_questions")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", args.date))
      .first(),
  ]);

  const enabledTemplates = templateRows
    .filter((row) => row.enabled)
    .flatMap((row) => {
      const definition = templateById(row.templateId);
      if (!definition) return [];
      return [templateCandidate(definition, row.window as CheckInWindow, normalizeUnits(args.units))];
    });

  const candidates = [
    ...enabledTemplates,
    ...REGISTRY_QUESTIONS,
    ...parseLlmCache(llmRow, args.window),
  ];

  const history = await loadRecentHistory(ctx, args.userId, args.date, candidates);
  const context: SelectionContext = {
    date: args.date,
    window: args.window,
    profileGoal: args.profile?.goal ?? null,
    meals: args.todayMeals,
    workoutCount: args.todayWorkouts.length,
    waterMl: args.waterMl,
    hasSleep: !!args.sleep,
    stepsCount: args.steps?.count ?? 0,
    moodCount: args.moodCount,
  };
  const todayAnswers = todayRows.map((row) => ({
    questionId: row.questionId,
    date: row.date,
    value: row.value,
    skipped: row.skipped,
  }));

  const selected = chooseCheckInCandidate({ candidates, context, todayAnswers, history });
  return selected ? toClientQuestion(selected, args.window) : null;
}

async function getAnswerSummary(ctx: QueryCtx, userId: string, date: string): Promise<string> {
  const [rows, units] = await Promise.all([
    ctx.db
      .query("check_in_answers")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .take(20),
    getUserUnits(ctx, userId),
  ]);

  const answered = rows.filter((row) => !row.skipped);
  if (answered.length === 0) return "";
  return answered
    .map((row) => {
      const value = row.label ?? row.value;
      const numeric = row.numericValue != null ? ` (${row.numericValue}${unitForTemplate(row.templateId, units)})` : "";
      return `${row.questionId}: ${value}${numeric}`;
    })
    .join("; ");
}

function unitForTemplate(templateId: string | undefined, units: UnitsPreference) {
  const definition = templateById(templateId);
  if (!definition) return "";
  const unit = templateDisplayFields(definition, units).unit;
  return unit ? ` ${unit}` : "";
}

export async function getTodayCheckInAnswerContext(ctx: QueryCtx, userId: string, date: string) {
  assertDate(date);
  return getAnswerSummary(ctx, userId, date);
}

export const getNextCheckIn = query({
  args: { date: v.string(), window: v.optional(windowValidator) },
  handler: async (ctx, { date, window }) => {
    assertDate(date);
    const userId = await requireUserId(ctx);
    const resolvedWindow = window ?? windowFromDate(new Date());

    const [profile, settings, meals, workouts, water, sleep, steps, moods] = await Promise.all([
      ctx.db.query("user_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("meals").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect(),
      ctx.db.query("workouts").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect(),
      ctx.db.query("water_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect(),
      ctx.db.query("sleep_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).first(),
      ctx.db.query("steps_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).first(),
      ctx.db.query("mood_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).take(10),
    ]);

    return getNextCheckInForContext(ctx, {
      userId,
      date,
      window: resolvedWindow,
      profile,
      todayMeals: meals,
      todayWorkouts: workouts,
      waterMl: water.reduce((sum, row) => sum + row.ml, 0),
      sleep,
      steps,
      moodCount: moods.length,
      units: settings?.units,
    });
  },
});

function windowFromDate(date: Date): CheckInWindow {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export const getTemplateSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [rows, units] = await Promise.all([
      ctx.db
        .query("check_in_template_settings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(50),
      getUserUnits(ctx, userId),
    ]);
    return TEMPLATE_DEFINITIONS.map((definition) => {
      const stored = rows.find((row) => row.templateId === definition.templateId);
      return {
        ...definition,
        ...templateDisplayFields(definition, units),
        enabled: stored?.enabled ?? false,
        window: (stored?.window ?? definition.defaultWindow) as CheckInWindow,
      };
    });
  },
});

export const upsertTemplateSetting = mutation({
  args: {
    templateId: v.string(),
    enabled: v.boolean(),
    window: windowValidator,
  },
  handler: async (ctx, { templateId, enabled, window }) => {
    const userId = await requireUserId(ctx);
    if (!templateById(templateId)) throw new Error(`Unknown template: ${templateId}`);
    const existing = await ctx.db
      .query("check_in_template_settings")
      .withIndex("by_user_template", (q) => q.eq("userId", userId).eq("templateId", templateId))
      .first();
    const patch = { enabled, window, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert("check_in_template_settings", { userId, templateId, ...patch });
  },
});

export const listAnswersForDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    assertDate(date);
    const userId = await requireUserId(ctx);
    return ctx.db
      .query("check_in_answers")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .take(20);
  },
});

export const submitAnswer = mutation({
  args: {
    questionId: v.string(),
    date: v.string(),
    window: windowValidator,
    source: v.optional(sourceValidator),
    answerType: v.optional(answerTypeValidator),
    value: v.string(),
    label: v.optional(v.string()),
    numericValue: v.optional(v.number()),
    booleanValue: v.optional(v.boolean()),
    templateId: v.optional(v.string()),
    skipped: v.optional(v.boolean()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDate(args.date);
    const userId = await requireUserId(ctx);
    const skipped = args.skipped ?? args.value === "skip";
    const now = Date.now();
    const existing = await ctx.db
      .query("check_in_answers")
      .withIndex("by_user_date_question", (q) => q.eq("userId", userId).eq("date", args.date).eq("questionId", args.questionId))
      .first();
    if (!existing) {
      const todayAnswers = await ctx.db
        .query("check_in_answers")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
        .take(DAILY_QUESTION_LIMIT);
      if (todayAnswers.length >= DAILY_QUESTION_LIMIT) {
        throw new ConvexError("Daily check-in limit reached");
      }
    }

    const source = args.source ?? (args.templateId ? "template" : "registry");
    const answerType = args.answerType ?? (args.numericValue != null ? "number" : "choice");
    const row = {
      source,
      window: args.window,
      answerType,
      value: args.value,
      label: args.label,
      numericValue: args.numericValue,
      booleanValue: args.booleanValue,
      templateId: args.templateId,
      skipped,
      updatedAt: existing ? now : undefined,
    };
    const changed = !existing ||
      existing.value !== row.value ||
      existing.numericValue !== row.numericValue ||
      existing.booleanValue !== row.booleanValue ||
      existing.skipped !== row.skipped;

    let id;
    if (existing) {
      await ctx.db.patch(existing._id, row);
      id = existing._id;
    } else {
      id = await ctx.db.insert("check_in_answers", {
        userId,
        date: args.date,
        questionId: args.questionId,
        createdAt: now,
        ...row,
      });
    }

    if (!skipped && changed) {
      await applyStructuredAnswer(ctx, userId, args);
    }

    return id;
  },
});

async function applyStructuredAnswer(ctx: MutationCtx, userId: string, args: {
  questionId: string;
  date: string;
  value: string;
  numericValue?: number;
  templateId?: string;
  time?: string;
}) {
  const definition = templateById(args.templateId);
  const kind = definition?.structuredKind ?? registryStructuredKind(args.questionId);
  if (!kind) return;

  const time = args.time ?? new Date().toTimeString().slice(0, 5);
  if (kind === "weight") {
    const inputWeight = args.numericValue;
    if (inputWeight == null || inputWeight <= 0) return;
    const units = await getUserUnits(ctx, userId);
    const weightKg = units === "imperial" ? inputWeight * LB_TO_KG : inputWeight;
    const profile = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (profile) {
      await ctx.db.patch(profile._id, { weight: weightKg });
    } else {
      await ctx.db.insert("user_profiles", { userId, weight: weightKg, activityLevel: "moderate" });
    }

    const existingWeight = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
      .first();
    if (existingWeight) {
      await ctx.db.patch(existingWeight._id, { weightKg, source: "check_in" });
    } else {
      await ctx.db.insert("weight_logs", { userId, date: args.date, weightKg, source: "check_in", createdAt: Date.now() });
    }
  } else if (kind === "water") {
    const ml = args.numericValue;
    if (ml == null || ml <= 0) return;
    const existing = await ctx.db
      .query("water_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
      .first();
    if (existing) await ctx.db.patch(existing._id, { ml, time });
    else await ctx.db.insert("water_logs", { userId, date: args.date, ml, time });
  } else if (kind === "steps") {
    const count = Math.round(args.numericValue ?? 0);
    if (count < 0) return;
    const existing = await ctx.db
      .query("steps_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
      .first();
    if (existing) await ctx.db.patch(existing._id, { count });
    else await ctx.db.insert("steps_logs", { userId, date: args.date, count });
  } else if (kind === "mood") {
    const rating = Math.round(args.numericValue ?? Number(args.value));
    if (rating < 1 || rating > 5) return;
    const mood = { rating, time, note: `check-in: ${args.questionId}` };
    const existing = await ctx.db
      .query("mood_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
      .first();
    if (existing) await ctx.db.patch(existing._id, mood);
    else await ctx.db.insert("mood_logs", { userId, date: args.date, ...mood });
  } else if (kind === "sleep") {
    const sleep = sleepFromAnswer(args.value, args.numericValue);
    if (!sleep) return;
    const existing = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
      .first();
    if (existing) await ctx.db.patch(existing._id, sleep);
    else await ctx.db.insert("sleep_logs", { userId, date: args.date, ...sleep });
  }
}

function registryStructuredKind(questionId: string): StructuredKind | null {
  return REGISTRY_QUESTIONS.find((question) => question.id === questionId)?.structuredKind ?? null;
}

function sleepFromAnswer(value: string, numericValue?: number): { hours: number; quality: string; note?: string } | null {
  if (numericValue != null) {
    if (numericValue < 0 || numericValue > 24) return null;
    const quality = numericValue < 6 ? "poor" : numericValue < 7 ? "ok" : numericValue < 8.5 ? "good" : "great";
    return { hours: numericValue, quality, note: "from check-in" };
  }
  switch (value) {
    case "under_6":
      return { hours: 5.5, quality: "poor", note: "from check-in: under 6h" };
    case "six_to_eight":
      return { hours: 7, quality: "good", note: "from check-in: 6-8h" };
    case "eight_plus":
      return { hours: 8.25, quality: "great", note: "from check-in: 8h+" };
    case "poor":
      return { hours: 6, quality: "poor", note: "from check-in: poor sleep" };
    case "ok":
      return { hours: 7, quality: "ok", note: "from check-in: ok sleep" };
    case "good":
      return { hours: 8, quality: "good", note: "from check-in: good sleep" };
    default:
      return null;
  }
}

export const getAnswerContextForContext = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    assertDate(date);
    return getAnswerSummary(ctx, userId, date);
  },
});

export const getLlmQuestionCache = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    assertDate(date);
    return ctx.db
      .query("check_in_llm_questions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
  },
});

type DailyLlmContext = {
  goal: string | null;
  calorieTarget: number | null;
  proteinTarget: number | null;
  meals: Array<{ name: string; mealType?: string }>;
  workouts: Array<{ name: string; intensity: string }>;
  waterMl: number;
  sleep: { hours: number; quality: string } | null;
  steps: number | null;
  answers: string;
};

export const getDailyLlmContext = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }): Promise<DailyLlmContext> => {
    assertDate(date);
    const [profile, meals, workouts, water, sleep, steps, answers] = await Promise.all([
      ctx.db.query("user_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("meals").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).take(8),
      ctx.db.query("workouts").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).take(5),
      ctx.db.query("water_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).take(10),
      ctx.db.query("sleep_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).first(),
      ctx.db.query("steps_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).first(),
      getAnswerSummary(ctx, userId, date),
    ]);
    return {
      goal: profile?.goal ?? null,
      calorieTarget: profile?.calorieTarget ?? null,
      proteinTarget: profile?.proteinTarget ?? null,
      meals: meals.map((meal) => ({ name: meal.name, mealType: meal.mealType })),
      workouts: workouts.map((workout) => ({ name: workout.name, intensity: workout.intensity })),
      waterMl: water.reduce((sum, row) => sum + row.ml, 0),
      sleep: sleep ? { hours: sleep.hours, quality: sleep.quality } : null,
      steps: steps?.count ?? null,
      answers,
    };
  },
});

export const saveDailyLlmQuestions = internalMutation({
  args: { userId: v.string(), date: v.string(), questions: v.array(v.any()) },
  handler: async (ctx, { userId, date, questions }) => {
    assertDate(date);
    const questionsJson = JSON.stringify(questions.slice(0, 3));
    const existing = await ctx.db
      .query("check_in_llm_questions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { questions: questionsJson, generatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert("check_in_llm_questions", {
      userId,
      date,
      questions: questionsJson,
      generatedAt: Date.now(),
    });
  },
});

type EnsureDailyLlmQuestionsResult = { ok: boolean; cached: boolean; count: number; error?: string };

export const ensureDailyLlmQuestions = action({
  args: { date: v.string(), window: v.optional(windowValidator) },
  handler: async (ctx, { date, window }): Promise<EnsureDailyLlmQuestionsResult> => {
    assertDate(date);
    const userId = await requireUserId(ctx);
    const existing: Doc<"check_in_llm_questions"> | null = await ctx.runQuery(internal.checkins.getLlmQuestionCache, { userId, date });
    if (existing) return { ok: true, cached: true, count: parseLlmCache(existing, window ?? "day").length };

    const [settings, daily]: [any, DailyLlmContext] = await Promise.all([
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.checkins.getDailyLlmContext, { userId, date }),
    ]);

    const prompt = `Generate up to 3 useful, low-friction check-in questions for a fitness app.
Return ONLY a JSON array. No prose.

Rules:
- Use only multiple-choice answers.
- Do not ask for data already logged today.
- Do not ask free-form custom questions.
- Keep each title under 80 characters.
- Each question must have 2-3 options.
- Prefer questions that make today's coaching more useful.

Schema:
[{"id":"short_snake_case","window":"morning|day|evening|night","title":"question","body":"optional short reason","options":[{"label":"Short","value":"snake_case"}]}]

Today (${date}) context:
${JSON.stringify(daily)}`;

    try {
      const content = await callAI(
        [{ role: "user", content: prompt }],
        500,
        settings?.openRouterModel ?? undefined,
        settings?.openRouterKey ?? undefined,
      );
      const parsed = parseJSON<unknown[]>(content, []);
      const sanitized = sanitizeLlmQuestions(parsed, window ?? "day").map((candidate) => ({
        id: candidate.id.replace(/^llm_/, ""),
        window: Object.keys(candidate.windows)[0] ?? window ?? "day",
        title: candidate.title,
        body: candidate.body,
        options: (candidate.options ?? []).slice(0, 3),
      }));
      await ctx.runMutation(internal.checkins.saveDailyLlmQuestions, { userId, date, questions: sanitized });
      return { ok: true, cached: false, count: sanitized.length };
    } catch (error) {
      return { ok: false, cached: false, count: 0, error: error instanceof Error ? error.message : String(error) };
    }
  },
});
