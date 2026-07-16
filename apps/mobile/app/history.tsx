import { useMemo, useState } from 'react'
import { ScrollView, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import Animated, { FadeInDown } from 'react-native-reanimated'
import * as Haptics from '../lib/haptics'
import { WorkoutSessionCard } from '../components/WorkoutSessionCard'
import { MealLogCard } from '../components/MealLogCard'
import { useTheme, SKY, BUBBLEGUM, MINT } from '../components/theme'
import { AppText, IconButton, ProgressBar } from '../components/ui'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const CAL_CELL_GAP = 4
const SPRING = { stiffness: 220, damping: 26 } as const

type CalendarDay = { meals: number; workouts: number; calories: number; burned: number }
type HistoryData = {
  meals?: Array<{ _id: string; name: string; calories: number; protein: number; carbs: number; fat: number; time?: string; mealType?: string }>
  workouts?: Array<{ _id: string; name: string; duration?: string | null; intensity?: string; caloriesBurned?: number | null; exercises?: unknown; structuredSets?: string | null }>
}

function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthGrid(year: number, month: number): (number | null)[][] {
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const days = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [...Array(offset).fill(null)]
  for (let day = 1; day <= days; day++) cells.push(day)
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

function parseExercises(workout: NonNullable<HistoryData['workouts']>[number]) {
  const raw = workout.exercises ?? workout.structuredSets
  if (!raw) return []
  const parsed = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw as string) } catch { return [] } })()
  return Array.isArray(parsed) ? parsed.map((exercise: any) => ({
    name: exercise?.normalizedName ?? exercise?.name ?? 'Exercise',
    sets: Array.isArray(exercise?.sets) ? exercise.sets.map((set: any) => ({
      weight: set?.weight != null ? String(set.weight) : set?.duration_min != null ? `${set.duration_min} min` : '—',
      reps: Number(set?.reps ?? 0),
    })) : [],
  })) : []
}

