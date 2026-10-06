// Stride v5 design tokens. Single source for web (Tailwind @theme) and native (StyleSheet), per D20.
// Values come from the locked v5 mock. Sizes are px; letterSpacing is in em; lineHeight is a ratio of fontSize.

export type ColorScheme = 'light' | 'dark'

export type Palette = {
  bg: string
  card: string
  card2: string
  ink: string
  ink2: string
  ink3: string
  line: string
  line2: string
  polo: string
  poloInk: string
  poloSoft: string
  onPolo: string
  protein: string
  carbs: string
  fat: string
  dock: string
  dockInk: string
  dock3: string
  dockField: string
  dockIndicator: string
  scrim: string
}

export const colors: Record<ColorScheme, Palette> = {
  light: {
    bg: '#F4F1E9',
    card: '#FFFDF8',
    card2: '#EDE9DF',
    ink: '#1B1A17',
    ink2: '#57534B',
    ink3: '#8E897E',
    line: 'rgba(27,26,23,0.09)',
    line2: 'rgba(27,26,23,0.16)',
    polo: '#FF6A45',
    poloInk: '#C9431F',
    poloSoft: '#FFE3D9',
    onPolo: '#1B0C06',
    protein: '#5A5BD8',
    carbs: '#E3A233',
    fat: '#2F9C86',
    dock: '#1B1A17',
    dockInk: '#F4F1E9',
    dock3: 'rgba(244,241,233,0.55)',
    dockField: 'rgba(255,255,255,0.1)',
    dockIndicator: 'rgba(255,255,255,0.12)',
    scrim: 'rgba(15,14,12,0.36)',
  },
  dark: {
    bg: '#12110F',
    card: '#1C1A17',
    card2: '#26241F',
    ink: '#F2EEE5',
    ink2: '#B4AD9F',
    ink3: '#7E786C',
    line: 'rgba(242,238,229,0.08)',
    line2: 'rgba(242,238,229,0.16)',
    polo: '#FF7A58',
    poloInk: '#FF9A7E',
    poloSoft: '#3A2119',
    onPolo: '#1B0C06',
    protein: '#8B8CF0',
    carbs: '#EDB24B',
    fat: '#4DBFA6',
    dock: '#2A2824',
    dockInk: '#F2EEE5',
    dock3: 'rgba(242,238,229,0.5)',
    dockField: 'rgba(255,255,255,0.1)',
    dockIndicator: 'rgba(255,255,255,0.12)',
    scrim: 'rgba(15,14,12,0.36)',
  },
}

// CSS box-shadow syntax; React Native's boxShadow style accepts the same strings.
export const shadows: Record<ColorScheme, { card: string; sheet: string; dock: string; toast: string }> = {
  light: {
    card: '0 1px 0 rgba(27,26,23,0.04), 0 8px 24px -12px rgba(27,26,23,0.18)',
    sheet: '0 -12px 40px -12px rgba(27,26,23,0.28)',
    dock: '0 16px 36px -14px rgba(0,0,0,0.5)',
    toast: '0 18px 40px -16px rgba(0,0,0,0.55)',
  },
  dark: {
    card: '0 1px 0 rgba(0,0,0,0.2), 0 10px 30px -14px rgba(0,0,0,0.7)',
    sheet: '0 -12px 40px -8px rgba(0,0,0,0.7)',
    dock: '0 16px 36px -14px rgba(0,0,0,0.5)',
    toast: '0 18px 40px -16px rgba(0,0,0,0.55)',
  },
}

export const fonts = {
  display: 'Bricolage Grotesque',
  body: 'Geist',
} as const

export type FontRole = keyof typeof fonts

export type TextStyleToken = {
  font: FontRole
  size: number
  weight: number
  lineHeight?: number
  letterSpacing?: number
  uppercase?: boolean
}

