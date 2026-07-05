import { Text } from 'react-native'
import type { ReactNode } from 'react'
import { useTheme } from '../theme'

type Variant = 'h1' | 'h2' | 'title' | 'body' | 'label' | 'caption' | 'overline' | 'small' | 'hero'

interface AppTextProps {
  variant?: Variant
  color?: string
  style?: object
  numberOfLines?: number
  children: ReactNode
}

const SPEC: Record<Variant, { fontFamily: string; fontSize: number; letterSpacing?: number; lineHeight?: number; textTransform?: 'uppercase'; textRole: 'text' | 'textMuted' | 'textSubtle' }> = {
  hero:     { fontFamily: 'Manrope_800ExtraBold', fontSize: 58, letterSpacing: -2, lineHeight: 60, textRole: 'text' },
  h1:       { fontFamily: 'Manrope_800ExtraBold', fontSize: 26, letterSpacing: -1, textRole: 'text' },
  h2:       { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, letterSpacing: -0.5, textRole: 'text' },
  title:    { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, letterSpacing: -0.5, textRole: 'text' },
  label:    { fontFamily: 'Manrope_700Bold',       fontSize: 14, textRole: 'text' },
  body:     { fontFamily: 'Manrope_500Medium',     fontSize: 14, lineHeight: 21, textRole: 'text' },
  small:    { fontFamily: 'Manrope_500Medium',     fontSize: 13, textRole: 'textMuted' },
  caption:  { fontFamily: 'Manrope_500Medium',     fontSize: 12, textRole: 'textSubtle' },
  overline: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', textRole: 'textSubtle' },
}

export function AppText({ variant = 'body', color, style, numberOfLines, children }: AppTextProps) {
  const t = useTheme()
  const spec = SPEC[variant]
  const defaultColor = t[spec.textRole]
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: spec.fontFamily,
          fontSize: spec.fontSize,
          color: color ?? defaultColor,
          ...(spec.letterSpacing !== undefined && { letterSpacing: spec.letterSpacing }),
          ...(spec.lineHeight !== undefined && { lineHeight: spec.lineHeight }),
          ...(spec.textTransform !== undefined && { textTransform: spec.textTransform }),
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
