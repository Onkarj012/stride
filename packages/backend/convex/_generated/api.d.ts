/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_envelope from "../actions_envelope.js";
import type * as actions_group from "../actions_group.js";
import type * as actions_idempotency from "../actions_idempotency.js";
import type * as actions_undo from "../actions_undo.js";
import type * as actions_writer from "../actions_writer.js";
import type * as active_rows from "../active_rows.js";
import type * as ai from "../ai.js";
import type * as ai_intent from "../ai/intent.js";
import type * as ai_llm from "../ai/llm.js";
import type * as ai_parse from "../ai/parse.js";
import type * as ai_guard from "../ai_guard.js";
import type * as behavior from "../behavior.js";
import type * as calibration from "../calibration.js";
import type * as calorie_engine from "../calorie_engine.js";
import type * as chat from "../chat.js";
import type * as chat_claim from "../chat_claim.js";
import type * as chat_turn_test_helpers from "../chat_turn_test_helpers.js";
import type * as coaches from "../coaches.js";
import type * as day_totals from "../day_totals.js";
import type * as derived_state from "../derived_state.js";
import type * as entries from "../entries.js";
import type * as exercise_db from "../exercise_db.js";
import type * as food_memory from "../food_memory.js";
import type * as food_memory_match from "../food_memory_match.js";
import type * as foods from "../foods.js";
import type * as foods_db from "../foods_db.js";
import type * as goals from "../goals.js";
import type * as history from "../history.js";
import type * as insights from "../insights.js";
import type * as ledger_validators from "../ledger_validators.js";
import type * as lib_fetch_timeout from "../lib/fetch_timeout.js";
import type * as meals from "../meals.js";
import type * as nutrition_draft from "../nutrition_draft.js";
import type * as nutrition_engine from "../nutrition_engine.js";
import type * as observability from "../observability.js";
import type * as patterns from "../patterns.js";
import type * as plan_resolve from "../plan_resolve.js";
import type * as profile from "../profile.js";
import type * as progress from "../progress.js";
import type * as recovery_draft from "../recovery_draft.js";
import type * as seed from "../seed.js";
import type * as tdee_engine from "../tdee_engine.js";
import type * as telemetry from "../telemetry.js";
import type * as time_resolve from "../time_resolve.js";
import type * as time_zone from "../time_zone.js";
import type * as unit_converter from "../unit_converter.js";
import type * as user_ingredients from "../user_ingredients.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as weights from "../weights.js";
import type * as wellness from "../wellness.js";
import type * as wipe_legacy from "../wipe_legacy.js";
import type * as workout_draft from "../workout_draft.js";
import type * as workout_memory from "../workout_memory.js";
import type * as workout_scorer from "../workout_scorer.js";
import type * as workouts from "../workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions_envelope: typeof actions_envelope;
  actions_group: typeof actions_group;
  actions_idempotency: typeof actions_idempotency;
  actions_undo: typeof actions_undo;
  actions_writer: typeof actions_writer;
  active_rows: typeof active_rows;
  ai: typeof ai;
  "ai/intent": typeof ai_intent;
  "ai/llm": typeof ai_llm;
  "ai/parse": typeof ai_parse;
  ai_guard: typeof ai_guard;
  behavior: typeof behavior;
  calibration: typeof calibration;
  calorie_engine: typeof calorie_engine;
  chat: typeof chat;
  chat_claim: typeof chat_claim;
  chat_turn_test_helpers: typeof chat_turn_test_helpers;
  coaches: typeof coaches;
  day_totals: typeof day_totals;
  derived_state: typeof derived_state;
  entries: typeof entries;
  exercise_db: typeof exercise_db;
  food_memory: typeof food_memory;
  food_memory_match: typeof food_memory_match;
  foods: typeof foods;
  foods_db: typeof foods_db;
  goals: typeof goals;
  history: typeof history;
  insights: typeof insights;
  ledger_validators: typeof ledger_validators;
  "lib/fetch_timeout": typeof lib_fetch_timeout;
  meals: typeof meals;
  nutrition_draft: typeof nutrition_draft;
  nutrition_engine: typeof nutrition_engine;
  observability: typeof observability;
  patterns: typeof patterns;
  plan_resolve: typeof plan_resolve;
  profile: typeof profile;
  progress: typeof progress;
  recovery_draft: typeof recovery_draft;
  seed: typeof seed;
  tdee_engine: typeof tdee_engine;
  telemetry: typeof telemetry;
  time_resolve: typeof time_resolve;
  time_zone: typeof time_zone;
  unit_converter: typeof unit_converter;
  user_ingredients: typeof user_ingredients;
  users: typeof users;
  validation: typeof validation;
  weights: typeof weights;
  wellness: typeof wellness;
  wipe_legacy: typeof wipe_legacy;
  workout_draft: typeof workout_draft;
  workout_memory: typeof workout_memory;
  workout_scorer: typeof workout_scorer;
  workouts: typeof workouts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
