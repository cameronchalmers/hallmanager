import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useForceLightMode } from '../hooks/useForceLightMode'

const ACCENT = '#7c3aed'

interface BookingSummary {
  name: string
  event: string
  date: string
  end_date: string | null
  start_time: string
  end_time: string
  site_name: string
  site_type: string
  total: number
  deposit: number
}

interface StageInfo {
  stage: 'full' | 'deposit' | 'balance'
  amount_due: number
  amount_paid: number
  total: number
  balance_due_date: string | null
}

function formatPence(p: number) {
  const v = p / 100
  return `£${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`
}

function CheckoutForm({ bookingId, amountDue }: { bookingId: string; amountDue: number }) {
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
        return_url: `${window.location.origin}/booking-paid?booking_id=${bookingId}`,
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
        {submitting ? 'Processing…' : `Pay ${formatPence(amountDue)}`}
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
  const [stageInfo, setStageInfo] = useState<StageInfo | null>(null)

  const init = useCallback(async () => {
    if (!bookingId) return
    setState('loading')

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
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
    setStageInfo({
      stage: data.stage ?? 'full',
      amount_due: data.amount_due ?? data.booking?.total ?? 0,
      amount_paid: data.amount_paid ?? 0,
      total: data.total ?? data.booking?.total ?? 0,
      balance_due_date: data.balance_due_date ?? null,
    })
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

  if (state === 'ready' && clientSecret && stripePromise && booking && stageInfo) {
    const isVehicle = booking.site_type === 'vehicle'
    const heading = stageInfo.stage === 'balance' ? 'Pay your remaining balance'
      : stageInfo.stage === 'deposit' ? 'Confirm your booking'
      : 'Complete your booking'
    const fmtDue = stageInfo.balance_due_date
      ? new Date(stageInfo.balance_due_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null
    const rows: [string, string][] = [
      ['Date', booking.end_date ? `${booking.date} – ${booking.end_date}` : booking.date],
      ...(isVehicle ? [] : [['Time', `${booking.start_time.slice(0, 5)} – ${booking.end_time.slice(0, 5)}`] as [string, string]]),
      ...(booking.deposit > 0 ? [['Deposit', formatPence(booking.deposit)] as [string, string]] : []),
      ['Total', formatPence(stageInfo.total)],
      ...(stageInfo.amount_paid > 0 ? [['Already paid', formatPence(stageInfo.amount_paid)] as [string, string]] : []),
      [stageInfo.stage === 'deposit' ? 'Due now (25% deposit)' : stageInfo.stage === 'balance' ? 'Balance due now' : 'Due now', formatPence(stageInfo.amount_due)],
    ]
    return (
      <div style={pageStyle}>
        {header}
        <div style={cardStyle}>
          <div style={{ height: 5, background: ACCENT }} />
          <div style={{ padding: '32px 32px 0' }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: ACCENT, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{heading}</p>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#111827' }}>{booking.event}</h1>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 14 }}>{booking.site_name}</p>
          </div>

          {/* Booking summary */}
          <div style={{ margin: '0 32px 16px', background: '#f9fafb', borderRadius: 10, overflow: 'hidden', border: '1px solid #f3f4f6' }}>
            {rows.map(([label, value], i) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: i % 2 === 0 ? '#f9fafb' : '#fff', fontSize: 14 }}>
                <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}</span>
                <span style={{ color: '#111827', fontWeight: i === rows.length - 1 ? 800 : 600 }}>{value}</span>
              </div>
            ))}
          </div>

          {stageInfo.stage === 'deposit' && fmtDue && (
            <div style={{ margin: '0 32px 20px', padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, fontSize: 13, color: '#5b21b6' }}>
              The remaining {formatPence(stageInfo.total - stageInfo.amount_due)} balance is due by <strong>{fmtDue}</strong> — we'll email you a payment link nearer the time.
            </div>
          )}

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
              <CheckoutForm bookingId={bookingId!} amountDue={stageInfo.amount_due} />
            </Elements>
          </div>
        </div>
      </div>
    )
  }

  return null
}
