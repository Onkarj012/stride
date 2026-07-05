import { View } from 'react-native'
import { Icon } from './Icon'
import { useTheme } from './theme'
import { AppText, Pill } from './ui'
import type { Milestone } from '../data'

export function MilestoneCard({ milestones }: { milestones: Milestone[] }) {
  const achieved = milestones.filter(m => m.achieved).length
  const t = useTheme()

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <AppText variant="overline">Milestones</AppText>
        <AppText variant="caption" color={t.textSubtle} style={{ fontSize: 13 }}>{achieved}/{milestones.length}</AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {milestones.map((m, i) => (
          m.achieved ? (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Pill label={m.label} color="primary" size="sm" />
            </View>
          ) : (
            <View key={i} style={{
              borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
              borderWidth: 2, borderStyle: 'dashed', borderColor: t.borderMid,
            }}>
              <AppText variant="caption" color={t.textSubtle} style={{ fontSize: 13, fontFamily: 'Manrope_700Bold' }}>
                {m.label}
              </AppText>
            </View>
          )
        ))}
      </View>
    </View>
  )
}
