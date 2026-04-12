import { useState } from 'react'
import { Palette, CreditCard, Bell, Check, ExternalLink } from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { useTheme } from '../context/ThemeContext'

const ACCENT_LABELS: Record<string, string> = {
  purple: 'Purple',
  blue: 'Blue',
  emerald: 'Emerald',
  rose: 'Rose',
  amber: 'Amber',
  slate: 'Slate',
}

interface Toggle {
  key: string
  label: string
  description: string
  value: boolean
}

export default function Settings() {
  const { accentKey, setAccentKey, accentColors } = useTheme()

  const [notifications, setNotifications] = useState<Toggle[]>([
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

  async function saveSettings() {
    // In production, persist to Supabase settings table
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Customise your HallManager experience</p>
      </div>

      {/* Theme */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <Palette size={17} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Accent Colour</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-600 mb-4">Choose a primary colour for your dashboard</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(accentColors).map(([key, hex]) => (
              <button
                key={key}
                onClick={() => setAccentKey(key)}
                className="flex flex-col items-center gap-2"
              >
                <div
                  className={`w-12 h-12 rounded-full transition-all ${accentKey === key ? 'ring-4 ring-offset-2 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: hex, outlineColor: hex }}
                />
                <span className={`text-xs font-medium ${accentKey === key ? 'text-gray-900' : 'text-gray-500'}`}>
                  {ACCENT_LABELS[key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Stripe */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <CreditCard size={17} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Stripe Connect</h2>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-700 font-medium">
                {stripeConnected ? 'Stripe account connected' : 'Connect your Stripe account'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {stripeConnected
                  ? 'You can accept online payments for bookings'
                  : 'Link Stripe to accept online payments and manage invoices'}
              </p>
            </div>
            {stripeConnected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                  <Check size={14} /> Connected
                </span>
                <Button variant="secondary" size="sm">
                  <ExternalLink size={12} />
                  Manage
                </Button>
              </div>
            ) : (
              <Button size="sm">
                Connect Stripe
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <Bell size={17} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Email Notifications</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {notifications.map(n => (
            <div key={n.key} className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{n.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{n.description}</p>
              </div>
              <button
                onClick={() => toggleNotification(n.key)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${n.value ? 'bg-current' : 'bg-gray-200'}`}
                style={n.value ? { color: 'var(--accent)' } : undefined}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${n.value ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <Button onClick={saveSettings}>
            {saved ? <><Check size={14} /> Saved!</> : 'Save Preferences'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
