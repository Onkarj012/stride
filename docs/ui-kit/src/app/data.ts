import type { MealLogCardProps } from '../components/MealLogCard'
import type { WorkoutCardProps } from '../components/WorkoutCard'
import type { MacroData } from '../components/MacroCard'
import type { Milestone } from '../components/MilestoneCard'

export const MACRO_TOTALS: MacroData = { kcal: 1260, protein: 88, carbs: 132, fat: 41 }
export const MACRO_TARGET: MacroData = { kcal: 1800, protein: 130, carbs: 190, fat: 60 }

export const TODAY_MEALS: MealLogCardProps[] = [
  { meal: 'Oat bowl',      time: 'Breakfast · 8:14 AM',   macros: { kcal: 410, protein: 14, carbs: 62, fat: 11 }, confirmed: true },
  { meal: 'Chicken salad', time: 'Lunch · 1:02 PM',       macros: { kcal: 520, protein: 44, carbs: 18, fat: 22 }, confirmed: true },
  { meal: 'Protein shake', time: 'Post-workout · 5:30 PM', macros: { kcal: 180, protein: 30, carbs: 12, fat: 3 },  confirmed: true },
  { meal: 'Greek yogurt',  time: 'Snack · 10:20 AM',      macros: { kcal: 150, protein: 17, carbs: 10, fat: 4 },  confirmed: false },
]

export interface Recipe {
  name: string
  tag: string
  macros: MacroData
  prepMin: number
  servings: number
  blurb: string
  ingredients: string[]
  steps: string[]
}

export const RECIPES: Recipe[] = [
  {
    name: 'High-protein oats', tag: 'Breakfast', macros: { kcal: 420, protein: 28, carbs: 55, fat: 10 },
    prepMin: 8, servings: 1,
    blurb: 'Creamy overnight-style oats with whey and berries. Hits 28g protein before noon.',
    ingredients: ['60g rolled oats', '1 scoop whey (vanilla)', '200ml milk', '1 tbsp chia seeds', '80g mixed berries', '1 tsp honey'],
    steps: ['Stir oats, whey and chia into the milk.', 'Rest 5 min (or overnight) to thicken.', 'Top with berries and a drizzle of honey.'],
  },
  {
    name: 'Chicken burrito bowl', tag: 'Lunch', macros: { kcal: 640, protein: 52, carbs: 60, fat: 18 },
    prepMin: 20, servings: 2,
    blurb: 'Meal-prep friendly bowl — high protein, big volume, reheats well.',
    ingredients: ['300g chicken breast', '150g cooked rice', '1 can black beans', '1 avocado', 'Salsa', 'Lime + coriander'],
    steps: ['Season and grill the chicken, then slice.', 'Warm beans and rice.', 'Build the bowl, top with avocado, salsa and lime.'],
  },
  {
    name: 'Salmon & greens', tag: 'Dinner', macros: { kcal: 540, protein: 46, carbs: 12, fat: 30 },
    prepMin: 18, servings: 1,
    blurb: 'Low-carb, omega-rich dinner that comes together on one tray.',
    ingredients: ['1 salmon fillet', '200g tenderstem broccoli', '1 tbsp olive oil', '1 lemon', 'Garlic + chilli flakes'],
    steps: ['Heat oven to 200°C.', 'Toss greens in oil, roast 8 min.', 'Add salmon, roast 10 min, finish with lemon.'],
  },
  {
    name: 'Casein pudding', tag: 'Snack', macros: { kcal: 220, protein: 32, carbs: 14, fat: 4 },
    prepMin: 5, servings: 1,
    blurb: 'Thick slow-protein pudding — ideal before bed.',
    ingredients: ['1 scoop casein', '120g Greek yogurt', '50ml milk', 'Cinnamon', 'Cocoa nibs'],
    steps: ['Whisk casein into the yogurt and milk.', 'Chill 10 min until set.', 'Top with cinnamon and nibs.'],
  },
]

// ─── Workouts ────────────────────────────────────────────────────────────────

export interface ExerciseSet { weight: string; reps: number }
export interface Exercise { name: string; sets: ExerciseSet[] }
export interface WorkoutSession {
  title: string
  date: string
  durationMin: number
  burnKcal: number
  exercises: Exercise[]
}

// Single-exercise shape kept for the chat demos.
export const TODAY_WORKOUTS: WorkoutCardProps[] = [
  { exercise: 'Bench press', sets: 4, reps: 8,  weight: '80 kg',  burnKcal: 240, date: 'Today · 5:12 PM' },
  { exercise: 'Pull-ups',    sets: 4, reps: 10, weight: 'BW',     burnKcal: 190, date: 'Today · 5:34 PM' },
  { exercise: 'Deadlift',    sets: 3, reps: 5,  weight: '120 kg', burnKcal: 310, date: 'Today · 5:58 PM' },
]

// Full logged session — per-set weight + reps.
export const TODAY_SESSION: WorkoutSession = {
  title: 'Push + Pull', date: 'Today · 5:12–6:10 PM', durationMin: 58, burnKcal: 740,
  exercises: [
    { name: 'Bench press', sets: [{ weight: '60 kg', reps: 10 }, { weight: '80 kg', reps: 8 }, { weight: '80 kg', reps: 8 }, { weight: '85 kg', reps: 6 }] },
    { name: 'Pull-ups',    sets: [{ weight: 'BW', reps: 10 }, { weight: 'BW', reps: 10 }, { weight: 'BW', reps: 8 }, { weight: 'BW', reps: 7 }] },
    { name: 'Deadlift',    sets: [{ weight: '100 kg', reps: 5 }, { weight: '120 kg', reps: 5 }, { weight: '120 kg', reps: 5 }] },
    { name: 'Incline DB press', sets: [{ weight: '24 kg', reps: 12 }, { weight: '26 kg', reps: 10 }, { weight: '26 kg', reps: 9 }] },
  ],
}

