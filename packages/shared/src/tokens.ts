export const colors = {
  brand: {
    ink: '#0d101b',
    lavender: '#b3a0ff',
    sky: '#a0c6ff',
    peach: '#fdb572',
    mint: '#b8e5c0',
    bubblegum: '#f4b5d6',
    sunshine: '#ffc93b',
    surface: '#f8f8f8', // light off-white; used by ui-kit cards (fixed, not flipped)
  },

  light: {
    lavenderSoft: '#EDE8FF',
    skySoft: '#E7F0FF',
    peachSoft: '#FFEEDC',
    mintSoft: '#E6F7EA',
    bubblegumSoft: '#FCEAF3',

    bubbleUser: '#0d101b',
    bubbleUserText: '#ffffff',

    bg: '#f8f8f8',
    card: '#ffffff',
    cardElev: '#ffffff',
    input: '#f3f3f5',

    text: '#0d101b',
    textMuted: '#6a7081',
    textSubtle: '#9099ad',
    textOnInk: '#ffffff',
    textOnAccent: '#0d101b',

    border: '#ebebef',
    borderStrong: '#d9d9e0',

    error: '#d93025',
    success: '#3D9A57',
    successSoft: '#E6F7EA',
    streak: '#F09A3E',

    shadowFloat: '0 8px 24px rgba(13, 16, 27, 0.12)',
    shadowCardHover: '0 4px 16px rgba(13, 16, 27, 0.08)',
    shadowElev: '0 12px 32px rgba(13, 16, 27, 0.06)',
    shadowSoft: '0 2px 10px rgba(13, 16, 27, 0.05)',
  },

  dark: {
    lavenderSoft: '#252240',
    skySoft: '#1b2540',
    peachSoft: '#33200f',
    mintSoft: '#172a1c',
    bubblegumSoft: '#2c1832',

    bubbleUser: '#2a2e4a',
    bubbleUserText: '#ECEAF5',

    bg: '#0c0e16',
    card: '#161927',
    cardElev: '#1f2233',
    input: '#1c1f2d',

    text: '#ECEAF5',
    textMuted: '#8b91a6',
    textSubtle: '#5b6178',
    textOnInk: '#ECEAF5',
    textOnAccent: '#0d101b',

    border: '#21243a',
    borderStrong: '#2c3045',

    error: '#f27b72',

    shadowFloat: '0 12px 32px rgba(0, 0, 0, 0.5)',
    shadowCardHover: '0 6px 20px rgba(0, 0, 0, 0.35)',
    shadowElev: '0 12px 32px rgba(0, 0, 0, 0.35)',
    shadowSoft: '0 2px 10px rgba(0, 0, 0, 0.4)',
  },
} as const

export const typography = {
  fontSans: '"Manrope", "Plus Jakarta Sans", "Inter", system-ui, sans-serif',

  scale: {
    micro: { size: '0.8125rem', lh: '1.3' },
    caption: { size: '0.9375rem', lh: '1.4' },
    body: { size: '1.0625rem', lh: '1.55' },
    h3: { size: '1.1875rem', lh: '1.3' },
    h2: { size: '1.4375rem', lh: '1.3' },
    h1: { size: '1.875rem', lh: '1.2' },
    display: { size: '2.5rem', lh: '1.1' },
    statValue: { size: '1.5rem', lh: '1' },
    statLabel: { size: '0.75rem', lh: '1.2' },
  },

  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },

  tracking: {
    tight: '-0.5px',
    normal: '0',
    label: '1.2px',
  },
} as const

export const spacing = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
} as const

export const radius = {
  sm: '10px',
  md: '16px',
  lg: '20px',
  xl: '24px',
  full: '9999px',
} as const

export const motion = {
  easeOutSoft: 'cubic-bezier(0.22, 1, 0.36, 1)',
  durFast: '150ms',
  durBase: '250ms',
  durSlow: '350ms',
} as const
