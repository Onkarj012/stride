import type { LucideIcon } from "lucide-react";
import {
  UtensilsCrossed, Dumbbell, Droplets, Moon, Smile, Footprints,
  Apple, Leaf, GlassWater, Sparkles, Heart,
} from "lucide-react";
import type { LogCategory, LogEntry, Agent, CoachingStyle } from "@/lib/storage";

export const user = {
  name: "Sandra Glam",
  firstName: "Sandra",
  location: "Copenhagen, Denmark",
  initials: "SG",
};

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
  wellness: { label: "Wellness agent",  species: "Unicorn",  tagline: "Mood, mindfulness, balance",  tone: "mint",      icon: Heart },
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

/* ── Suggestion presets ── */

export const todaySuggestions = [
  "Log breakfast",
  "How is my week?",
  "Plan a workout",
  "I'm feeling tired",
];

/* ── Canned AI flows for the demo ── */

export type CannedFlow = {
  userText: string;
  reply: Record<CoachingStyle, string>;
  agent: Agent;
  log?: { category: LogCategory; extra: Partial<Omit<LogEntry, "id" | "category" | "text" | "createdAt">> };
};

export const cannedFlows: Record<string, CannedFlow> = {
  "Log breakfast": {
    userText: "Log breakfast",
    reply: {
      gentle:
        "Logged your yogurt bowl with berries — looks balanced. No rush on the next thing.",
      motivating:
        "Logged! Yogurt + berries = a great start. Keep that energy rolling.",
      analytical:
        "Logged. ~340 kcal, 22 g protein, 38 g carbs. That's 18% of your daily kcal target.",
    },
    agent: "diet",
    log: {
      category: "meal",
      extra: {
        meal: { kcal: 340, protein: 22, carbs: 38, fat: 8, items: ["yogurt", "berries", "granola"] },
        agent: "diet",
        aiInsight: "Balanced carb-protein ratio. Good for sustained morning energy.",
      },
    },
  },
  "How is my week?": {
    userText: "How is my week?",
    reply: {
      gentle:
        "You've shown up most days this week. Sleep is steadier than last. Worth a small celebration.",
      motivating:
        "Strong week! 5 of 7 days logged, hydration on point, sleep up 18 min vs last week. Keep going!",
      analytical:
        "5/7 active days. Hydration 6/7. Sleep avg 7h 14m (+18 min vs last week). Workout frequency holding at 3x.",
    },
    agent: "habit",
  },
  "Plan a workout": {
    userText: "Plan a workout",
    reply: {
      gentle:
        "A 25-min mobility flow at 6 PM would feel good after yesterday's load. Want me to schedule?",
      motivating:
        "Let's do it! 25-min mobility flow at 6 PM — perfect balance. I'll set a reminder.",
      analytical:
        "Recommend: 25 min mobility, low-intensity. Yesterday was high-load (kcal 380, intensity high). Today's plan reduces strain.",
    },
    agent: "workout",
  },
  "I'm feeling tired": {
    userText: "I'm feeling tired",
    reply: {
      gentle:
        "Yesterday you slept about 6 hours. It's okay to keep today light and aim for an earlier wind-down.",
      motivating:
        "Got you — recovery is part of progress. Cap targets today, hit bed by 10 PM, and tomorrow you'll bounce back.",
      analytical:
        "Sleep deficit detected: 6.0h vs 7.5h target. Recommend reducing planned activity by ~30% and an earlier wind-down.",
    },
    agent: "sleep",
    log: {
      category: "mood",
      extra: { mood: { rating: 2, note: "feeling tired" }, agent: "habit" },
    },
  },
};

/* ── Multimodal sample inputs (Image mode) ── */

export const sampleFoodImages: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
  reply: string;
  log: Partial<Omit<LogEntry, "id" | "category" | "text" | "createdAt">>;
}> = [
  {
    id: "avocado-toast",
    label: "Avocado toast",
    icon: Apple,
    reply: "Avocado toast on sourdough with chili flakes. ~310 kcal, 9 g protein, 28 g carbs, 18 g fat. Logged.",
    log: {
      meal: { kcal: 310, protein: 9, carbs: 28, fat: 18, items: ["sourdough", "avocado"] },
      agent: "diet",
      aiInsight: "Healthy fats from avocado. Pair with protein next time.",
    },
  },
  {
    id: "salad-bowl",
    label: "Salad bowl",
    icon: Leaf,
    reply: "Quinoa salad with greens, cherry tomatoes, and feta. ~420 kcal, 18 g protein, 38 g carbs. Logged.",
    log: {
      meal: { kcal: 420, protein: 18, carbs: 38, fat: 18, items: ["quinoa", "greens", "feta"] },
      agent: "diet",
      aiInsight: "Plant-forward, balanced macros.",
    },
  },
  {
    id: "smoothie",
    label: "Smoothie",
    icon: GlassWater,
    reply: "Green smoothie — spinach, banana, almond milk. ~220 kcal, 6 g protein, 34 g carbs. Logged.",
    log: {
      meal: { kcal: 220, protein: 6, carbs: 34, fat: 4, items: ["spinach", "banana", "almond milk"] },
      agent: "diet",
      aiInsight: "Light option. Add protein powder for a bigger morning meal.",
    },
  },
];