export const STATS: { label: string; value: string; color: 'mint' | 'sky' | 'peach' | 'bubblegum' }[] = [
  { label: 'Weight', value: '74 kg',    color: 'mint' },
  { label: 'Goal',   value: 'Fat loss', color: 'sky' },
  { label: 'Daily',  value: '1 800',    color: 'peach' },
]

export const STREAK = { days: 12, quote: 'Strong, steady week. The streak is the story.' }

export const MILESTONES: Milestone[] = [
  { label: 'First log', achieved: true }, { label: '3-day streak', achieved: true },
  { label: '7-day streak', achieved: true }, { label: '110g protein', achieved: true },
  { label: '30-day streak', achieved: false }, { label: '10 kg lost', achieved: false },
  { label: '100 workouts', achieved: false }, { label: 'Goal weight', achieved: false },
]

export const INSIGHTS: Record<'today' | 'week' | 'month', { type: 'daily' | 'weekly'; narrative: string; date: string }> = {
  today: { type: 'daily',  narrative: 'Strong, steady day — protein gap closing and you moved well. Watch the evening carb drift.', date: 'Today' },
  week:  { type: 'weekly', narrative: 'Best week in a month. 5 workouts, protein target hit 6/7 days, and the streak is real.', date: 'This week' },
  month: { type: 'weekly', narrative: 'Down 1.8 kg over 4 weeks at a clean rate. Training volume up 14%. Sleep is the lever for next month.', date: 'This month' },
}

// History — last ~5 weeks, value = how complete the day was logged (0–3)
export const HISTORY_DAYS: { day: number; score: number }[] = Array.from({ length: 35 }, (_, i) => ({
  day: i + 1,
  score: [3, 3, 2, 3, 1, 0, 3, 3, 3, 2, 3, 3, 1, 2, 3, 0, 3, 3, 2, 3, 3, 1, 3, 2, 3, 3, 0, 2, 3, 3, 3, 2, 3, 1, 3][i],
}))

// ─── History day detail ────────────────────────────────────────────────────────

export interface DayDetail {
  caloriesIn: number
  workout: WorkoutSession | null
  meals: MealLogCardProps[]
  sleepHrs: number
  waterMl: number
}

const DAY_TEMPLATES: DayDetail[] = [
  {
    caloriesIn: 1260, sleepHrs: 7.4, waterMl: 2100,
    workout: TODAY_SESSION,
    meals: [
      { meal: 'Oat bowl', time: 'Breakfast · 8:14 AM', macros: { kcal: 410, protein: 14, carbs: 62, fat: 11 }, confirmed: true },
      { meal: 'Chicken salad', time: 'Lunch · 1:02 PM', macros: { kcal: 520, protein: 44, carbs: 18, fat: 22 }, confirmed: true },
      { meal: 'Protein shake', time: 'Post-workout · 5:30 PM', macros: { kcal: 180, protein: 30, carbs: 12, fat: 3 }, confirmed: true },
    ],
  },
  {
    caloriesIn: 1740, sleepHrs: 6.2, waterMl: 1600,
    workout: {
      title: 'Lower body', date: '6:30–7:15 PM', durationMin: 45, burnKcal: 520,
      exercises: [
        { name: 'Back squat', sets: [{ weight: '90 kg', reps: 8 }, { weight: '100 kg', reps: 6 }, { weight: '100 kg', reps: 6 }] },
        { name: 'Romanian deadlift', sets: [{ weight: '80 kg', reps: 10 }, { weight: '80 kg', reps: 10 }] },
        { name: 'Leg press', sets: [{ weight: '160 kg', reps: 12 }, { weight: '180 kg', reps: 10 }] },
      ],
    },
    meals: [
      { meal: 'Greek yogurt + granola', time: 'Breakfast · 8:40 AM', macros: { kcal: 380, protein: 24, carbs: 44, fat: 10 }, confirmed: true },
      { meal: 'Burrito bowl', time: 'Lunch · 1:20 PM', macros: { kcal: 640, protein: 52, carbs: 60, fat: 18 }, confirmed: true },
      { meal: 'Salmon & rice', time: 'Dinner · 8:05 PM', macros: { kcal: 620, protein: 46, carbs: 48, fat: 26 }, confirmed: true },
    ],
  },
  {
    caloriesIn: 980, sleepHrs: 8.1, waterMl: 2600,
    workout: null,
    meals: [
      { meal: 'Avocado toast', time: 'Breakfast · 9:10 AM', macros: { kcal: 430, protein: 16, carbs: 40, fat: 24 }, confirmed: true },
      { meal: 'Lentil soup', time: 'Lunch · 1:00 PM', macros: { kcal: 320, protein: 18, carbs: 42, fat: 8 }, confirmed: true },
    ],
  },
]

export function dayDetail(day: number): DayDetail {
  return DAY_TEMPLATES[day % DAY_TEMPLATES.length]
}
