export const ONBOARDING_STORAGE_KEY = "stride_onboarding_draft";
export const ONBOARDING_DRAFT_VERSION = 1;

export type OnboardingDraft<Phase extends string, State> = {
  version: typeof ONBOARDING_DRAFT_VERSION;
  phase: Phase;
  state: State;
};

type OnboardingDraftInput<Phase extends string, State> = Omit<OnboardingDraft<Phase, State>, "version">;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompatibleValue(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.every((item) => isRecord(item) || ["string", "number", "boolean"].includes(typeof item));
  }
  if (typeof fallback === "string") return typeof value === "string";
  if (typeof fallback === "number") return typeof value === "number" && Number.isFinite(value);
  if (typeof fallback === "boolean") return typeof value === "boolean";
  if (isRecord(fallback)) return isRecord(value);
  return value === fallback;
}

function mergeAcceptedState<State>(candidate: unknown, fallback: State): State | null {
  if (!isRecord(candidate) || !isRecord(fallback)) return null;
  const accepted = Object.fromEntries(
    Object.entries(fallback).flatMap(([key, defaultValue]) => {
      const value = candidate[key];
      return key in candidate && isCompatibleValue(value, defaultValue) ? [[key, value]] : [];
    }),
  );
  return { ...fallback, ...accepted } as State;
}

export function readOnboardingDraft<Phase extends string, State>(
  storage: StorageLike | undefined,
  phases: readonly Phase[],
  fallback: OnboardingDraftInput<Phase, State>,
): OnboardingDraft<Phase, State> {
  const fallbackDraft: OnboardingDraft<Phase, State> = { ...fallback, version: ONBOARDING_DRAFT_VERSION };
  try {
    const raw = storage?.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return fallbackDraft;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== ONBOARDING_DRAFT_VERSION) return fallbackDraft;
    const phase = parsed.phase;
    if (typeof phase !== "string" || !phases.includes(phase as Phase)) return fallbackDraft;
    const state = mergeAcceptedState(parsed.state, fallback.state);
    if (!state) return fallbackDraft;
    return { version: ONBOARDING_DRAFT_VERSION, phase: phase as Phase, state };
  } catch {
    return fallbackDraft;
  }
}

export function saveOnboardingDraft<Phase extends string, State>(
  storage: StorageLike | undefined,
  draft: OnboardingDraftInput<Phase, State>,
) {
  try {
    storage?.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ ...draft, version: ONBOARDING_DRAFT_VERSION }));
  } catch {
    // Storage can be unavailable or full. The in-memory flow still works.
  }
}

export function clearOnboardingDraft(storage: StorageLike | undefined) {
  try {
    storage?.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage during completion.
  }
}
