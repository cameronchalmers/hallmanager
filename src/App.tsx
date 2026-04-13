import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, fontFamily: "'Figtree', sans-serif" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent,#7c3aed)', color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>H</div>
        <p style={{ fontSize: 13, color: '#71717a' }}>Loading…</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/login" element={<Login />} />
      <Route path="/book" element={<BookingForm />} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/bookings" element={<Bookings />} />
                <Route path="/extra-slots" element={<ExtraSlots />} />
                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/quickfile" element={<QuickFile />} />
                <Route path="/users" element={<Users />} />
                <Route path="/portal" element={<Portal />} />
                <Route path="/sites" element={<Sites />} />
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
