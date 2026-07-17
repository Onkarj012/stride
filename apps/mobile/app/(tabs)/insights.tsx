import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { NarrativeCard } from '../../components/NarrativeCard'
import { MacroCard } from '../../components/MacroCard'
import { StreakCard } from '../../components/StreakCard'
import { MilestoneCard } from '../../components/MilestoneCard'
import { useTheme } from '../../components/theme'
import { AppText, SegToggle } from '../../components/ui'

type Range = 'today' | 'week' | 'month'
type ProgressRow = { date: string; calories: number; protein: number; carbs: number; fat: number; workouts: number; goal: number }
type LogRow = { calories?: number; protein?: number; carbs?: number; fat?: number; duration?: string | null }
type Milestone = { label: string; achieved: boolean }

const RANGE_OPTIONS: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

function localDateStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function InsightsScreen() {
  const t = useTheme()
  const [range, setRange] = useState<Range>('week')
  const today = localDateStr()
  const days = range === 'month' ? 30 : range === 'week' ? 7 : 1
  const progress = useQuery(api.progress.getProgress, { days, today }) as ProgressRow[] | undefined
  const meals = useQuery(api.meals.getMeals, { date: today }) as LogRow[] | undefined
  const workouts = useQuery(api.workouts.getWorkouts, { date: today }) as LogRow[] | undefined
  const weeklySummary = useQuery(api.insights.getWeeklySummary) as { content: string } | null | undefined
  const dailyInsights = useQuery(api.insights.getDailyInsights, { date: today }) as { insights?: string[] } | undefined
  const streak = useQuery(api.history.getStreak, { today }) as { streak: number } | undefined

  const currentMeals = meals ?? []
  const currentWorkouts = workouts ?? []
  const rows = progress ?? []
  const todayTotals = {
    kcal: Math.round(currentMeals.reduce((s, row) => s + (row.calories ?? 0), 0)),
    protein: Math.round(currentMeals.reduce((s, row) => s + (row.protein ?? 0), 0)),
    carbs: Math.round(currentMeals.reduce((s, row) => s + (row.carbs ?? 0), 0)),
    fat: Math.round(currentMeals.reduce((s, row) => s + (row.fat ?? 0), 0)),
  }
  const totals = range === 'today' ? todayTotals : {
    kcal: Math.round(rows.reduce((s, row) => s + row.calories, 0)),
    protein: Math.round(rows.reduce((s, row) => s + row.protein, 0)),
    carbs: Math.round(rows.reduce((s, row) => s + row.carbs, 0)),
    fat: Math.round(rows.reduce((s, row) => s + row.fat, 0)),
  }
  const workoutMinutes = currentWorkouts.reduce((s, row) => s + (Number.parseInt(row.duration ?? '', 10) || 0), 0)
  const activeDays = new Set(rows.filter((row) => row.calories > 0 || row.workouts > 0).map((row) => row.date)).size
  const milestones: Milestone[] = [
    { label: 'Protein', achieved: totals.protein > 0 },
    { label: 'Training', achieved: range === 'today' ? workoutMinutes > 0 : rows.some((row) => row.workouts > 0) },
    { label: 'Active days', achieved: activeDays >= Math.min(days, 3) },
  ]
  const narrative = range === 'today'
    ? dailyInsights?.insights?.[0] ?? `You have logged ${totals.kcal} kcal and ${totals.protein}g protein today.`
    : weeklySummary?.content ?? `You logged ${totals.kcal} kcal and ${totals.protein}g protein across the last ${days} days.`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View>
          <AppText variant="h1">Insights</AppText>
          <AppText variant="small" color={t.textSubtle} style={{ marginTop: 2 }}>What's working, what to watch</AppText>
        </View>

        <SegToggle value={range} options={RANGE_OPTIONS} onChange={setRange} />
        {!progress || !meals || !workouts ? (
          <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
            <AppText variant="body" color={t.textMuted}>Loading your insights…</AppText>
          </View>
        ) : <>
          <NarrativeCard type={range === 'today' ? 'daily' : 'weekly'} narrative={narrative} date={range === 'today' ? 'Today' : `Last ${days} days`} />
          <MacroCard {...totals} />
          <StreakCard days={streak?.streak ?? 0} quote="Consistency becomes useful when it is grounded in your real logs." />
          <MilestoneCard milestones={milestones} />
        </>}
      </ScrollView>
    </SafeAreaView>
  )
}
