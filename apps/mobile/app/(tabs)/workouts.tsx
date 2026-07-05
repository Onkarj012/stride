import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WorkoutSessionCard } from '../../components/WorkoutSessionCard'
import { useTheme, SKY, PEACH, MINT } from '../../components/theme'
import { AppText, Pill } from '../../components/ui'
import { TODAY_SESSIONS } from '../../data'

export default function WorkoutsScreen() {
  const t = useTheme()
  const totalExercises = TODAY_SESSIONS.reduce((n, s) => n + s.exercises.length, 0)
  const totalSets = TODAY_SESSIONS.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0)
  const totalKcal = TODAY_SESSIONS.reduce((n, s) => n + s.burnKcal, 0)
  const totalMin = TODAY_SESSIONS.reduce((n, s) => n + s.durationMin, 0)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <AppText variant="h1">Workouts</AppText>
          <AppText variant="small" color={t.textSubtle} style={{ marginTop: 2 }}>{TODAY_SESSIONS.length} sessions today</AppText>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pill label={`${totalExercises} exercises`} color="primary" />
          <Pill label={`${totalSets} sets`}           color="sky" />
          <Pill label={`${totalKcal} kcal`}           color="peach" />
          <Pill label={`${totalMin} min`}             color="mint" />
        </View>

        {TODAY_SESSIONS.map((s, i) => (
          <WorkoutSessionCard key={i} session={s} />
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
