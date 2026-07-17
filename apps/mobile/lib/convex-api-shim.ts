/**
 * Browser/Metro-safe compatibility entrypoint for Convex function references.
 * The real ConvexReactClient and Clerk auth provider are wired in _layout.tsx;
 * this proxy keeps generated server modules out of the mobile bundle while
 * preserving the same public api.* names used by web.
 */
// @ts-ignore — convex/server exposes a runtime Proxy with no Node APIs.
import { anyApi, componentsGeneric } from 'convex/server'

export const api = anyApi
export const internal = anyApi
export const components = componentsGeneric()
