import { View } from 'react-native'
import { useTheme, PEACH, MINT, SKY, BUBBLEGUM } from './theme'
import { AppText, ProgressBar } from './ui'
import type { MacroData } from '../data'

const MACRO_META: { key: keyof MacroData; label: string; color: string }[] = [
  { key: 'kcal',    label: 'Calories', color: PEACH },
  { key: 'protein', label: 'Protein',  color: MINT },
  { key: 'carbs',   label: 'Carbs',    color: SKY },
  { key: 'fat',     label: 'Fat',      color: BUBBLEGUM },
]

export function MacroSummary({ totals, target }: { totals: MacroData; target: MacroData }) {
  const left = Math.max(target.kcal - totals.kcal, 0)
  const t = useTheme()

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <AppText variant="overline" style={{ marginBottom: 4 }}>Today's fuel</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <AppText variant="hero" style={{ fontSize: 34, letterSpacing: -1.5, lineHeight: 40 }}>{left.toLocaleString()}</AppText>
            <AppText variant="label" color={t.textMuted} style={{ fontSize: 15 }}>kcal left</AppText>
          </View>
        </View>
        <AppText variant="caption" color={t.textSubtle} style={{ fontSize: 12, fontFamily: 'Manrope_800ExtraBold' }}>
          {totals.kcal} / {target.kcal}
        </AppText>
      </View>

      <View style={{ gap: 10 }}>
        {MACRO_META.map(m => {
          const pct = Math.min(totals[m.key] / target[m.key], 1)
          return (
            <View key={m.key}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <AppText variant="caption" color={t.textMuted} style={{ fontFamily: 'Manrope_700Bold', fontSize: 12 }}>{m.label}</AppText>
                <AppText variant="caption" color={t.text} style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 12 }}>
                  {totals[m.key]}
                  <AppText variant="caption" color={t.textSubtle} style={{ fontSize: 12 }}>
                    {' '}/ {target[m.key]}{m.key === 'kcal' ? '' : 'g'}
                  </AppText>
                </AppText>
              </View>
              <ProgressBar value={pct} color={m.color} height={8} />
            </View>
          )
        })}
      </View>
    </View>
  )
}
