import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useSite } from '../context/SiteContext'
import { supabase } from '../lib/supabase'
import type { Site } from '../lib/database.types'


function HouseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function NavIcon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path.split('M').filter(Boolean).map((d, i) => <path key={i} d={'M' + d} />)}
    </svg>
  )
}

const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  cal: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm5-2v3m8-3v3M3 10h18',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  bld: 'M4 22V4a1 1 0 011-1h14a1 1 0 011 1v18M9 22v-6h6v6M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  rep: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  inv: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H9H8',
  extra: 'M8 7v8M12 7v4M16 7v6M3 3h18v4H3zM3 21l3-6h12l3 6H3z',
  chart: 'M18 20V10M12 20V4M6 20v-6',
}

export default function Layout({ children, pageTitle, actions }: {
  children: React.ReactNode
  pageTitle?: string
  actions?: React.ReactNode
}) {
  const { pathname } = useLocation()
  const { profile, signOut } = useAuth()
  const { accent } = useTheme()
  const { currentSite } = useSite()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sites, setSites] = useState<Site[]>([])
  const pickerRef = useRef<HTMLDivElement>(null)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  useEffect(() => {
    const p = profile as import('../lib/database.types').AppUser | null
    if (!p || p.role === 'regular') return
    async function loadSites() {
      if (!p) return
      let q = supabase.from('sites').select('id, name, emoji').order('name')
      if (p.role === 'manager' && (p.site_ids as string[])?.length) {
        q = q.in('id', p.site_ids as string[])
      }
      const { data } = await q
      setSites((data ?? []) as Site[])
    }
    loadSites()
  }, [profile?.id])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pickerOpen])

  const isRegular = profile?.role === 'regular'

  // Derive page title from pathname
  const pathSegments = pathname.split('/').filter(Boolean)
  const lastSegment = pathSegments[pathSegments.length - 1] ?? ''
  const segmentTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    bookings: 'Bookings',
    slots: 'Extra Slot Requests',
    calendar: 'Calendar',
    insights: 'Insights',
    invoices: 'QuickFile Invoices',
    'site-settings': 'Site Settings',
    users: 'Users & Access',
    sites: 'Sites & Venues',
    settings: 'Settings',
    portal: 'My Portal',
  }
  const currentTitle = pageTitle ?? segmentTitles[lastSegment] ?? (currentSite?.name ?? 'HallManager')

  const siteNavItems = currentSite ? [
    [
      { to: `/${currentSite.id}/dashboard`, icon: 'grid', label: 'Dashboard' },
      { to: `/${currentSite.id}/bookings`, icon: 'list', label: 'Bookings' },
      { to: `/${currentSite.id}/slots`, icon: 'extra', label: 'Extra Slot Requests' },
      { to: `/${currentSite.id}/calendar`, icon: 'cal', label: 'Calendar' },
      { to: `/${currentSite.id}/insights`, icon: 'chart', label: 'Insights' },
    ],
    [
      { to: `/${currentSite.id}/invoices`, icon: 'inv', label: 'Invoices' },
    ],
    [
      { to: `/${currentSite.id}/site-settings`, icon: 'cog', label: 'Site Settings' },
    ],
  ] : []

  const globalNavItems = [
    [
      { to: '/users', icon: 'users', label: 'Users & Access' },
      { to: '/sites', icon: 'bld', label: 'Sites & Venues' },
    ],
    [
      { to: '/settings', icon: 'cog', label: 'Settings' },
    ],
  ]

  const regularNavSections = [
    [{ to: '/portal', icon: 'rep', label: 'My Portal' }],
    [{ to: '/settings', icon: 'cog', label: 'Settings' }],
  ]

  const navSections = isRegular ? regularNavSections : [
    ...siteNavItems,
    ...(siteNavItems.length > 0 ? [
      // divider section for global items
      [
        { to: '/users', icon: 'users', label: 'Users & Access' },
        { to: '/sites', icon: 'bld', label: 'Sites & Venues' },
        { to: '/settings', icon: 'cog', label: 'Settings' },
      ],
    ] : globalNavItems),
  ]

  const isActive = (to: string) => pathname === to || (to !== '/' && pathname.startsWith(to + '/'))

  const SidebarContent = () => (
    <aside style={{ width: 224, background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', display: 'flex', alignItems: 'center', gap: 9, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, background: accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white' }}>
          <HouseIcon />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>HallManager</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.3px' }}>Venue Booking</div>
        </div>
      </div>

      {/* Site picker */}
      {!isRegular && (
        <div ref={pickerRef} style={{ margin: '10px 10px 6px', position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setPickerOpen(o => !o)}
            style={{ width: '100%', padding: '8px 11px', background: 'var(--bg)', border: `1px solid ${pickerOpen ? accent : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
          >
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 1 }}>
                {currentSite ? 'Current site' : 'All sites'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {currentSite ? `${currentSite.emoji} ${currentSite.name}` : 'Overview'}
              </div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 10, transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
          </button>

          {pickerOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden' }}>
              {currentSite && (
                <button
                  onClick={() => { navigate('/'); setPickerOpen(false) }}
                  style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
                >
                  ← All sites overview
                </button>
              )}
              {sites.map(s => (
                <button
                  key={s.id}
                  onClick={() => { navigate(`/${s.id}/dashboard`); setPickerOpen(false) }}
                  style={{ width: '100%', padding: '9px 12px', background: s.id === currentSite?.id ? 'var(--accent-light)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: s.id === currentSite?.id ? 600 : 500, color: s.id === currentSite?.id ? 'var(--accent-text)' : 'var(--text)' }}
                >
                  <span>{s.emoji}</span>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  {s.id === currentSite?.id && <span style={{ fontSize: 10, color: accent }}>✓</span>}
                </button>
              ))}
              {sites.length === 0 && (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No sites yet</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {navSections.map((section, si) => (
          <div key={si}>
            {si > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '6px 8px' }} />}
            {section.map(({ to, icon, label }) => {
              const active = isActive(to)
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 500,
                    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
                    background: active ? 'var(--accent-light)' : 'transparent',
                    textDecoration: 'none', transition: 'all 0.12s',
                  }}
                >
                  <span style={{ opacity: active ? 1 : 0.6, color: active ? accent : undefined, flexShrink: 0 }}>
                    <NavIcon path={ICONS[icon as keyof typeof ICONS]} />
                  </span>
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }}>
          <div style={{ width: 27, height: 27, borderRadius: '50%', background: (profile?.color ?? accent) + '22', color: profile?.color ?? accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
            {profile?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{profile?.name ?? 'User'}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{profile?.role ?? 'admin'}</div>
          </div>
          <button onClick={handleSignOut} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}>
            ↩
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:block flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }} className="md:hidden">
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => setMobileOpen(false)} />
          <div style={{ position: 'relative' }}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="md:hidden" onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text)' }}>☰</button>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>{currentTitle}</span>
          </div>
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {actions}
            </div>
          )}
        </div>

        {/* Page content */}
        <main style={{ flex: 1, padding: 22, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
