import { View, Text } from 'react-native'
import { useTheme, PEACH, MINT, SKY, BUBBLEGUM, LAVENDER, SUNSHINE, INK } from '../theme'

type PillColor = 'peach' | 'mint' | 'sky' | 'bubblegum' | 'lavender' | 'sunshine' | 'primary'

interface PillProps {
  label: string
  color?: PillColor
  size?: 'sm' | 'md'
}

const BRAND: Record<Exclude<PillColor, 'primary'>, { bg: string; text: string }> = {
  peach:     { bg: PEACH,     text: INK },
  mint:      { bg: MINT,      text: INK },
  sky:       { bg: SKY,       text: INK },
  bubblegum: { bg: BUBBLEGUM, text: INK },
  lavender:  { bg: LAVENDER,  text: INK },
  sunshine:  { bg: SUNSHINE,  text: INK },
}

export function Pill({ label, color = 'primary', size = 'md' }: PillProps) {
  const t = useTheme()
  const bg = color === 'primary' ? t.buttonPrimaryBg : BRAND[color].bg
  const textColor = color === 'primary' ? t.buttonPrimaryText : BRAND[color].text
  const px = size === 'sm' ? 10 : 12
  const py = size === 'sm' ? 4 : 6
  const fs = size === 'sm' ? 11 : 13

  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: px, paddingVertical: py }}>
      <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: fs, color: textColor }}>
        {label}
      </Text>
    </View>
  )
}
