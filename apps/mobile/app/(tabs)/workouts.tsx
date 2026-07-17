import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { WorkoutSessionCard } from '../../components/WorkoutSessionCard'
import { useTheme } from '../../components/theme'
import { AppText, Pill } from '../../components/ui'

type WorkoutRow = {
  _id: string
  name: string
  duration?: string | null
  intensity?: string
  exercises?: unknown
  structuredSets?: string | null
  caloriesBurned?: number | null
}

type WorkoutExercise = { name: string; sets: Array<{ weight: string; reps: number }> }

function parseExercises(workout: WorkoutRow): WorkoutExercise[] {
  const raw = workout.exercises ?? workout.structuredSets
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(normalizeExercise)
  try {
    const parsed = JSON.parse(raw as string)
    return Array.isArray(parsed) ? parsed.map(normalizeExercise) : []
  } catch {
    return []
  }
}

function normalizeExercise(raw: any): WorkoutExercise {
  return {
    name: raw?.normalizedName ?? raw?.name ?? 'Exercise',
    sets: Array.isArray(raw?.sets) ? raw.sets.map((set: any) => ({
      weight: set?.weight != null ? String(set.weight) : set?.duration_min != null ? `${set.duration_min} min` : '—',
      reps: Number(set?.reps ?? 0),
    })) : [],
  }
}

function localDateStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function WorkoutsScreen() {
  const t = useTheme()
  const workouts = useQuery(api.workouts.getWorkouts, { date: localDateStr() }) as WorkoutRow[] | undefined
  const rows = workouts ?? []
  const totalExercises = rows.reduce((n, w) => n + parseExercises(w).length, 0)
  const totalSets = rows.reduce((n, w) => n + parseExercises(w).reduce((m, e) => m + e.sets.length, 0), 0)
  const totalKcal = Math.round(rows.reduce((n, w) => n + (w.caloriesBurned ?? 0), 0))
  const totalMin = rows.reduce((n, w) => n + (Number.parseInt(w.duration ?? '', 10) || 0), 0)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View>
          <AppText variant="h1">Workouts</AppText>
          <AppText variant="small" color={t.textSubtle} style={{ marginTop: 2 }}>{workouts ? `${rows.length} sessions today` : 'Loading today…'}</AppText>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pill label={`${totalExercises} exercises`} color="primary" />
          <Pill label={`${totalSets} sets`} color="sky" />
          <Pill label={`${totalKcal} kcal`} color="peach" />
          <Pill label={`${totalMin} min`} color="mint" />
        </View>

        {!workouts ? null : rows.length === 0 ? (
          <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
            <AppText variant="body" color={t.textMuted}>No workouts logged today.</AppText>
            <AppText variant="small" color={t.textSubtle} style={{ marginTop: 4 }}>Tell Stry what you did and it will log it.</AppText>
          </View>
        ) : rows.map((workout) => (
          <WorkoutSessionCard
            key={workout._id}
            session={{
              title: workout.name,
              date: `Today · ${workout.intensity ?? 'logged'} intensity`,
              durationMin: Number.parseInt(workout.duration ?? '', 10) || 0,
              burnKcal: workout.caloriesBurned ?? 0,
              exercises: parseExercises(workout),
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
