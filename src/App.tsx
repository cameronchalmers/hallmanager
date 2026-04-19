import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext'
import { SiteProvider, useSite } from './context/SiteContext'
import { supabase } from './lib/supabase'
import type { AppUser } from './lib/database.types'
import Layout from './components/Layout'
import Login from './pages/Login'
import BookingForm from './pages/BookingForm'
import Dashboard from './pages/Dashboard'
import Bookings from './pages/Bookings'
import ExtraSlots from './pages/ExtraSlots'
import CalendarView from './pages/CalendarView'
import QuickFile from './pages/QuickFile'
import Users from './pages/Users'
import Portal from './pages/Portal'
import Sites from './pages/Sites'
import Settings from './pages/Settings'
import Insights from './pages/Insights'
import SiteSettings from './pages/SiteSettings'
import PublicCalendar from './pages/PublicCalendar'
import BookingPaid from './pages/BookingPaid'

const Spinner = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, fontFamily: "'Figtree', sans-serif" }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent,#7c3aed)', color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>H</div>
    <p style={{ fontSize: 13, color: '#71717a' }}>Loading…</p>
  </div>
)

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && (profile as AppUser | null)?.role === 'regular') return <Navigate to="/portal" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { profile, loading } = useAuth()
  const [firstSiteId, setFirstSiteId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const p = profile as AppUser | null
    if (!p || p.role === 'regular') return
    async function load() {
      if (!p) return
      let q = supabase.from('sites').select('id').order('name').limit(1)
      if (p.role === 'manager' && (p.site_ids as string[])?.length) {
        q = q.in('id', p.site_ids as string[])
      }
      const { data } = await q
      setFirstSiteId(data?.[0]?.id ?? null)
    }
    load()
  }, [profile?.id])

  if (loading || firstSiteId === undefined) return <Spinner />
  if ((profile as AppUser | null)?.role === 'regular') return <Navigate to="/portal" replace />
  if (firstSiteId) return <Navigate to={`/${firstSiteId}/dashboard`} replace />
  return <Navigate to="/sites" replace />
}

function SiteLoader() {
  const { siteId } = useParams<{ siteId: string }>()
  const { setCurrentSite } = useSite()
  const [ready, setReady] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (!siteId || !user) return
    setReady(false)
    supabase.from('sites').select('*').eq('id', siteId).single()
      .then(({ data }) => { setCurrentSite(data ?? null); setReady(true) })
    return () => { setCurrentSite(null) }
  }, [siteId, user?.id])

  if (!ready) return <Spinner />

  return (
    <Routes>
      <Route path="dashboard" element={<ProtectedRoute adminOnly><Dashboard /></ProtectedRoute>} />
      <Route path="bookings" element={<ProtectedRoute adminOnly><Bookings /></ProtectedRoute>} />
      <Route path="slots" element={<ProtectedRoute adminOnly><ExtraSlots /></ProtectedRoute>} />
      <Route path="calendar" element={<ProtectedRoute adminOnly><CalendarView /></ProtectedRoute>} />
      <Route path="insights" element={<ProtectedRoute adminOnly><Insights /></ProtectedRoute>} />
      <Route path="invoices" element={<ProtectedRoute adminOnly><QuickFile /></ProtectedRoute>} />
      <Route path="site-settings" element={<ProtectedRoute adminOnly><SiteSettings /></ProtectedRoute>} />
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <SiteProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/book" element={<BookingForm />} />
        <Route path="/book/:slug" element={<BookingForm />} />
        <Route path="/availability" element={<PublicCalendar />} />
        <Route path="/availability/:slug" element={<PublicCalendar />} />
        <Route path="/booking-paid" element={<BookingPaid />} />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<RootRedirect />} />
                  <Route path="/portal" element={<Portal />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
                  <Route path="/sites" element={<ProtectedRoute adminOnly><Sites /></ProtectedRoute>} />
                  <Route path="/:siteId/*" element={<ProtectedRoute adminOnly><SiteLoader /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </SiteProvider>
  )
}
