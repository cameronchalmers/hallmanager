import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  Building2, CalendarDays, CalendarPlus, ChartColumn, ClipboardList, Gauge, House, LogOut,
  Monitor, Moon, Settings, Sun, User, Users,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ThemePreference } from '../context/ThemeContext'
import { useSite } from '../context/SiteContext'
import { supabase } from '../lib/supabase'
import type { AppUser, Site } from '../lib/database.types'

/// The signed-in shell, laid out the same way as BuildingSafe and VehicleSafe:
/// a sticky header with the site picker and account controls, and one row of
/// tabs underneath. It replaced a fixed sidebar, which on a phone was a
/// hamburger menu hiding every page behind an extra tap.
export default function Layout({ children, pageTitle, actions }: {
  children: React.ReactNode
  pageTitle?: string
  actions?: React.ReactNode
}) {
  const { pathname } = useLocation()
  const { profile, signOut } = useAuth()
  const { preference, setPreference } = useTheme()
  const { currentSite } = useSite()
  const navigate = useNavigate()
  const [sites, setSites] = useState<Site[]>([])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const role = (profile as AppUser | null)?.role
  const isSiteAdmin = role === 'admin' || role === 'site_admin'
  const isGlobalAdmin = role === 'admin'
  const isRegular = role === 'regular'

  useEffect(() => {
    const p = profile as AppUser | null
    if (!p || p.role === 'regular') return
    async function loadSites() {
      if (!p) return
      let q = supabase.from('sites').select('id, name, emoji').order('name')
      if ((p.role === 'manager' || p.role === 'site_admin') && (p.site_ids as string[])?.length) {
        q = q.in('id', p.site_ids as string[])
      }
      const { data } = await q
      setSites((data ?? []) as Site[])
    }
    loadSites()
  }, [profile?.id])

  const pathSegments = pathname.split('/').filter(Boolean)
  const lastSegment = pathSegments[pathSegments.length - 1] ?? ''
  const segmentTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    bookings: 'Bookings',
    slots: 'Extra slot requests',
    calendar: 'Calendar',
    insights: 'Insights',
    'site-settings': 'Site settings',
    users: 'Users & access',
    sites: 'Sites & venues',
    settings: 'Settings',
    portal: 'My portal',
  }
  // A site's dashboard is titled with the site, as a fleet's is in VehicleSafe;
  // every other page names itself and carries the site alongside.
  const onDashboard = lastSegment === 'dashboard' && !!currentSite
  const currentTitle = pageTitle
    ?? (onDashboard ? currentSite.name : segmentTitles[lastSegment])
    ?? (currentSite?.name ?? 'HallManager')

  // Your own settings are a corner of the header rather than a tab, as in the
  // sibling apps: they are not somewhere you move between while working.
  const nav = isRegular
    ? [{ to: '/portal', label: 'My portal', icon: House }]
    : [
        ...(currentSite ? [
          { to: `/${currentSite.id}/dashboard`, label: 'Dashboard', icon: Gauge },
          { to: `/${currentSite.id}/bookings`, label: 'Bookings', icon: ClipboardList },
          { to: `/${currentSite.id}/slots`, label: 'Extra slots', icon: CalendarPlus },
          { to: `/${currentSite.id}/calendar`, label: 'Calendar', icon: CalendarDays },
          ...(isSiteAdmin ? [
            { to: `/${currentSite.id}/insights`, label: 'Insights', icon: ChartColumn },
            { to: `/${currentSite.id}/site-settings`, label: 'Site settings', icon: Settings },
          ] : []),
        ] : []),
        ...(isGlobalAdmin ? [
          { to: '/users', label: 'Users & access', icon: Users },
          { to: '/sites', label: 'Sites & venues', icon: Building2 },
        ] : []),
      ]

  const isStaging = window.location.hostname.includes('staging') || window.location.hostname === 'localhost'

  return (
    <div className="app-gradient min-h-screen">
      {isStaging && (
        <div className="no-print flex items-center justify-center gap-2 bg-amber-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-100">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          Staging
        </div>
      )}

      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/70 backdrop-blur-md
                         dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4">
          <NavLink to="/" className="flex shrink-0 items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <img src="/favicon.svg" alt="" width={28} height={28} className="h-7 w-7" />
            <span className="hidden sm:inline">HallManager</span>
          </NavLink>

          {!isRegular && sites.length > 0 && (
            <select
              value={currentSite?.id ?? ''}
              onChange={(e) => navigate(`/${e.target.value}/dashboard`)}
              className="input min-w-0 max-w-[16rem] py-1.5"
              aria-label="Current site"
            >
              {!currentSite && <option value="" disabled>Choose a site</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji ? `${s.emoji} ${s.name}` : s.name}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <ThemeToggle preference={preference} onChange={setPreference} />
            <NavLink
              to="/settings"
              title="Your settings"
              aria-label="Your settings"
              className={({ isActive }) =>
                clsx('btn-plain px-2.5', isActive && 'text-brand-800 dark:text-brand-300')}
            >
              <User className="h-4 w-4" />
            </NavLink>
            <button className="btn-plain px-2.5" onClick={() => void handleSignOut()} title="Sign out"
                    aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {nav.length > 0 && (
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx('flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm',
                       isActive
                         ? 'bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/40 dark:text-brand-300'
                         : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{currentTitle}</h1>
          {currentSite && !onDashboard && currentTitle !== currentSite.name && (
            <span className="truncate text-sm text-slate-600 dark:text-slate-300">{currentSite.name}</span>
          )}
        </div>
        {children}
      </main>
    </div>
  )
}

/// Three-way, not a switch: "follow the system" is a distinct choice from
/// picking light or dark, and a two-state toggle silently loses it.
function ThemeToggle({ preference, onChange }: {
  preference: ThemePreference; onChange: (p: ThemePreference) => void
}) {
  const options: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'Match system' },
  ]
  return (
    <div className="hidden rounded-lg border border-slate-300 p-0.5 dark:border-slate-700 sm:flex"
         role="group" aria-label="Appearance">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          title={label}
          aria-label={label}
          aria-pressed={preference === value}
          className={clsx('rounded-md p-1.5',
            preference === value
              ? 'bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
