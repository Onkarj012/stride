/**
 * ai/intent.ts — pure intent-detection + user-macro extraction helpers.
 *
 * Extracted from ai.ts (homepageInput path). No Convex or network deps, so
 * these are unit-testable in isolation. See ai/intent.test.ts.
 */

export const QUESTION_RE = /(\?$|\?\s|\b(how|what|why|when|where|which|who|should|can you|could you|will|would|do you|did i|am i|are you|tell me|explain|recommend|suggest|advice|tip|help me|do i)\b)/i;

export const LOG_RE = new RegExp([
  // First-person past/present action + food/drink/workout
  "\\b(i|i'?ve|i've|just)\\s+(had|ate|drank|consumed|finished|did|completed|ran|walked|jogged|biked|cycled|lifted|swam|hit|trained|crushed|knocked out|got in|squeezed in)\\b",
  // Direct activity reports without subject
  "\\b(had|ate|drank|finished|did|ran|walked|jogged|biked|cycled|lifted|swam)\\b\\s+(a|an|some|my|the|\\d+|breakfast|lunch|dinner|snack)",
  // Sleep reports
  "\\bslept\\b|\\bwent to bed\\b|\\bwoke up\\b|\\bjust woke\\b|\\bbed time\\b",
  // Workout indicators
  "\\b(workout|workouts|reps?|sets?|miles?|km|kilometers?|minutes? of)\\b",
  // Quick logging shortcuts
  "^(log\\s+|logged\\s+|track\\s+|add\\s+|record\\s+)",
  // Common food/drink words paired with quantity-ish hints
  "\\b(\\d+\\s*(g|grams?|oz|ml|l|cups?|tbsp|tsp|pieces?|slices?|servings?))\\b",
  // Mood: "feeling X / mood Y"
  "\\b(feeling|mood)\\b",
  // Steps and water
  "\\b(\\d{2,}\\s*steps|\\d+\\s*ml|\\d+\\s*l(itres?)?\\s+water|\\d+\\s*glasses?)\\b",
].join("|"), "i");

export const FOOD_WORD_RE = /\b(milk|whey|biscuit|biscuits|marie|rice|roti|chapati|bread|oats|egg|eggs|chicken|paneer|dal|curd|yogurt|banana|apple|snack|meal|breakfast|lunch|dinner|food|eat|eating)\b/i;
export const FOOD_ESTIMATE_RE = /\b(how many calories|how much calories|calorie|calories|kcal|macros?|estimate|can i (eat|have|take)|should i (eat|have|take)|would .* fit|might have|planning to have)\b/i;
export const NEGATED_LOG_RE = /\b(haven't|have not|hasn't|has not|didn't|did not|don't|do not|no|none|zero|skipped|missed|without)\b[\s\S]{0,40}\b(work(?:ed)?\s*out|workout|gym|lift(?:ed)?|run|ran|walk(?:ed)?|steps?|eat|ate|eaten|have|had|meal|breakfast|lunch|dinner|snack|water|drink|drank|sleep|slept)\b|\b(no|zero)\s+(workouts?|meals?|steps?|water|sleep)\b/i;
export const LOGGABLE_POSITIVE_RE = /\b(i|i'?ve|i've|just)\s+(had|ate|drank|consumed|finished|did|completed|ran|walked|jogged|biked|cycled|lifted|swam|hit|trained|logged)\b|\b(had|ate|drank|ran|walked|jogged|biked|cycled|lifted|swam)\b\s+(a|an|some|my|the|\d+|breakfast|lunch|dinner|snack)|\b\d+\s*(g|grams?|oz|ml|l|cups?|tbsp|tsp|pieces?|slices?|servings?|steps|km|miles?)\b/i;

