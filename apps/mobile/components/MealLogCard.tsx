import { View } from 'react-native'
import { Icon } from './Icon'
import { useTheme } from './theme'
import { AppText, Pill } from './ui'
import type { MealLogCardProps } from '../data'

export function MealLogCard({ meal, time, macros, confirmed }: MealLogCardProps) {
  const t = useTheme()

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="overline" style={{ marginBottom: 4 }}>{time}</AppText>
          <AppText variant="title" style={{ fontSize: 17 }}>{meal}</AppText>
        </View>
        {confirmed && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(29,138,74,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Icon name="check" size={12} color="#1a8a4a" />
            <AppText variant="overline" color="#1a8a4a" style={{ letterSpacing: 1, fontSize: 11 }}>logged</AppText>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        <Pill label={`${macros.kcal} kcal`}    color="peach" />
        <Pill label={`${macros.protein}g protein`} color="mint" />
        <Pill label={`${macros.carbs}g carbs`}  color="sky" />
        <Pill label={`${macros.fat}g fat`}      color="bubblegum" />
      </View>
    </View>
  )
}

export function MealLogCardEmpty() {
  const t = useTheme()
  return (
    <View style={{
      backgroundColor: t.card,
      borderRadius: 20, padding: 20,
      borderWidth: 2, borderStyle: 'dashed',
      borderColor: t.borderMid,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(179,160,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chat" size={14} color={t.accent} />
        </View>
        <AppText variant="body" color={t.textMuted} style={{ flex: 1, fontSize: 15 }}>
          "What did you have for breakfast?"
        </AppText>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ height: 20, width: 128, backgroundColor: t.dimBgMid, borderRadius: 999 }} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ height: 28, width: 96, backgroundColor: t.dimBgMid, borderRadius: 999 }} />
          <View style={{ height: 28, width: 96, backgroundColor: t.dimBgMid, borderRadius: 999 }} />
        </View>
      </View>
    </View>
  )
}
