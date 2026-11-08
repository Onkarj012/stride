/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_guard from "../ai_guard.js";
import type * as ai_models from "../ai_models.js";
import type * as api_keys from "../api_keys.js";
import type * as chats from "../chats.js";
import type * as crons from "../crons.js";
import type * as day_totals from "../day_totals.js";
import type * as entries from "../entries.js";
import type * as exercises from "../exercises.js";
import type * as foods_db from "../foods_db.js";
import type * as http from "../http.js";
import type * as ledger_validators from "../ledger_validators.js";
import type * as pipeline_barcode from "../pipeline/barcode.js";
import type * as pipeline_drafts from "../pipeline/drafts.js";
import type * as pipeline_extract from "../pipeline/extract.js";
import type * as pipeline_log from "../pipeline/log.js";
import type * as pipeline_openrouter from "../pipeline/openrouter.js";
import type * as pipeline_resolve from "../pipeline/resolve.js";
import type * as pipeline_tools from "../pipeline/tools.js";
import type * as pipeline_transcribe from "../pipeline/transcribe.js";
import type * as pipeline_workout_parse from "../pipeline/workout_parse.js";
import type * as progress_v2 from "../progress_v2.js";
import type * as strength from "../strength.js";
import type * as tdee_recompute from "../tdee_recompute.js";
import type * as time_zone from "../time_zone.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as weights from "../weights.js";
import type * as workouts from "../workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai_guard: typeof ai_guard;
  ai_models: typeof ai_models;
  api_keys: typeof api_keys;
  chats: typeof chats;
  crons: typeof crons;
  day_totals: typeof day_totals;
  entries: typeof entries;
  exercises: typeof exercises;
  foods_db: typeof foods_db;
  http: typeof http;
  ledger_validators: typeof ledger_validators;
  "pipeline/barcode": typeof pipeline_barcode;
  "pipeline/drafts": typeof pipeline_drafts;
  "pipeline/extract": typeof pipeline_extract;
  "pipeline/log": typeof pipeline_log;
  "pipeline/openrouter": typeof pipeline_openrouter;
  "pipeline/resolve": typeof pipeline_resolve;
  "pipeline/tools": typeof pipeline_tools;
  "pipeline/transcribe": typeof pipeline_transcribe;
  "pipeline/workout_parse": typeof pipeline_workout_parse;
  progress_v2: typeof progress_v2;
  strength: typeof strength;
  tdee_recompute: typeof tdee_recompute;
  time_zone: typeof time_zone;
  uploads: typeof uploads;
  users: typeof users;
  weights: typeof weights;
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
