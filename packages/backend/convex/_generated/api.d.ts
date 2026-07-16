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
import type * as agents from "../agents.js";
import type * as ai from "../ai.js";
import type * as ai_intent from "../ai/intent.js";
import type * as ai_llm from "../ai/llm.js";
import type * as ai_parse from "../ai/parse.js";
import type * as behavior from "../behavior.js";
import type * as calibration from "../calibration.js";
import type * as calorie_engine from "../calorie_engine.js";
import type * as chat from "../chat.js";
import type * as checkins from "../checkins.js";
import type * as coaches from "../coaches.js";
import type * as crons from "../crons.js";
import type * as exercise_db from "../exercise_db.js";
import type * as food_memory from "../food_memory.js";
import type * as food_memory_match from "../food_memory_match.js";
import type * as foods from "../foods.js";
import type * as gamification from "../gamification.js";
import type * as goals from "../goals.js";
import type * as history from "../history.js";
import type * as insights from "../insights.js";
import type * as meals from "../meals.js";
import type * as nudges from "../nudges.js";
import type * as nutrition_engine from "../nutrition_engine.js";
import type * as patterns from "../patterns.js";
import type * as plan_resolve from "../plan_resolve.js";
import type * as profile from "../profile.js";
import type * as progress from "../progress.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as tdee_engine from "../tdee_engine.js";
import type * as time_resolve from "../time_resolve.js";
import type * as unit_converter from "../unit_converter.js";
import type * as user_ingredients from "../user_ingredients.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as wellness from "../wellness.js";
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
  agents: typeof agents;
  ai: typeof ai;
  "ai/intent": typeof ai_intent;
  "ai/llm": typeof ai_llm;
  "ai/parse": typeof ai_parse;
  behavior: typeof behavior;
  calibration: typeof calibration;
  calorie_engine: typeof calorie_engine;
  chat: typeof chat;
  checkins: typeof checkins;
  coaches: typeof coaches;
  crons: typeof crons;
  exercise_db: typeof exercise_db;
  food_memory: typeof food_memory;
  food_memory_match: typeof food_memory_match;
  foods: typeof foods;
  gamification: typeof gamification;
  goals: typeof goals;
  history: typeof history;
  insights: typeof insights;
  meals: typeof meals;
  nudges: typeof nudges;
  nutrition_engine: typeof nutrition_engine;
  patterns: typeof patterns;
  plan_resolve: typeof plan_resolve;
  profile: typeof profile;
  progress: typeof progress;
  recipes: typeof recipes;
  seed: typeof seed;
  tdee_engine: typeof tdee_engine;
  time_resolve: typeof time_resolve;
  unit_converter: typeof unit_converter;
  user_ingredients: typeof user_ingredients;
  users: typeof users;
  validation: typeof validation;
  wellness: typeof wellness;
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
