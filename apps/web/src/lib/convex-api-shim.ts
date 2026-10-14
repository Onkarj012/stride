import { anyApi } from "convex/server";
import type { api as generatedApi } from "../../../../packages/backend/convex/_generated/api";

// The generated api.js is exactly anyApi at runtime, typed by api.d.ts, so this matches it without the Node-only import.
export const api = anyApi as unknown as typeof generatedApi;
