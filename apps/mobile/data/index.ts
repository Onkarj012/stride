export interface MacroData {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface MealLogCardProps {
  meal: string
  time: string
  macros: MacroData
  confirmed: boolean
}

export interface ExerciseSet { weight: string; reps: number }
export interface Exercise { name: string; sets: ExerciseSet[] }
export interface WorkoutSession {
  title: string
  date: string
  durationMin: number
  burnKcal: number
  exercises: Exercise[]
}

export type AgentType = 'diet' | 'workout' | 'sleep' | 'hydration' | 'habits' | 'mental' | 'overall'

export const MACRO_TOTALS: MacroData = { kcal: 1260, protein: 88, carbs: 132, fat: 41 }
export const MACRO_TARGET: MacroData = { kcal: 1800, protein: 130, carbs: 190, fat: 60 }

export const TODAY_MEALS: MealLogCardProps[] = [
  { meal: 'Oat bowl',      time: 'Breakfast · 8:14 AM',   macros: { kcal: 410, protein: 14, carbs: 62, fat: 11 }, confirmed: true },
  { meal: 'Chicken salad', time: 'Lunch · 1:02 PM',       macros: { kcal: 520, protein: 44, carbs: 18, fat: 22 }, confirmed: true },
  { meal: 'Protein shake', time: 'Post-workout · 5:30 PM', macros: { kcal: 180, protein: 30, carbs: 12, fat: 3 },  confirmed: true },
  { meal: 'Greek yogurt',  time: 'Snack · 10:20 AM',      macros: { kcal: 150, protein: 17, carbs: 10, fat: 4 },  confirmed: false },
]

export const TODAY_SESSION: WorkoutSession = {
  title: 'Push + Pull', date: 'Today · 5:12–6:10 PM', durationMin: 58, burnKcal: 740,
  exercises: [
    { name: 'Bench press', sets: [{ weight: '60 kg', reps: 10 }, { weight: '80 kg', reps: 8 }, { weight: '80 kg', reps: 8 }, { weight: '85 kg', reps: 6 }] },
    { name: 'Pull-ups',    sets: [{ weight: 'BW', reps: 10 }, { weight: 'BW', reps: 10 }, { weight: 'BW', reps: 8 }, { weight: 'BW', reps: 7 }] },
    { name: 'Deadlift',    sets: [{ weight: '100 kg', reps: 5 }, { weight: '120 kg', reps: 5 }, { weight: '120 kg', reps: 5 }] },
    { name: 'Incline DB press', sets: [{ weight: '24 kg', reps: 12 }, { weight: '26 kg', reps: 10 }, { weight: '26 kg', reps: 9 }] },
  ],
}

export const WALKING_SESSION: WorkoutSession = {
  title: 'Evening Walk', date: 'Today · 10:00–11:00 PM', durationMin: 60, burnKcal: 285,
  exercises: [
    { name: 'Walking', sets: [{ weight: '~3.5 km', reps: 0 }, { weight: '5 km/h avg', reps: 0 }] },
  ],
}

export const TODAY_SESSIONS: WorkoutSession[] = [TODAY_SESSION, WALKING_SESSION]

export const STATS: { label: string; value: string; color: 'mint' | 'sky' | 'peach' | 'bubblegum' }[] = [
  { label: 'Weight', value: '74 kg',    color: 'mint' },
  { label: 'Goal',   value: 'Fat loss', color: 'sky' },
  { label: 'Daily',  value: '1 800',    color: 'peach' },
]

export const HISTORY_DAYS: { day: number; score: number }[] = Array.from({ length: 35 }, (_, i) => ({
  day: i + 1,
  score: [3, 3, 2, 3, 1, 0, 3, 3, 3, 2, 3, 3, 1, 2, 3, 0, 3, 3, 2, 3, 3, 1, 3, 2, 3, 3, 0, 2, 3, 3, 3, 2, 3, 1, 3][i],
}))

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
