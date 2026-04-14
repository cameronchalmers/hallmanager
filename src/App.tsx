import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
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
import PublicCalendar from './pages/PublicCalendar'

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
  // Regular bookers can't access admin routes
  if (adminOnly && (profile as AppUser | null)?.role === 'regular') return <Navigate to="/portal" replace />
  return <>{children}</>
}

// Sends regular bookers to /portal, everyone else to the dashboard
function RoleHome() {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if ((profile as AppUser | null)?.role === 'regular') return <Navigate to="/portal" replace />
  return <Dashboard />
}

export default function App() {
  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/login" element={<Login />} />
      <Route path="/book" element={<BookingForm />} />
      <Route path="/book/:slug" element={<BookingForm />} />
      <Route path="/availability" element={<PublicCalendar />} />
      <Route path="/availability/:slug" element={<PublicCalendar />} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                {/* Root: redirect regular users to their portal */}
                <Route path="/" element={<RoleHome />} />
                {/* Admin/manager only routes */}
                <Route path="/bookings" element={<ProtectedRoute adminOnly><Bookings /></ProtectedRoute>} />
                <Route path="/extra-slots" element={<ProtectedRoute adminOnly><ExtraSlots /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute adminOnly><CalendarView /></ProtectedRoute>} />
                <Route path="/insights" element={<ProtectedRoute adminOnly><Insights /></ProtectedRoute>} />
                <Route path="/quickfile" element={<ProtectedRoute adminOnly><QuickFile /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
                <Route path="/sites" element={<ProtectedRoute adminOnly><Sites /></ProtectedRoute>} />
                {/* Accessible to all authenticated users */}
                <Route path="/portal" element={<Portal />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
