import { useColorScheme, StyleSheet, type TextStyle } from 'react-native'
// Per-weight imports so only the faces we use end up in the bundle.
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold'
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold'
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular'
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium'
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold'
import {
  colors,
  shadows,
  type as typeScale,
  type ColorScheme,
  type FontRole,
  type Palette,
  type TextStyleToken,
  type TypeRole,
} from '@stride/ui-tokens'

// Static faces shipped to the device. Token weights snap to the nearest of these.
export const fontAssets = {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
}

type FontFace = keyof typeof fontAssets

const faces: Record<FontRole, Partial<Record<number, FontFace>>> = {
  display: { 600: 'BricolageGrotesque_600SemiBold', 700: 'BricolageGrotesque_700Bold' },
  body: { 400: 'Geist_400Regular', 500: 'Geist_500Medium', 600: 'Geist_600SemiBold' },
}

// Picks the shipped face closest to a token weight; ties go to the lighter face.
function faceFor(role: FontRole, weight: number): FontFace {
  const options = Object.entries(faces[role])
    .map(([w, face]) => ({ w: Number(w), face }))
    .sort((a, b) => Math.abs(a.w - weight) - Math.abs(b.w - weight) || a.w - b.w)
  const best = options[0]?.face
  if (!best) throw new Error(`No font face for ${role}`)
  return best
}

// React Native text style for a type role (em spacing and ratio line height become px).
export function font(role: TypeRole): TextStyle {
  const token: TextStyleToken = typeScale[role]
  return {
    fontFamily: faceFor(token.font, token.weight),
    fontSize: token.size,
    lineHeight: token.lineHeight ? Math.round(token.size * token.lineHeight) : undefined,
    letterSpacing: token.letterSpacing ? token.size * token.letterSpacing : undefined,
    textTransform: token.uppercase ? 'uppercase' : undefined,
    includeFontPadding: false,
  }
}

export type Theme = {
  scheme: ColorScheme
  c: Palette
  shadow: (typeof shadows)[ColorScheme]
}

const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', c: colors.light, shadow: shadows.light },
  dark: { scheme: 'dark', c: colors.dark, shadow: shadows.dark },
}

// Current color scheme from the system setting (V9). Unknown values fall back to light.
export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light'
}

// Theme for the current system color scheme.
export function useTheme(): Theme {
  return themes[useScheme()]
}

// Builds a StyleSheet once per scheme and returns a hook that picks the active one.
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(build: (t: Theme) => T): () => T {
  const sheets: Record<ColorScheme, T> = {
    light: StyleSheet.create(build(themes.light)),
    dark: StyleSheet.create(build(themes.dark)),
  }
  return function useStyles() {
    return sheets[useScheme()]
  }
}
