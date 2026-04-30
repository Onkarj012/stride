/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as chatAI from "../chatAI.js";
import type * as chatMessages from "../chatMessages.js";
import type * as dailyGoals from "../dailyGoals.js";
import type * as insights from "../insights.js";
import type * as insightsAI from "../insightsAI.js";
import type * as meals from "../meals.js";
import type * as mealsAI from "../mealsAI.js";
import type * as progress from "../progress.js";
import type * as workouts from "../workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authActions: typeof authActions;
  chatAI: typeof chatAI;
  chatMessages: typeof chatMessages;
  dailyGoals: typeof dailyGoals;
  insights: typeof insights;
  insightsAI: typeof insightsAI;
  meals: typeof meals;
  mealsAI: typeof mealsAI;
  progress: typeof progress;
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
