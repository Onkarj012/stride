/**
 * Browser-safe shim for the Convex generated API.
 *
 * The backend's _generated/api.js is a server-side file that Rollup can't
 * resolve in the browser build context. This shim re-exports the same values
 * using the proper convex package exports.
 *
 * TypeScript types still come from the backend's api.d.ts via tsconfig paths.
 */
// @ts-ignore — convex/server is browser-safe (pure Proxy, no Node APIs)
import { anyApi, componentsGeneric } from "convex/server";

export const api = anyApi;
export const internal = anyApi;
export const components = componentsGeneric();
