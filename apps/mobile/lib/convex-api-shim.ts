// @ts-ignore — convex/server is Metro-safe (pure Proxy, no Node APIs)
import { anyApi, componentsGeneric } from 'convex/server';

export const api = anyApi;
export const internal = anyApi;
export const components = componentsGeneric();
