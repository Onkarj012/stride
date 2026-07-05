import { View } from 'react-native'
import { useTheme } from './theme'
import { AppText, Pill } from './ui'
import type { WorkoutSession } from '../data'

export function WorkoutSessionCard({ session }: { session: WorkoutSession }) {
  const totalSets = session.exercises.reduce((s, e) => s + e.sets.length, 0)
  const t = useTheme()

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <View>
          <AppText variant="overline" style={{ marginBottom: 4 }}>Session</AppText>
          <AppText variant="title">{session.title}</AppText>
          <AppText variant="small" color={t.textMuted} style={{ marginTop: 2 }}>{session.date}</AppText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Pill label={`${session.burnKcal} kcal`} color="peach" />
          <Pill label={`${session.durationMin} min`} color="mint" size="sm" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AppText variant="overline">{session.exercises.length} exercises</AppText>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.textSubtle }} />
        <AppText variant="overline">{totalSets} sets</AppText>
      </View>

      <View style={{ gap: 10 }}>
        {session.exercises.map((ex, i) => (
          <View key={i} style={{ backgroundColor: t.dimBg, borderRadius: 14, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <AppText variant="label">{ex.name}</AppText>
              <AppText variant="caption" color={t.textMuted} style={{ fontSize: 11 }}>{ex.sets.length} sets</AppText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ex.sets.map((set, j) => (
                <View key={j} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: t.card, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7,
                  minWidth: '47%', ...t.cardShadow,
                }}>
                  <AppText variant="overline" color={t.textSubtle} style={{ fontSize: 10, letterSpacing: 0, minWidth: 14 }}>{j + 1}</AppText>
                  <AppText variant="label" style={{ fontSize: 12 }}>{set.weight}</AppText>
                  {set.reps > 0 && <>
                    <AppText variant="body" color={t.textMuted} style={{ fontSize: 12 }}>×</AppText>
                    <AppText variant="label" style={{ fontSize: 12 }}>{set.reps}</AppText>
                  </>}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
