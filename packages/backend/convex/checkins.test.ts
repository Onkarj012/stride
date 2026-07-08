import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  chooseCheckInCandidate,
  isCovered,
  isQuestionBackedOff,
  scoreCheckInCandidate,
  type CheckInCandidate,
  type SelectionContext,
} from "./checkins";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const BASE_CONTEXT: SelectionContext = {
  date: "2026-07-07",
  window: "morning",
  profileGoal: "muscle_gain",
  meals: [],
  workoutCount: 0,
  waterMl: 0,
  hasSleep: false,
  stepsCount: 0,
  moodCount: 0,
};

describe("check-in selection", () => {
  test("uses check_in_answers and the same date key for dedupe", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });

    const first = await asUser.query(api.checkins.getNextCheckIn, {
      date: "2026-07-07",
      window: "morning",
    });
    expect(first?.id).toBe("sleep_quality_morning");

    await asUser.mutation(api.checkins.submitAnswer, {
      questionId: first!.id,
      date: "2026-07-07",
      window: "morning",
      source: "registry",
      answerType: "choice",
      value: "under_6",
      label: "Under 6h",
    });

    const answers = await asUser.query(api.checkins.listAnswersForDate, { date: "2026-07-07" });
    expect(answers).toHaveLength(1);
    expect(answers[0].questionId).toBe("sleep_quality_morning");

    const next = await asUser.query(api.checkins.getNextCheckIn, {
      date: "2026-07-07",
      window: "morning",
    });
    expect(next?.id).not.toBe("sleep_quality_morning");

    const sleep = await asUser.query(api.wellness.getSleep, { date: "2026-07-07" });
    expect(sleep).toMatchObject({ hours: 5.5, quality: "poor" });
  });

  test("three consecutive skips backs a question off for three days", () => {
    const history = [
      { questionId: "energy_morning", date: "2026-07-01", value: "skip", skipped: true },
      { questionId: "energy_morning", date: "2026-07-02", value: "skip", skipped: true },
      { questionId: "energy_morning", date: "2026-07-03", value: "skip", skipped: true },
    ];

    expect(isQuestionBackedOff("energy_morning", "2026-07-04", history)).toBe(true);
    expect(isQuestionBackedOff("energy_morning", "2026-07-06", history)).toBe(true);
    expect(isQuestionBackedOff("energy_morning", "2026-07-07", history)).toBe(false);
  });

  test("daily cadence stops after four answered or skipped questions", () => {
    const candidate: CheckInCandidate = {
      id: "energy_morning",
      source: "registry",
      title: "Energy?",
      answerType: "choice",
      options: [{ label: "Low", value: "low" }],
      windows: { morning: 5 },
    };
    const todayAnswers = [0, 1, 2, 3].map((n) => ({
      questionId: `q_${n}`,
      date: "2026-07-07",
      value: "skip",
      skipped: true,
    }));

    expect(chooseCheckInCandidate({
      candidates: [candidate],
      context: BASE_CONTEXT,
      todayAnswers,
      history: [],
    })).toBeNull();
  });

  test("scores by active window, context, and goal relevance", () => {
    const breakfast: CheckInCandidate = {
      id: "breakfast_status",
      source: "registry",
      title: "Breakfast?",
      answerType: "choice",
      windows: { morning: 7 },
      coverage: "breakfast",
      goalScores: { muscle_gain: 1 },
    };
    const energy: CheckInCandidate = {
      id: "energy_morning",
      source: "registry",
      title: "Energy?",
      answerType: "choice",
      windows: { morning: 7 },
      goalScores: { maintain: 1 },
    };
    const lunch: CheckInCandidate = {
      id: "lunch_status",
      source: "registry",
      title: "Lunch?",
      answerType: "choice",
      windows: { day: 10 },
    };

    expect(scoreCheckInCandidate(breakfast, BASE_CONTEXT)).toBeGreaterThan(scoreCheckInCandidate(energy, BASE_CONTEXT));
    expect(scoreCheckInCandidate(lunch, BASE_CONTEXT)).toBe(Number.NEGATIVE_INFINITY);
    expect(chooseCheckInCandidate({
      candidates: [energy, breakfast, lunch],
      context: BASE_CONTEXT,
      todayAnswers: [],
      history: [],
    })?.id).toBe("breakfast_status");
  });

  test("meal and workout logs mark covered candidates ineligible", () => {
    const breakfast: CheckInCandidate = {
      id: "breakfast_status",
      source: "registry",
      title: "Breakfast?",
      answerType: "choice",
      coverage: "breakfast",
      windows: { morning: 20 },
    };
    const workout: CheckInCandidate = {
      id: "movement_evening",
      source: "registry",
      title: "Movement?",
      answerType: "choice",
      coverage: "workout",
      windows: { morning: 20 },
    };
    const energy: CheckInCandidate = {
      id: "energy_morning",
      source: "registry",
      title: "Energy?",
      answerType: "choice",
      windows: { morning: 1 },
    };
    const context: SelectionContext = {
      ...BASE_CONTEXT,
      meals: [{ name: "Oats", mealType: "breakfast", time: "08:15" }],
      workoutCount: 1,
    };

    expect(isCovered(breakfast, context)).toBe(true);
    expect(isCovered(workout, context)).toBe(true);
    expect(chooseCheckInCandidate({
      candidates: [breakfast, workout, energy],
      context,
      todayAnswers: [],
      history: [],
    })?.id).toBe("energy_morning");
  });

  test("imperial weight check-in stores profile and weight log in kg", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });
    await asUser.mutation(api.profile.upsertSettings, { units: "imperial" });

    const templates = await asUser.query(api.checkins.getTemplateSettings, {});
    expect(templates.find((template) => template.templateId === "daily_weigh_in")?.unit).toBe("lb");

    await asUser.mutation(api.checkins.submitAnswer, {
      questionId: "template_daily_weigh_in",
      date: "2026-07-07",
      window: "morning",
      source: "template",
      answerType: "number",
      value: "160",
      label: "160 lb",
      numericValue: 160,
      templateId: "daily_weigh_in",
    });

    const profile = await asUser.query(api.profile.getProfile, {});
    expect(profile?.weight).toBeCloseTo(72.57472, 5);

    const weightLogs = await t.run(async (ctx) => {
      return ctx.db
        .query("weight_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", "user1").eq("date", "2026-07-07"))
        .collect();
    });
    expect(weightLogs).toHaveLength(1);
    expect(weightLogs[0].weightKg).toBeCloseTo(72.57472, 5);
  });

  test("editing same-day water and mood check-ins patches existing logs", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1" });

    await asUser.mutation(api.checkins.submitAnswer, {
      questionId: "template_water_intake",
      date: "2026-07-07",
      window: "day",
      source: "template",
      answerType: "number",
      value: "500",
      label: "500 ml",
      numericValue: 500,
      templateId: "water_intake",
      time: "12:00",
    });
    await asUser.mutation(api.checkins.submitAnswer, {
      questionId: "template_water_intake",
      date: "2026-07-07",
      window: "day",
      source: "template",
      answerType: "number",
      value: "600",
      label: "600 ml",
      numericValue: 600,
      templateId: "water_intake",
      time: "12:05",
    });

    const water = await asUser.query(api.wellness.getWater, { date: "2026-07-07" });
    expect(water).toHaveLength(1);
    expect(water[0]).toMatchObject({ ml: 600, time: "12:05" });

    await asUser.mutation(api.checkins.submitAnswer, {
      questionId: "template_mood_scale",
      date: "2026-07-07",
      window: "evening",
      source: "template",
      answerType: "scale",
      value: "3",
      label: "3",
      numericValue: 3,
      templateId: "mood_scale",
      time: "19:00",
    });
    await asUser.mutation(api.checkins.submitAnswer, {
      questionId: "template_mood_scale",
      date: "2026-07-07",
      window: "evening",
      source: "template",
      answerType: "scale",
      value: "4",
      label: "4",
      numericValue: 4,
      templateId: "mood_scale",
      time: "19:05",
    });

    const mood = await asUser.query(api.wellness.getMood, { date: "2026-07-07" });
    expect(mood).toHaveLength(1);
    expect(mood[0]).toMatchObject({ rating: 4, time: "19:05", note: "check-in: template_mood_scale" });
  });
});
