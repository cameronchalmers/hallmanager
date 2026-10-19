import { createContext, useContext, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

// Full Tailwind scales rather than one hex per accent, so tints, rings and
// dark-mode fills all follow the picked colour instead of only the buttons.
const ACCENT_SCALES: Record<string, string[]> = {
  //         50         100        200        300        400        500        600        700        800        900        950
  purple:  ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
  blue:    ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  rose:    ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
  amber:   ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
  slate:   ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
}
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

const ACCENT_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(ACCENT_SCALES).map(([key, scale]) => [key, scale[6]]),
)

function channels(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

interface ThemeContextValue {
  accent: string
  accentKey: string
  setAccentKey: (key: string) => void
  accentColors: Record<string, string>
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (p: ThemePreference) => void
  setForcedLight: (forced: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: ACCENT_COLORS.purple,
  accentKey: 'purple',
  setAccentKey: () => {},
  accentColors: ACCENT_COLORS,
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
  setForcedLight: () => {},
})

const STORAGE_KEY = 'hallmanager.theme'

function initialPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  // The old switch wrote 'true' or 'false' on every load, so anybody who has
  // used the app before has an explicit answer and should keep it rather than
  // flipping to dark because their laptop is.
  const legacy = localStorage.getItem('hm_dark')
  if (legacy === 'true') return 'dark'
  if (legacy === 'false') return 'light'
  return 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accentKey, setAccentKey] = useState(() => localStorage.getItem('hm_accent') ?? 'purple')
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference)
  // Set by useForceLightMode on the hirer-facing pages. It lives here rather
  // than in the hook because a page that removed the class itself lost the
  // race: this provider's effect runs after its children's and put it back.
  const [forcedLight, setForcedLight] = useState(false)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  const scale = ACCENT_SCALES[accentKey] ?? ACCENT_SCALES.purple
  const accent = scale[6]

  useEffect(() => {
    const root = document.documentElement.style
    STEPS.forEach((step, i) => root.setProperty(`--brand-${step}`, channels(scale[i])))
    localStorage.setItem('hm_accent', accentKey)
  }, [accentKey])

  // Following the system means following it as it changes, not just at load.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' = forcedLight
    ? 'light'
    : preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  function setPreference(next: ThemePreference) {
    setPreferenceState(next)
    localStorage.removeItem('hm_dark')
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <ThemeContext.Provider value={{
      accent, accentKey, setAccentKey, accentColors: ACCENT_COLORS,
      preference, resolved, setPreference, setForcedLight,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
