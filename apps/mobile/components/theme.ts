import { useColorScheme } from 'react-native'

// Brand constants — NEVER flip with theme (DS spec)
export const INK = '#0d101b'
export const LAVENDER = '#b3a0ff'
export const SKY = '#a0c6ff'
export const PEACH = '#fdb572'
export const MINT = '#b8e5c0'
export const BUBBLEGUM = '#f4b5d6'
export const SUNSHINE = '#ffc93b'

// Spacing scale (4pt grid) — theme-independent
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const
export const RADIUS = { sm: 10, md: 14, lg: 18, pill: 999 } as const
export const TAP_MIN = 48

const LIGHT = {
  bg: '#f8f8f8',
  card: '#ffffff',
  cardElev: '#ffffff',
  input: '#f3f3f5',
  text: '#0d101b',
  textMuted: 'rgba(13,16,27,0.55)',
  textSubtle: 'rgba(13,16,27,0.35)',
  textOnInk: '#ffffff',
  border: 'rgba(13,16,27,0.06)',
  borderMid: 'rgba(13,16,27,0.1)',
  dimBg: 'rgba(13,16,27,0.04)',
  dimBgMid: 'rgba(13,16,27,0.08)',
  shadowColor: '#0d101b',
  shadowOpacity: 0.07,
  tabBg: 'rgba(248,248,248,0.95)',
  statusBar: 'dark' as const,
  // semantic button roles
  buttonPrimaryBg: INK,
  buttonPrimaryText: '#ffffff',
  buttonSecondaryBg: 'rgba(13,16,27,0.06)',
  buttonSecondaryText: '#0d101b',
  buttonGhostText: 'rgba(13,16,27,0.55)',
  fabBg: LAVENDER,
  fabIcon: INK,
  iconBadgeBg: 'rgba(13,16,27,0.08)',
  iconBadgeIcon: 'rgba(13,16,27,0.55)',
  accent: LAVENDER,
  // chat
  chatUserBg: INK,
  chatUserText: '#ffffff',
  // tab bar
  tabIconActive: INK,
  tabIconInactive: 'rgba(13,16,27,0.40)',
  cardShadow: {
    shadowColor: '#0d101b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  floatShadow: {
    shadowColor: '#0d101b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
}

const DARK = {
  bg: '#0c0e16',
  card: '#161927',
  cardElev: '#1f2233',
  input: '#1c1f2d',
  text: '#eceaf5',
  textMuted: 'rgba(236,234,245,0.55)',
  textSubtle: 'rgba(236,234,245,0.35)',
  textOnInk: '#eceaf5',
  border: 'rgba(255,255,255,0.07)',
  borderMid: 'rgba(255,255,255,0.12)',
  dimBg: 'rgba(255,255,255,0.05)',
  dimBgMid: 'rgba(255,255,255,0.09)',
  shadowColor: '#000000',
  shadowOpacity: 0.5,
  tabBg: 'rgba(12,14,22,0.95)',
  statusBar: 'light' as const,
  // semantic button roles — LAVENDER primary fixes black-on-black in dark
  buttonPrimaryBg: LAVENDER,
  buttonPrimaryText: INK,
  buttonSecondaryBg: 'rgba(255,255,255,0.09)',
  buttonSecondaryText: '#eceaf5',
  buttonGhostText: 'rgba(236,234,245,0.55)',
  fabBg: LAVENDER,
  fabIcon: INK,
  iconBadgeBg: 'rgba(255,255,255,0.09)',
  iconBadgeIcon: 'rgba(236,234,245,0.55)',
  accent: LAVENDER,
  // chat
  chatUserBg: '#2a2d3e',
  chatUserText: '#eceaf5',
  // tab bar
  tabIconActive: LAVENDER,
  tabIconInactive: 'rgba(255,255,255,0.40)',
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  floatShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 10,
  },
}

type ThemeBase = Omit<typeof LIGHT, 'statusBar' | 'cardShadow' | 'floatShadow'>
export type Theme = ThemeBase & {
  statusBar: 'light' | 'dark'
  cardShadow: Record<string, any>
  floatShadow: Record<string, any>
}

export function useTheme(): Theme {
  const scheme = useColorScheme()
  return scheme === 'dark' ? DARK : LIGHT
}
