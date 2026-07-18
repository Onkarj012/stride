import { beforeEach, expect, test } from "vitest";
import { clearOnboardingDraft, ONBOARDING_DRAFT_VERSION, readOnboardingDraft, saveOnboardingDraft } from "./onboardingPersistence";

type Phase = "name" | "stats";
type State = { firstName: string; age: string };

const fallback = { version: ONBOARDING_DRAFT_VERSION, phase: "name" as const, state: { firstName: "", age: "" } };

beforeEach(() => sessionStorage.clear());

test("onboarding draft survives a reload and is cleared after completion", () => {
  const draft = { version: ONBOARDING_DRAFT_VERSION, phase: "stats" as const, state: { firstName: "Mina", age: "31" } };

  saveOnboardingDraft(draft);
  expect(readOnboardingDraft<Phase, State>(["name", "stats"], fallback)).toEqual(draft);

  clearOnboardingDraft();
  expect(readOnboardingDraft<Phase, State>(["name", "stats"], fallback)).toEqual(fallback);
});

test("rejects stale or malformed drafts and preserves current defaults for invalid fields", () => {
  sessionStorage.setItem("stride_onboarding_draft", JSON.stringify({
    version: ONBOARDING_DRAFT_VERSION - 1,
    phase: "stats",
    state: { firstName: "stale", age: "99" },
  }));
  expect(readOnboardingDraft<Phase, State>(["name", "stats"], fallback)).toEqual(fallback);

  sessionStorage.setItem("stride_onboarding_draft", JSON.stringify({
    version: ONBOARDING_DRAFT_VERSION,
    phase: "stats",
    state: { firstName: "Mina", age: { invalid: true }, ignored: "field" },
  }));
  expect(readOnboardingDraft<Phase, State>(["name", "stats"], fallback)).toEqual({
    version: ONBOARDING_DRAFT_VERSION,
    phase: "stats",
    state: { firstName: "Mina", age: "" },
  });
});

test("falls back safely when privacy mode blocks sessionStorage access", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get: () => { throw new DOMException("Access denied", "SecurityError"); },
  });

  try {
    expect(readOnboardingDraft<Phase, State>(["name", "stats"], fallback)).toEqual(fallback);
    expect(() => saveOnboardingDraft({ phase: "stats", state: { firstName: "Mina", age: "31" } })).not.toThrow();
    expect(() => clearOnboardingDraft()).not.toThrow();
  } finally {
    if (descriptor) Object.defineProperty(window, "sessionStorage", descriptor);
  }
});
