import { View } from 'react-native'
import { PEACH, MINT, SKY, BUBBLEGUM, INK } from './theme'
import { AppText } from './ui'

const BG: Record<'mint' | 'sky' | 'peach' | 'bubblegum', string> = {
  mint:      MINT,
  sky:       SKY,
  peach:     PEACH,
  bubblegum: BUBBLEGUM,
}

interface StatChipProps {
  label: string
  value: string
  color: 'mint' | 'sky' | 'peach' | 'bubblegum'
  index?: number
}

export function StatChip({ label, value, color, index = 0 }: StatChipProps) {
  return (
    <View style={{ backgroundColor: BG[color], borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', minWidth: 100 }}>
      <AppText variant="overline" color={INK} style={{ fontSize: 11, letterSpacing: 1.2, marginBottom: 2, opacity: 0.55 }}>
        {label}
      </AppText>
      <AppText variant="hero" color={INK} style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.5 }}>
        {value}
      </AppText>
    </View>
  )
}
