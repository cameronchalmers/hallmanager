import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'

const ACCENT_LABELS: Record<string, string> = {
  purple: 'Purple',
  blue: 'Blue',
  emerald: 'Emerald',
  rose: 'Rose',
  amber: 'Amber',
  slate: 'Slate',
}

interface NotifToggle {
  key: string
  label: string
  description: string
  value: boolean
}

export default function Settings() {
  const { accentKey, setAccentKey, accentColors } = useTheme()

  const [notifications, setNotifications] = useState<NotifToggle[]>([
    { key: 'new_booking', label: 'New booking requests', description: 'Email me when a new booking is submitted', value: true },
    { key: 'slot_request', label: 'Extra slot requests', description: 'Email me when a booker requests an extra slot', value: true },
    { key: 'booking_confirmed', label: 'Booking confirmed', description: 'Send confirmation email to booker', value: true },
    { key: 'invoice_paid', label: 'Invoice paid', description: 'Notify me when an invoice is marked paid', value: false },
    { key: 'weekly_digest', label: 'Weekly digest', description: 'Weekly summary of bookings and revenue', value: false },
  ])

  const [stripeConnected] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggleNotification(key: string) {
    setNotifications(prev => prev.map(n => n.key === key ? { ...n, value: !n.value } : n))
  }

  function saveSettings() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Accent colour */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Accent Colour</span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Choose a primary colour for your dashboard
          </div>
          <div className="theme-swatches">
            {Object.entries(accentColors).map(([key, hex]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <button
                  className={`swatch${accentKey === key ? ' active' : ''}`}
                  style={{ background: hex }}
                  onClick={() => setAccentKey(key)}
                />
                <span style={{ fontSize: 10, color: accentKey === key ? 'var(--text)' : 'var(--text-muted)', fontWeight: accentKey === key ? 700 : 400 }}>
                  {ACCENT_LABELS[key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stripe */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Stripe Connect</span>
          {stripeConnected
            ? <span className="badge badge-approved">✓ Connected</span>
            : <span className="badge badge-pending">Not connected</span>}
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {stripeConnected ? 'Stripe account connected' : 'Connect your Stripe account'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {stripeConnected
                ? 'You can accept online payments for bookings'
                : 'Link Stripe to accept online payments and manage invoices'}
            </div>
          </div>
          {stripeConnected
            ? <button className="btn btn-ghost btn-sm">Manage →</button>
            : <button className="btn btn-primary btn-sm">Connect Stripe</button>}
        </div>
      </div>

      {/* Notifications */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Email Notifications</span>
        </div>
        {notifications.map((n, i) => (
          <div
            key={n.key}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '13px 18px',
              borderBottom: i < notifications.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{n.description}</div>
            </div>
            <button
              className="toggle"
              style={{ background: n.value ? 'var(--accent)' : '#d1d5db' }}
              onClick={() => toggleNotification(n.key)}
            >
              <span
                className="toggle-thumb"
                style={{ left: n.value ? 18 : 3 }}
              />
            </button>
          </div>
        ))}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary btn-sm" onClick={saveSettings}>
            {saved ? '✓ Saved!' : 'Save Preferences'}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">About HallManager</span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div className="notice notice-accent">
            <span>🏛️</span>
            <div>
              <strong>HallManager v1.0</strong>
              <div style={{ fontSize: 11, marginTop: 2 }}>Venue booking management for community halls and event spaces</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
