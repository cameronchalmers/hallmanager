import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'
import { useForceLightMode } from '../hooks/useForceLightMode'

const ACCENT = '#7c3aed'

interface BookingSummary {
  name: string
  event: string
  date: string
  start_time: string
  end_time: string
  site_name: string
  total: number
  deposit: number
}

function formatPence(p: number) {
  const v = p / 100
  return `£${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`
}

function CheckoutForm({ booking }: { booking: BookingSummary }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/booking-paid`,
      },
    })

    // Only reached if confirmPayment fails (success causes a redirect)
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 24 }}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <div style={{
          padding: '12px 14px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
          color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        style={{
          width: '100%',
          padding: '14px 24px',
          background: submitting ? '#9ca3af' : ACCENT,
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 16,
          cursor: submitting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
      >
        {submitting ? 'Processing…' : `Pay ${formatPence(booking.total)}`}
      </button>

      <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
        🔒 Secure payment powered by Stripe
      </p>
    </form>
  )
}

export default function PayBooking() {
  useForceLightMode()
  const { bookingId } = useParams<{ bookingId: string }>()
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'paid'>('loading')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [clientSecret, setClientSecret] = useState<string>('')
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [booking, setBooking] = useState<BookingSummary | null>(null)

  const init = useCallback(async () => {
    if (!bookingId) return
    setState('loading')

    const SUPABASE_URL = (supabase as unknown as { supabaseUrl: string }).supabaseUrl
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    })
    const data = await res.json()

    if (!res.ok) {
      if (data.error === 'already_paid') {
        setState('paid')
      } else if (data.error === 'stripe_not_configured') {
        setErrorMsg('Online payment is not available for this venue. Please contact them directly to arrange payment.')
        setState('error')
      } else {
        setErrorMsg(data.error ?? 'Something went wrong. Please try again or contact the venue.')
        setState('error')
      }
      return
    }

    setClientSecret(data.client_secret)
    setStripePromise(loadStripe(data.publishable_key))
    setBooking(data.booking)
    setState('ready')
  }, [bookingId])

  useEffect(() => { init() }, [init])

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f8f9fc',
    fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '32px 16px',
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    maxWidth: 520,
    width: '100%',
    margin: '0 auto',
    overflow: 'hidden',
  }

  const header = (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, background: ACCENT, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 18, lineHeight: 1 }}>H</span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>HallManager</span>
      </div>
    </div>
  )

  if (state === 'loading') {
    return (
      <div style={{ ...pageStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {header}
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: ACCENT, borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ margin: 0, fontSize: 15 }}>Loading payment details…</p>
        </div>
      </div>
    )
  }

  if (state === 'paid') {
    return (
      <div style={pageStyle}>
        {header}
        <div style={cardStyle}>
          <div style={{ height: 5, background: '#22c55e' }} />
          <div style={{ padding: '36px 36px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 26 }}>✓</div>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#111827' }}>Already paid</h1>
            <p style={{ margin: 0, fontSize: 15, color: '#6b7280' }}>This booking has already been paid and confirmed.</p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={pageStyle}>
        {header}
        <div style={cardStyle}>
          <div style={{ height: 5, background: '#ef4444' }} />
          <div style={{ padding: '36px 36px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', border: '2px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 26 }}>✕</div>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#111827' }}>Unable to load payment</h1>
            <p style={{ margin: 0, fontSize: 15, color: '#6b7280', lineHeight: 1.6 }}>{errorMsg}</p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'ready' && clientSecret && stripePromise && booking) {
    return (
      <div style={pageStyle}>
        {header}
        <div style={cardStyle}>
          <div style={{ height: 5, background: ACCENT }} />
          <div style={{ padding: '32px 32px 0' }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: ACCENT, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Complete your booking</p>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#111827' }}>{booking.event}</h1>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 14 }}>{booking.site_name}</p>
          </div>

          {/* Booking summary */}
          <div style={{ margin: '0 32px 24px', background: '#f9fafb', borderRadius: 10, overflow: 'hidden', border: '1px solid #f3f4f6' }}>
            {[
              ['Date', booking.date],
              ['Time', `${booking.start_time} – ${booking.end_time}`],
              ['Deposit', formatPence(booking.deposit)],
              ['Total', formatPence(booking.total)],
            ].map(([label, value], i) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: i % 2 === 0 ? '#f9fafb' : '#fff', fontSize: 14 }}>
                <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}</span>
                <span style={{ color: '#111827', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '0 32px 32px' }}>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: ACCENT,
                    fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    borderRadius: '8px',
                    colorBackground: '#ffffff',
                  },
                },
              }}
            >
              <CheckoutForm booking={booking} />
            </Elements>
          </div>
        </div>
      </div>
    )
  }

  return null
}