export const type = {
  hero: { font: 'display', size: 92, weight: 720, lineHeight: 0.9, letterSpacing: -0.055 },
  onboardTitle: { font: 'display', size: 40, weight: 720, lineHeight: 1.02, letterSpacing: -0.045 },
  screenTitle: { font: 'display', size: 34, weight: 700, lineHeight: 1, letterSpacing: -0.04 },
  greeting: { font: 'display', size: 30, weight: 650, lineHeight: 1.05, letterSpacing: -0.035 },
  cardTitle: { font: 'display', size: 22, weight: 680, lineHeight: 1.15, letterSpacing: -0.03 },
  metric: { font: 'display', size: 22, weight: 650, lineHeight: 1.15, letterSpacing: -0.03 },
  emptyTitle: { font: 'display', size: 20, weight: 650, lineHeight: 1.2, letterSpacing: -0.02 },
  section: { font: 'display', size: 19, weight: 650, lineHeight: 1.2, letterSpacing: -0.02 },
  value: { font: 'display', size: 17, weight: 650, lineHeight: 1.25, letterSpacing: -0.02 },
  avatar: { font: 'display', size: 15, weight: 700, lineHeight: 1.2 },
  body: { font: 'body', size: 15, weight: 400, lineHeight: 1.4 },
  bodyStrong: { font: 'body', size: 15, weight: 600, lineHeight: 1.35 },
  lead: { font: 'body', size: 16, weight: 400, lineHeight: 1.5 },
  button: { font: 'body', size: 14.5, weight: 600, lineHeight: 1.2 },
  input: { font: 'body', size: 14.5, weight: 400, lineHeight: 1.3 },
  callout: { font: 'body', size: 14, weight: 400, lineHeight: 1.45 },
  calloutStrong: { font: 'body', size: 14, weight: 600, lineHeight: 1.25 },
  secondary: { font: 'body', size: 13.5, weight: 400, lineHeight: 1.4 },
  link: { font: 'body', size: 13, weight: 500, lineHeight: 1.3 },
  caption: { font: 'body', size: 12.5, weight: 400, lineHeight: 1.35 },
  label: { font: 'body', size: 12, weight: 500, lineHeight: 1.3 },
  eyebrow: { font: 'body', size: 11.5, weight: 600, lineHeight: 1.3, letterSpacing: 0.1, uppercase: true },
  tag: { font: 'body', size: 10.5, weight: 600, lineHeight: 1.3, letterSpacing: 0.04, uppercase: true },
} as const satisfies Record<string, TextStyleToken>

export type TypeRole = keyof typeof type

export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  4.5: 18,
  5: 20,
  5.5: 22,
  6: 24,
  6.5: 26,
  7.5: 30,
} as const

export const layout = {
  screenX: 20,
  screenTop: 12,
  screenBottom: 150,
  sectionTop: 30,
  sectionBottom: 12,
  cardPadding: 18,
  dockInsetX: 16,
  dockInsetBottom: 22,
  dockHeight: 62,
  dockPadding: 7,
  dockButton: 44,
  dockButtonHeight: 48,
  perchSize: 40,
  perchLift: 50,
  avatar: 40,
  iconButton: 40,
  icon: 20,
  iconStroke: 1.9,
} as const

export const radii = {
  tag: 6,
  sm: 14,
  md: 18,
  card: 22,
  field: 24,
  sheet: 30,
  dock: 31,
  pill: 999,
} as const

export type SpringToken = { stiffness: number; damping: number; mass: number }

export const motion = {
  // smooth: settles without overshoot (screens, sheets). bouncy: visible overshoot (presses, indicator, bars).
  spring: {
    smooth: { stiffness: 420, damping: 34, mass: 1 },
    bouncy: { stiffness: 300, damping: 17, mass: 1 },
  },
  // Cubic-bezier fallbacks for platforms without spring physics.
  easing: {
    smooth: [0.2, 0.9, 0.25, 1.05],
    bouncy: [0.3, 1.5, 0.5, 1],
  },
  duration: {
    press: 250,
    color: 250,
    screen: 420,
    bar: 600,
    perch: 700,
    toast: 500,
  },
  press: { scale: 0.95, iconScale: 0.88, cardScale: 0.94, rowScale: 0.98 },
  screenShift: 26,
  mascot: {
    breathe: 3600,
    sleepBreathe: 5000,
    blinkEvery: 1400,
    blinkChance: 0.35,
    blink: 130,
    hop: 620,
    zz: 2600,
  },
} as const satisfies {
  spring: Record<string, SpringToken>
  easing: Record<string, readonly number[]>
  duration: Record<string, number>
  press: Record<string, number>
  screenShift: number
  mascot: Record<string, number>
}

export const tokens = { colors, shadows, fonts, type, space, layout, radii, motion } as const
