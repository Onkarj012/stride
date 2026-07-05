import { View } from 'react-native'
import { useTheme, PEACH, MINT, SKY, BUBBLEGUM } from './theme'
import { AppText, Pill } from './ui'
import type { MacroData } from '../data'

const CHIPS: { key: keyof MacroData; label: (v: number) => string; color: 'peach' | 'mint' | 'sky' | 'bubblegum' }[] = [
  { key: 'kcal',    label: v => `${v} kcal`,    color: 'peach' },
  { key: 'protein', label: v => `${v}g protein`, color: 'mint' },
  { key: 'carbs',   label: v => `${v}g carbs`,   color: 'sky' },
  { key: 'fat',     label: v => `${v}g fat`,      color: 'bubblegum' },
]

export function MacroCard(props: MacroData) {
  const t = useTheme()

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <AppText variant="overline" style={{ marginBottom: 14 }}>Today's macros</AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {CHIPS.map((c) => (
          <View key={c.key} style={{ flex: 1, backgroundColor: { peach: PEACH, mint: MINT, sky: SKY, bubblegum: BUBBLEGUM }[c.color], borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' }}>
            <AppText variant="overline" style={{ marginBottom: 2, fontSize: 10, letterSpacing: 0.5 }}>{c.key}</AppText>
            <AppText variant="hero" color={t.text} style={{ fontSize: 18, lineHeight: 22, letterSpacing: -0.5 }}>{props[c.key]}</AppText>
          </View>
        ))}
      </View>
    </View>
  )
}
