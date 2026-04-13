import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

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
  const { accentKey, setAccentKey, accentColors, darkMode, setDarkMode } = useTheme()
  const { profile } = useAuth()
  const isRegular = profile?.role === 'regular'

  const [notifications, setNotifications] = useState<NotifToggle[]>([
    { key: 'new_booking', label: 'New booking requests', description: 'Email me when a new booking is submitted', value: true },
    { key: 'slot_request', label: 'Extra slot requests', description: 'Email me when a booker requests an extra slot', value: true },
    { key: 'booking_confirmed', label: 'Booking confirmed', description: 'Send confirmation email to booker', value: true },
    { key: 'invoice_paid', label: 'Invoice paid', description: 'Notify me when an invoice is marked paid', value: false },
    { key: 'weekly_digest', label: 'Weekly digest', description: 'Weekly summary of bookings and revenue', value: false },
  ])

  const [stripeConnected] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testSending, setTestSending] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'error'>>({})

  async function sendTestEmail(template: string) {
    setTestSending(template)
    const { error } = await supabase.functions.invoke('send-email', {
      body: { type: 'test', template },
    })
    setTestResult(prev => ({ ...prev, [template]: error ? 'error' : 'ok' }))
    setTestSending(null)
    setTimeout(() => setTestResult(prev => { const n = { ...prev }; delete n[template]; return n }), 3000)
  }

  function toggleNotification(key: string) {
    setNotifications(prev => prev.map(n => n.key === key ? { ...n, value: !n.value } : n))
  }

  function saveSettings() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="two-col-grid" style={{ maxWidth: 1100 }}>

      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Appearance */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Appearance</span>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Dark mode</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Switch between light and dark interface</div>
            </div>
            <button
              className="toggle"
              style={{ background: darkMode ? 'var(--accent)' : '#d1d5db' }}
              onClick={() => setDarkMode(!darkMode)}
            >
              <span className="toggle-thumb" style={{ left: darkMode ? 18 : 3 }} />
            </button>
          </div>
        </div>

        {/* Accent colour */}
        <div className="card">
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

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stripe — admin/manager only */}
        {!isRegular && <div className="card">
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
        </div>}

        {/* Notifications */}
        <div className="card">
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

        {/* Test emails — admin only */}
        {!isRegular && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Email Previews</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sends to your admin address</span>
            </div>
            {[
              { key: 'booking_submitted',       label: 'Booking received (to booker)',   desc: 'Sent when a new booking is submitted' },
              { key: 'booking_submitted_admin', label: 'New booking (to admin)',          desc: 'Admin notification for new requests' },
              { key: 'booking_approved',        label: 'Booking approved',               desc: 'Approval + payment request to booker' },
              { key: 'booking_denied',          label: 'Booking denied',                 desc: 'Denial notice to booker' },
              { key: 'booking_cancelled',       label: 'Booking cancelled',              desc: 'Cancellation notice to booker' },
              { key: 'slot_approved',           label: 'Extra slot approved',            desc: 'Extra slot approval to booker' },
              { key: 'slot_denied',             label: 'Extra slot denied',              desc: 'Extra slot denial to booker' },
            ].map((t, i, arr) => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t.desc}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flexShrink: 0, color: testResult[t.key] === 'ok' ? 'var(--green)' : testResult[t.key] === 'error' ? '#ef4444' : undefined }}
                  disabled={testSending === t.key}
                  onClick={() => sendTestEmail(t.key)}
                >
                  {testSending === t.key ? 'Sending…' : testResult[t.key] === 'ok' ? '✓ Sent!' : testResult[t.key] === 'error' ? '✗ Failed' : 'Send test'}
                </button>
              </div>
            ))}
          </div>
        )}

      </div>

    </div>
  )
}
