import type { LogEntry } from "@/lib/storage";
import { computeStreak } from "@/lib/streaks";

export type Milestone = {
  id: string;
  label: string;
  description: string;
  achieved: boolean;
};

export function computeMilestones(logs: LogEntry[]): Milestone[] {
  const meals = logs.filter((l) => l.category === "meal").length;
  const workouts = logs.filter((l) => l.category === "workout").length;
  const sleep = logs.filter((l) => l.category === "sleep").length;
  const days = new Set(
    logs.map((l) => new Date(l.createdAt).toDateString()),
  ).size;
  const streak = computeStreak(logs);

  return [
    {
      id: "first-log",
      label: "First log",
      description: "You logged your first entry",
      achieved: logs.length >= 1,
    },
    {
      id: "10-meals",
      label: "10 meals tracked",
      description: "Built a baseline for nutrition",
      achieved: meals >= 10,
    },
    {
      id: "5-workouts",
      label: "5 workouts logged",
      description: "Finding your rhythm",
      achieved: workouts >= 5,
    },
    {
      id: "5-day-streak",
      label: "5-day streak",
      description: "Consistency is locking in",
      achieved: streak.best >= 5,
    },
    {
      id: "7-days",
      label: "7 days active",
      description: "A full week of consistency",
      achieved: days >= 7,
    },
    {
      id: "sleep-tracker",
      label: "Sleep tracker",
      description: "Logged sleep 5+ times",
      achieved: sleep >= 5,
    },
    {
      id: "14-days",
      label: "Two-week milestone",
      description: "Habit-forming territory",
      achieved: days >= 14,
    },
    {
      id: "30-days",
      label: "Monthly milestone",
      description: "You've made wellness a routine",
      achieved: days >= 30,
    },
  ];
}
