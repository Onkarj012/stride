import { View } from 'react-native'
import { useTheme, PEACH, SUNSHINE } from './theme'
import { AppText } from './ui'

interface StreakCardProps {
  days: number
  label?: string
  quote?: string
}

export function StreakCard({ days, label = 'day streak', quote }: StreakCardProps) {
  const t = useTheme()

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <AppText variant="overline" style={{ marginBottom: 12 }}>Consistency</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 10 }}>
        <AppText variant="hero" color={PEACH}>{days}</AppText>
        <AppText variant="title" color={t.textMuted} style={{ lineHeight: 60, paddingBottom: 4 }}>{label}</AppText>
      </View>
      {quote && (
        <AppText variant="body" color={t.textMuted} style={{ lineHeight: 20, fontStyle: 'italic', marginBottom: 16 }}>
          "{quote}"
        </AppText>
      )}
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={{ height: 6, flex: 1, borderRadius: 3, backgroundColor: i < Math.min(days, 7) ? SUNSHINE : t.dimBgMid }} />
        ))}
      </View>
    </View>
  )
}