export interface UserMacros {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export type HomepageIntentKind = "log_report" | "negation" | "question" | "chit_chat";

function logClauses(message: string): string[] {
  return message
    .toLowerCase()
    .split(/\b(?:but|so|however|though|although|then)\b|[,.;&]+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function hasPositiveLogClause(message: string): boolean {
  return logClauses(message).some((clause) =>
    LOGGABLE_POSITIVE_RE.test(clause) && !NEGATED_LOG_RE.test(clause),
  );
}

export function classifyHomepageIntent(message: string): HomepageIntentKind {
  const m = message.trim();
  if (!m) return "chit_chat";
  const negated = NEGATED_LOG_RE.test(m);
  const strongPositive = hasPositiveLogClause(m);
  const estimate = looksLikeFoodEstimate(m);
  if (negated && !strongPositive) return "negation";
  if (strongPositive) return "log_report";
  if (estimate && !negated) return "log_report";
  if (!negated && LOG_RE.test(m) && !QUESTION_RE.test(m)) return "log_report";
  if (QUESTION_RE.test(m)) return "question";
  return negated ? "negation" : "chit_chat";
}

export function isNegatedLogItem(message: string, item: { type: string; description?: string }): boolean {
  const clauses = logClauses(message);
  const typeWords: Record<string, string> = {
    workout: "(work(?:ed)?\\s*out|workout|gym|lift(?:ed)?|run|ran|walk(?:ed)?|cardio|training)",
    meal: "(eat|ate|eaten|have|had|meal|breakfast|lunch|dinner|snack|food)",
    water: "(water|drink|drank|hydration)",
    sleep: "(sleep|slept)",
    steps: "(steps?)",
    mood: "(mood|feeling|felt)",
  };
  const words = typeWords[item.type];
  if (!words) return false;
  const descriptionWords = (item.description || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const itemWords = descriptionWords.length > 0 ? `${words}|${descriptionWords.join("|")}` : words;
  const itemRe = new RegExp(`\\b(?:${itemWords})\\b`, "i");
  const negatedItemRe = new RegExp(`\\b(haven't|have not|hasn't|has not|didn't|did not|don't|do not|no|none|zero|skipped|missed|without)\\b(?:\\W+\\w+){0,8}?\\W+\\b(?:${itemWords})\\b|\\b(no|zero)\\s+(?:${itemWords})\\b`, "i");
  return clauses.some((clause) => itemRe.test(clause) && negatedItemRe.test(clause));
}

/** True when the message reads like a log report (not a question). */
export function looksLikeLog(message: string): boolean {
  const m = message.trim();
  if (m.length === 0) return false;
  if (hasPositiveLogClause(m)) return true;
  if (QUESTION_RE.test(m)) return false;
  if (classifyHomepageIntent(m) === "negation") return false;
  return LOG_RE.test(m);
}

/** True when the message asks for a calorie/macro estimate about a food. */
export function looksLikeFoodEstimate(message: string): boolean {
  return FOOD_WORD_RE.test(message) && FOOD_ESTIMATE_RE.test(message);
}

/** Pull any explicit macro numbers the user stated from free text. */
export function extractUserMacros(message: string): UserMacros {
  const text = message.toLowerCase();
  const macros: UserMacros = {};
  const kcal = text.match(/(?:around|about|approx(?:imately)?\s*)?(\d{2,4})\s*(?:kcal|calories|cals|cal)\b/);
  if (kcal) macros.calories = Number(kcal[1]);
  const protein = text.match(/(\d{1,3}(?:\.\d+)?)\s*g\s*(?:of\s*)?(?:protein|prot|p)\b|\bprotein\s*(?:is|:|=)?\s*(\d{1,3}(?:\.\d+)?)/);
  if (protein) macros.protein = Number(protein[1] ?? protein[2]);
  const carbs = text.match(/(\d{1,3}(?:\.\d+)?)\s*g\s*(?:of\s*)?(?:carbs?|c)\b|\bcarbs?\s*(?:is|:|=)?\s*(\d{1,3}(?:\.\d+)?)/);
  if (carbs) macros.carbs = Number(carbs[1] ?? carbs[2]);
  const fat = text.match(/(\d{1,3}(?:\.\d+)?)\s*g\s*(?:of\s*)?(?:fat|f)\b|\bfat\s*(?:is|:|=)?\s*(\d{1,3}(?:\.\d+)?)/);
  if (fat) macros.fat = Number(fat[1] ?? fat[2]);
  return macros;
}

/**
 * Overlay user-stated macros onto an engine draft, flagging conflicts when the
 * user's calories diverge sharply from the engine estimate or the macro grams
 * don't reconcile with the stated calories.
 */
export function applyUserMacros(draft: any, userMacros: UserMacros) {
  const engineCalories = Number(draft.kcal) || 0;
  const userCalories = userMacros.calories;
  const calorieDelta = userCalories != null ? Math.abs(userCalories - engineCalories) : 0;
  const calorieConflict = userCalories != null && calorieDelta > 150 && calorieDelta / Math.max(engineCalories, 1) > 0.3;
  const macroCalories =
    (userMacros.protein ?? draft.protein ?? 0) * 4 +
    (userMacros.carbs ?? draft.carbs ?? 0) * 4 +
    (userMacros.fat ?? draft.fat ?? 0) * 9;
  const macroImpossible = userCalories != null && macroCalories > 0 && Math.abs(macroCalories - userCalories) > Math.max(120, userCalories * 0.35);

  const userDraft = {
    ...draft,
    kcal: userMacros.calories ?? draft.kcal,
    protein: userMacros.protein ?? draft.protein,
    carbs: userMacros.carbs ?? draft.carbs,
    fat: userMacros.fat ?? draft.fat,
    nutritionSource: calorieConflict || macroImpossible ? "macro_conflict" : "user_provided",
    engineEstimate: {
      kcal: draft.kcal,
      protein: draft.protein,
      carbs: draft.carbs,
      fat: draft.fat,
    },
  };

  return {
    draft: userDraft,
    conflict: calorieConflict || macroImpossible,
    reason: calorieConflict
      ? `Your calorie number differs from my estimate by ${Math.round(calorieDelta)} kcal.`
      : macroImpossible
        ? "The calories and macro grams do not line up cleanly."
        : "",
  };
}
