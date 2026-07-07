import type { LucideIcon } from "lucide-react";
import {
  UtensilsCrossed, Dumbbell, Droplets, Moon, Smile, Footprints,
  Sparkles, Heart,
} from "lucide-react";
import type { LogCategory, Agent, CoachingStyle } from "@/lib/storage";

/* ── Category metadata ── */

export type CategoryMeta = {
  id: LogCategory;
  label: string;
  icon: LucideIcon;
  tone: "peach" | "lavender" | "sky" | "mint" | "bubblegum";
};

export const categories: CategoryMeta[] = [
  { id: "meal", label: "Meal", icon: UtensilsCrossed, tone: "peach" },
  { id: "workout", label: "Workout", icon: Dumbbell, tone: "lavender" },
  { id: "water", label: "Water", icon: Droplets, tone: "sky" },
  { id: "sleep", label: "Sleep", icon: Moon, tone: "lavender" },
  { id: "mood", label: "Mood", icon: Smile, tone: "bubblegum" },
  { id: "steps", label: "Steps", icon: Footprints, tone: "mint" },
];

import { Leaf } from "lucide-react";
export const categoryById: Record<LogCategory, CategoryMeta> = categories.reduce(
  (acc, c) => ({ ...acc, [c.id]: c }),
  {} as Record<LogCategory, CategoryMeta>,
);
categoryById.note = { id: "note", label: "Note", icon: Leaf, tone: "mint" };

/* ── Agent metadata ── */

export const AGENT_META: Record<
  Agent,
  { label: string; species: string; tagline: string; tone: string; icon: LucideIcon }
> = {
  main:     { label: "Stry",            species: "Elephant", tagline: "Your wellness companion",     tone: "lavender",  icon: Sparkles },
  diet:     { label: "Diet agent",      species: "Panda",    tagline: "Macros, meals, and balance",  tone: "peach",     icon: UtensilsCrossed },
  workout:  { label: "Workout agent",   species: "Fox",      tagline: "Movement and effort",         tone: "lavender",  icon: Dumbbell },
  sleep:    { label: "Sleep agent",     species: "Bear",     tagline: "Rest and recovery",           tone: "sky",       icon: Moon },
  water:    { label: "Hydration agent", species: "Axolotl",  tagline: "Daily hydration",             tone: "sky",       icon: Droplets },
  habit:    { label: "Habit agent",     species: "Mouse",    tagline: "Small, consistent steps",     tone: "bubblegum", icon: Footprints },
  wellness: { label: "Wellness agent",  species: "Deer",     tagline: "Balance and well-being",      tone: "mint",      icon: Heart },
};

/* ── Coaching personalities ── */

export type CoachingPersonality = {
  id: CoachingStyle;
  label: string;
  description: string;
  exampleReply: string;
};

export const coachingPersonalities: CoachingPersonality[] = [
  {
    id: "gentle",
    label: "Gentle",
    description: "Warm, low-pressure, focused on showing up",
    exampleReply: "Got it — that's a good step. No pressure on the next thing.",
  },
  {
    id: "motivating",
    label: "Motivating",
    description: "High-energy, celebrates wins, pushes forward",
    exampleReply: "Logged it — you're on fire today! What's next on the list?",
  },
  {
    id: "analytical",
    label: "Analytical",
    description: "Data-first, precise, focused on patterns",
    exampleReply: "Logged. That's your 3rd entry today, ahead of last week's pace by 22%.",
  },
];

/* ── Weekly narrative templating ── */

export function weeklyNarrative(stats: {
  activeDays: number;
  totalDays: number;
  avgSleep: number;
  workouts: number;
  avgKcal: number;
}): { headline: string; body: string } {
  const consistency = stats.totalDays > 0 ? stats.activeDays / stats.totalDays : 0;
  let headline: string;
  if (consistency >= 0.85) headline = `Strong week — ${stats.activeDays}/${stats.totalDays} active days`;
  else if (consistency >= 0.6) headline = `Solid week — ${stats.activeDays}/${stats.totalDays} active days`;
  else headline = `Lighter week — ${stats.activeDays}/${stats.totalDays} active days`;

  const sleepStr = stats.avgSleep > 0 ? `Avg sleep ${stats.avgSleep.toFixed(1)}h` : "Sleep not tracked";
  const workoutStr = stats.workouts > 0 ? `${stats.workouts} workouts` : "no workouts logged";
  const kcalStr = stats.avgKcal > 0 ? `${Math.round(stats.avgKcal)} kcal/day on average` : "no meals tracked";

  const body = `${sleepStr}. ${workoutStr.charAt(0).toUpperCase() + workoutStr.slice(1)} this week. ${kcalStr}. Patterns are taking shape — keep going.`;

  return { headline, body };
}

/* ── AI Log Draft (confirm-before-commit flow) ── */

export type MealDraft = {
  kind: "meal";
  description: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  items: string[];
  ingredientBreakdown?: {
    items: Array<{
      food_text: string;
      matched_food_name?: string;
      grams?: number;
      calories_kcal?: number;
      protein_g?: number;
      carbs_g?: number;
      fat_g?: number;
      source?: string;
      verified?: boolean;
      confidence?: number;
    }>;
    unresolved?: string[];
  } | null;
  confidence?: number;
  nutritionSource?: string;
  parseError?: string;
  error?: string;
  submitting?: boolean;
  allowDuplicate?: boolean;
};

export type WorkoutDraft = {
  kind: "workout";
  description: string;
  type: string;
  duration: number;
  distance?: number;
  kcal: number;
  intensity: "light" | "medium" | "high";
  sets?: string;
  rationale?: string;
  exercises?: Array<{
    name: string;
    muscle_group?: string;
    weight_unit?: string;
    sets: Array<{
      weight?: string;
      reps?: string;
      distance_km?: string;
      duration_min?: string;
      incline?: string;
      pace?: string;
      calories_per_hr?: string;
    }>;
  }> | null;
  calorieResult?: {
    total_kcal: number;
    confidence: number;
    range_low: number;
    range_high: number;
    breakdown: Record<string, number>;
  } | null;
  parseError?: string;
  error?: string;
  submitting?: boolean;
  allowDuplicate?: boolean;
};

export type LogDraft = MealDraft | WorkoutDraft;
