export const ONBOARDING_STORAGE_KEY = "stride_onboarding_draft";

export type OnboardingDraft<Phase extends string, State> = {
  phase: Phase;
  state: State;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readOnboardingDraft<Phase extends string, State>(
  storage: StorageLike | undefined,
  phases: readonly Phase[],
  fallback: OnboardingDraft<Phase, State>,
): OnboardingDraft<Phase, State> {
  try {
    const raw = storage?.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft<Phase, State>>;
    if (!parsed.state || !parsed.phase || !phases.includes(parsed.phase)) return fallback;
    return { phase: parsed.phase, state: parsed.state } as OnboardingDraft<Phase, State>;
  } catch {
    return fallback;
  }
}

export function saveOnboardingDraft<Phase extends string, State>(
  storage: StorageLike | undefined,
  draft: OnboardingDraft<Phase, State>,
) {
  try {
    storage?.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(draft));
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