export default function HistoryScreen() {
  const router = useRouter()
  const t = useTheme()
  const today = new Date()
  const [selected, setSelected] = useState(localDateStr(today))
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const calendarData = useQuery(api.history.getCalendar, { year: month.getFullYear(), month: month.getMonth() + 1 }) as Record<string, CalendarDay> | undefined
  const dayData = useQuery(api.history.getDayHistory, { date: selected }) as HistoryData | undefined
  const water = useQuery(api.wellness.getWater, { date: selected }) as Array<{ ml: number }> | undefined
  const sleep = useQuery(api.wellness.getSleep, { date: selected }) as { hours?: number; band?: string } | null | undefined
  const recovery = useQuery(api.wellness.getRecoveryState, { date: selected }) as { state?: string; confidence?: string; missingInputs?: string[] } | null | undefined
  const grid = monthGrid(month.getFullYear(), month.getMonth() + 1)
  const meals = dayData?.meals ?? []
  const workouts = dayData?.workouts ?? []
  const waterMl = water?.reduce((sum, row) => sum + row.ml, 0) ?? 0
  const macros = useMemo(() => meals.reduce((sum, meal) => ({
    kcal: sum.kcal + meal.calories,
    protein: sum.protein + meal.protein,
    carbs: sum.carbs + meal.carbs,
    fat: sum.fat + meal.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [meals])

  function shiftMonth(delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    const selectedDay = new Date(`${selected}T12:00:00`).getDate()
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
    setMonth(nextMonth)
    setSelected(localDateStr(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selectedDay, lastDay))))
  }

  const selectedDate = new Date(`${selected}T12:00:00`)
  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20, paddingTop: 8 }}>
          <IconButton icon="back" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back() }} size={40} variant="ghost" iconSize={24} iconColor={t.textMuted} marginLeft={-8} />
          <AppText variant="h2">History</AppText>
        </View>

        <Animated.View entering={FadeInDown.springify().stiffness(SPRING.stiffness).damping(SPRING.damping)} style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20, marginBottom: 20 }, t.cardShadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <IconButton icon="chevronLeft" onPress={() => shiftMonth(-1)} size={36} variant="ghost" iconSize={18} iconColor={t.textMuted} />
            <AppText variant="title" style={{ fontSize: 17 }}>{monthLabel}</AppText>
            <IconButton icon="chevronRight" onPress={() => shiftMonth(1)} size={36} variant="ghost" iconSize={18} iconColor={t.textMuted} />
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {WEEKDAYS.map((day, index) => <View key={index} style={{ flex: 1, alignItems: 'center' }}><AppText variant="overline" style={{ fontSize: 11, letterSpacing: 0 }}>{day}</AppText></View>)}
          </View>
          <View style={{ gap: CAL_CELL_GAP }}>
            {grid.map((week, wi) => <View key={wi} style={{ flexDirection: 'row', gap: CAL_CELL_GAP }}>
              {week.map((day, di) => {
                if (day === null) return <View key={di} style={{ flex: 1, aspectRatio: 1 }} />
                const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const entry = calendarData?.[date]
                const active = selected === date
                return <Pressable key={day} onPress={() => { Haptics.selectionAsync(); setSelected(date) }} style={({ pressed }) => ({ flex: 1, aspectRatio: 1, borderRadius: 10, backgroundColor: active ? t.accent : entry?.meals || entry?.workouts ? entry.workouts ? MINT : SKY : t.dimBg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                  <AppText variant={active ? 'label' : 'caption'} color={active ? t.text : entry?.meals || entry?.workouts ? t.text : t.textMuted} style={{ fontSize: 12 }}>{day}</AppText>
                </Pressable>
              })}
            </View>)}
          </View>
        </Animated.View>

        <Animated.View key={selected} entering={FadeInDown.springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}>
          <AppText variant="title" style={{ letterSpacing: -0.5, marginBottom: 20 }}>{selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</AppText>
          {!dayData ? <AppText variant="body" color={t.textMuted}>Loading this day…</AppText> : <>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <View style={[{ flex: 1, backgroundColor: t.card, borderRadius: 16, padding: 16 }, t.cardShadow]}>
                <AppText variant="overline" style={{ marginBottom: 8 }}>Calories</AppText>
                <AppText variant="hero" style={{ fontSize: 24 }}>{Math.round(macros.kcal)}</AppText>
                <AppText variant="caption" color={t.textMuted}>P {Math.round(macros.protein)} · C {Math.round(macros.carbs)} · F {Math.round(macros.fat)}</AppText>
              </View>
              <View style={[{ flex: 1, backgroundColor: t.card, borderRadius: 16, padding: 16 }, t.cardShadow]}>
                <AppText variant="overline" style={{ marginBottom: 8 }}>Water</AppText>
                <AppText variant="hero" style={{ fontSize: 24 }}>{(waterMl / 1000).toFixed(1)}<AppText variant="caption"> L</AppText></AppText>
                <ProgressBar value={Math.min(waterMl / 2500, 1)} color={SKY} height={6} animated={false} />
              </View>
            </View>

            <AppText variant="overline" style={{ marginBottom: 12 }}>Workout · {workouts.length}</AppText>
            {workouts.length === 0 ? <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 20, marginBottom: 20 }, t.cardShadow]}><AppText variant="body" color={t.textMuted}>Rest day — no workout logged.</AppText></View> : workouts.map(workout => <View key={workout._id} style={{ marginBottom: 12 }}><WorkoutSessionCard session={{ title: workout.name, date: workout.intensity ?? 'Logged workout', durationMin: Number.parseInt(workout.duration ?? '', 10) || 0, burnKcal: workout.caloriesBurned ?? 0, exercises: parseExercises(workout) }} /></View>)}

            <AppText variant="overline" style={{ marginTop: 8, marginBottom: 12 }}>Meals · {meals.length} logged</AppText>
            <View style={{ gap: 12 }}>
              {meals.length === 0 ? <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 20 }, t.cardShadow]}><AppText variant="body" color={t.textMuted}>No meals logged.</AppText></View> : meals.map(meal => <MealLogCard key={meal._id} meal={meal.name} time={meal.time ?? meal.mealType ?? 'Meal'} macros={{ kcal: Math.round(meal.calories), protein: Math.round(meal.protein), carbs: Math.round(meal.carbs), fat: Math.round(meal.fat) }} confirmed />)}
            </View>

            {(recovery || sleep) && <View style={{ marginTop: 20, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.card }}>
              <AppText variant="label">{recovery ? 'Recovery record' : 'Sleep record'}</AppText>
              {recovery && <AppText variant="caption" color={t.textMuted} style={{ marginTop: 4 }}>state: {recovery.state ?? 'unknown'} · {recovery.confidence ?? 'confidence unavailable'}</AppText>}
              {recovery && recovery.missingInputs?.length ? <AppText variant="caption" color={t.textMuted}>unresolved: {recovery.missingInputs.join(', ')}</AppText> : null}
              {sleep?.hours != null ? <AppText variant="caption" color={t.textMuted}>sleep: {sleep.hours}h</AppText> : sleep?.band ? <AppText variant="caption" color={t.textMuted}>sleep band: {sleep.band.replaceAll('_', ' ')}</AppText> : null}
            </View>}
          </>}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}
