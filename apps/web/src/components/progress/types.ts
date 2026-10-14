import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export type Summary = FunctionReturnType<typeof api.progress_v2.summary>;
export type Gate = Summary["gate"];
export type Sex = "male" | "female";