export const initialAssistantMessage =
  "Hi Sandra. I'm Stry, your wellness companion. Type, speak, or show me a photo and I'll handle the rest. What's on your mind?";

/* ── User goals ── */

export const userGoals = [
  { id: "g1", label: "Move 30 minutes daily", progress: 0.65, unit: "min" },
  { id: "g2", label: "Sleep 7+ hours", progress: 0.82, unit: "hrs" },
  { id: "g3", label: "Hydrate 8 glasses", progress: 0.75, unit: "glasses" },
];

/* ── Profile stats ── */

export const profileStats = [
  { label: "Start weight", value: "53.3", unit: "kg", tone: "mint" as const },
  { label: "Goal", value: "50.0", unit: "kg", tone: "sky" as const },
  { label: "Daily calories", value: "1,740", unit: "kcal", tone: "peach" as const },
];

/* ── Homepage content ── */

export const dailyGuidance = {
  greeting: "Good evening, Sandra",
  message:
    "You've logged 3 things today — solid consistency. Wind down early tonight to keep your sleep window steady. I'll check in tomorrow morning.",
};

export const coachingNudge = {
  title: "Your next best action",
  action: "Drink one more glass of water",
  reason: "You're at 6 of 8 today. One glass before dinner locks it in.",
};

export const todayProgress = [
  { label: "Meals logged", value: 2, target: 3, tone: "peach" as const },
  { label: "Water", value: 6, target: 8, tone: "sky" as const },
  { label: "Movement", value: 22, target: 30, unit: "min", tone: "mint" as const },
];

export const adaptiveInsights = [
  {
    title: "Pattern detected",
    body: "You skip logging on Wednesdays. Want me to send a lighter check-in that day?",
    tone: "lavender" as const,
  },
  {
    title: "Recovery day",
    body: "Your last 3 days were active. A rest day today would benefit recovery.",
    tone: "sky" as const,
  },
];

/* ── Daily targets (used for macro percentages) ── */

export const dailyTargets = {
  kcal: 1740,
  protein: 90,
  carbs: 200,
  fat: 60,
  water: 2000,
  steps: 8000,
  sleepHours: 7.5,
  workoutMinutes: 30,
};

/* ── Weekly narrative templating ── */

export function weeklyNarrative(stats: {
  activeDays: number;
  totalDays: number;
  avgSleep: number;
  workouts: number;
  avgKcal: number;
}): { headline: string; body: string } {
  const consistency = stats.activeDays / stats.totalDays;
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
};

export type WorkoutDraft = {
  kind: "workout";
  description: string;
  type: string;
  duration: number;       // minutes
  distance?: number;      // km
  kcal: number;
  intensity: "light" | "medium" | "high";
};

export type LogDraft = MealDraft | WorkoutDraft;

/**
 * Hardcoded "LLM parse" results for test inputs.
 * Key = normalised lowercase input string.
 * In production this would be a real LLM call.
 */
export const DRAFT_TRIGGERS: Record<string, { draft: LogDraft; thinking: string; confirmReply: string; discardReply: string }> = {
  "just had avocado toast with two eggs": {
    thinking: "Parsing your meal — avocado toast with eggs...",
    draft: {
      kind: "meal",
      description: "Avocado toast with two eggs",
      kcal: 520,
      protein: 24,
      carbs: 38,
      fat: 28,
      items: ["2 slices sourdough (180 kcal)", "1 avocado (160 kcal)", "2 eggs (140 kcal)", "olive oil drizzle (40 kcal)"],
    },
    confirmReply: "Logged! 520 kcal, solid protein start. That puts you at a good base for the morning.",
    discardReply: "No problem — nothing logged. Let me know when you want to track it.",
  },
  "chicken salad for lunch": {
    thinking: "Estimating macros for chicken salad...",
    draft: {
      kind: "meal",
      description: "Chicken salad",
      kcal: 380,
      protein: 34,
      carbs: 18,
      fat: 16,
      items: ["150g grilled chicken (248 kcal)", "mixed greens (20 kcal)", "cherry tomatoes (15 kcal)", "olive oil dressing (97 kcal)"],
    },
    confirmReply: "Logged! 380 kcal, 34g protein — that's a clean lunch. You're tracking well today.",
    discardReply: "Got it, skipped. Tell me when you're ready to log it.",
  },
  "ran 5k this morning in 28 minutes": {
    thinking: "Calculating your run — 5 km in 28 min...",
    draft: {
      kind: "workout",
      description: "Morning 5K run",
      type: "Run",
      duration: 28,
      distance: 5.0,
      kcal: 310,
      intensity: "medium",
    },
    confirmReply: "Run logged! 5 km in 28 min is a solid pace — about 5:36/km. That's 310 kcal burned.",
    discardReply: "No worries, not logged. Let me know if you want to add it later.",
  },
  "did 30 min hiit": {
    thinking: "Logging your HIIT session...",
    draft: {
      kind: "workout",
      description: "30-minute HIIT session",
      type: "HIIT",
      duration: 30,
      kcal: 340,
      intensity: "high",
    },
    confirmReply: "HIIT logged! 340 kcal in 30 minutes — high intensity. Make sure you get enough protein today to recover.",
    discardReply: "Skipped. Let me know if you want to log it.",
  },
};
