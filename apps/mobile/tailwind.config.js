/** @type {import('tailwindcss').Config} */

// Token values from @stride/shared/tokens — pin Tailwind 3.4 for NativeWind compat (web uses v4)
// TODO: auto-generate this config from packages/shared/src/build-tokens.ts

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand
        ink: '#0d101b',
        lavender: '#b3a0ff',
        sky: '#a0c6ff',
        peach: '#fdb572',
        mint: '#b8e5c0',
        bubblegum: '#f4b5d6',
        sunshine: '#ffc93b',
        // Semantic light (dark overrides via .dark / dark: prefix)
        bg: '#f8f8f8',
        card: '#ffffff',
        input: '#f3f3f5',
        border: '#ebebef',
        text: {
          DEFAULT: '#0d101b',
          muted: '#6a7081',
          subtle: '#9099ad',
        },
        error: '#d93025',
        success: '#3D9A57',
      },
      fontFamily: {
        // PostScript names match @expo-google-fonts/manrope loaded fonts
        sans: ['Manrope_400Regular'],
        medium: ['Manrope_500Medium'],
        semibold: ['Manrope_600SemiBold'],
        bold: ['Manrope_700Bold'],
        extrabold: ['Manrope_800ExtraBold'],
      },
      borderRadius: {
        sm: 10,
        md: 16,
        lg: 20,
        xl: 24,
        full: 9999,
      },
      spacing: {
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
      },
    },
  },
  plugins: [],
};
