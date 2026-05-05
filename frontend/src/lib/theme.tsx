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
    document.documentElement.style.setProperty('--theme-primary', accentColor)
    document.documentElement.style.setProperty('--theme-primary-text', accentTextColor)
    localStorage.setItem('accentColor', accentColor)
    localStorage.setItem('accentTextColor', accentTextColor)
  }, [accentColor, accentTextColor])

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
