import { createContext, useContext, useEffect, useState } from 'react'

const ACCENT_COLORS: Record<string, string> = {
  purple: '#7c3aed',
  blue: '#2563eb',
  emerald: '#059669',
  rose: '#e11d48',
  amber: '#d97706',
  slate: '#475569',
}

interface ThemeContextValue {
  accent: string
  accentKey: string
  setAccentKey: (key: string) => void
  accentColors: Record<string, string>
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: ACCENT_COLORS.purple,
  accentKey: 'purple',
  setAccentKey: () => {},
  accentColors: ACCENT_COLORS,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accentKey, setAccentKey] = useState(() => localStorage.getItem('hm_accent') ?? 'purple')

  const accent = ACCENT_COLORS[accentKey] ?? ACCENT_COLORS.purple

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    localStorage.setItem('hm_accent', accentKey)
  }, [accent, accentKey])

  return (
    <ThemeContext.Provider value={{ accent, accentKey, setAccentKey, accentColors: ACCENT_COLORS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
