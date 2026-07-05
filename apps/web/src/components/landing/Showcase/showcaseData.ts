import type { AgentType } from '@/components/ui-kit'

export const MACRO_TODAY = { kcal: 1280, protein: 78, carbs: 142, fat: 38 }

export const GUIDANCE = {
  doToday:     "Hit 110g protein — you're halfway there.",
  recoverFrom: "Light legs today after yesterday's run.",
  ignoreToday: "The scale this morning — it's water, not fat.",
}

export const STREAK = { days: 12, quote: "Strong, steady week. The streak is the story." }

export const MEALS = [
  { meal: 'Oat bowl',      time: 'Breakfast · 8:14 AM',    macros: { kcal: 410, protein: 14, carbs: 62, fat: 11 }, confirmed: true  },
  { meal: 'Greek yogurt',  time: 'Snack · 10:20 AM',       macros: { kcal: 150, protein: 17, carbs: 10, fat: 4  }, confirmed: false },
]

export const COACH: { agentType: AgentType; messages: { gentle: string; motivating: string; analytical: string } } = {
  agentType: 'diet',
  messages: {
    gentle:     "No rush — aim for ~110g protein today. You're halfway there. Want a high-protein snack idea?",
    motivating: "Let's GO — 110g target, you're at 55g. One solid meal and it's yours.",
    analytical: "Target: 110g (1.6g/kg BW). Current: 55g. Delta: +55g needed. Add ~1 protein portion at dinner.",
  },
}

export const AGENT_TYPES: AgentType[] = ['diet', 'workout', 'sleep', 'hydration', 'habits', 'mental', 'overall']

export const NARRATIVE_DAILY = {
  type: 'daily' as const,
  narrative: 'Strong, steady day — protein gap closed and you moved well. Tomorrow, watch the weekend carb drift.',
  date: 'Today',
}

export const NARRATIVE_WEEKLY = {
  type: 'weekly' as const,
  narrative: 'Best week in a month. 5 workouts, protein target hit 6/7 days, and that streak is real. Keep the same inputs next week.',
  date: 'This week',
}

export const MILESTONES = [
  { label: 'First log',     achieved: true  },
  { label: '3-day streak',  achieved: true  },
  { label: '7-day streak',  achieved: true  },
  { label: '110g protein',  achieved: true  },
  { label: '30-day streak', achieved: false },
  { label: '10 kg lost',    achieved: false },
  { label: '100 workouts',  achieved: false },
  { label: 'Goal weight',   achieved: false },
]
