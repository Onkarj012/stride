import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export const colorSchemes = [
  { name: 'Volt', value: '#CCFF00', textColor: '#000000' },
  { name: 'Blaze', value: '#FF3B30', textColor: '#FFFFFF' },
  { name: 'Cyan', value: '#00FFFF', textColor: '#000000' },
  { name: 'Magenta', value: '#FF00FF', textColor: '#FFFFFF' },
] as const

interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
  accentColor: string
  accentTextColor: string
  setAccentColor: (color: string, textColor: string) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
}

function perceivedBrightness(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000
}

function darkenColor(hex: string, factor: number = 0.55): string {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r * factor, g * factor, b * factor)
}

function getLightModeAccent(hex: string): string {
  const known: Record<string, string> = {
    '#CCFF00': '#7A9900',
    '#00FFFF': '#009999',
    '#FF00FF': '#990099',
  }
  if (known[hex.toUpperCase()]) return known[hex.toUpperCase()]
  if (perceivedBrightness(hex) > 180) {
    return darkenColor(hex, 0.5)
  }
  return hex
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return true
  })

  const [accentColor, setAccentColorState] = useState(() => {
    return localStorage.getItem('accentColor') || '#CCFF00'
  })

  const [accentTextColor, setAccentTextColorState] = useState(() => {
    return localStorage.getItem('accentTextColor') || '#000000'
  })

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    const effectiveColor = isDark ? accentColor : getLightModeAccent(accentColor)
    document.documentElement.style.setProperty('--theme-primary', effectiveColor)
    document.documentElement.style.setProperty('--theme-primary-text', accentTextColor)
    localStorage.setItem('accentColor', accentColor)
    localStorage.setItem('accentTextColor', accentTextColor)
  }, [accentColor, accentTextColor, isDark])

  const toggleTheme = useCallback(() => {
    setIsDark(prev => !prev)
  }, [])

  const setAccentColor = useCallback((color: string, textColor: string) => {
    setAccentColorState(color)
    setAccentTextColorState(textColor)
  }, [])

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, accentColor, accentTextColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
