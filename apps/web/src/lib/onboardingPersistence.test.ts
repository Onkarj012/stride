import { beforeEach, expect, test } from "vitest";
import { clearOnboardingDraft, readOnboardingDraft, saveOnboardingDraft } from "./onboardingPersistence";

type Phase = "name" | "stats";
type State = { firstName: string; age: string };

const fallback = { phase: "name" as const, state: { firstName: "", age: "" } };

beforeEach(() => sessionStorage.clear());

test("onboarding draft survives a reload and is cleared after completion", () => {
  const draft = { phase: "stats" as const, state: { firstName: "Mina", age: "31" } };

  saveOnboardingDraft(sessionStorage, draft);
  expect(readOnboardingDraft<Phase, State>(sessionStorage, ["name", "stats"], fallback)).toEqual(draft);

  clearOnboardingDraft(sessionStorage);
  expect(readOnboardingDraft<Phase, State>(sessionStorage, ["name", "stats"], fallback)).toEqual(fallback);
});
