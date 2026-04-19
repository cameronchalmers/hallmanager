import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useForceLightMode } from '../hooks/useForceLightMode'

export default function PayBooking() {
  useForceLightMode()
  const { bookingId } = useParams<{ bookingId: string }>()

  useEffect(() => {
    if (!bookingId) return
    const SUPABASE_URL = (supabase as unknown as { supabaseUrl: string }).supabaseUrl
    window.location.href = `${SUPABASE_URL}/functions/v1/get-payment-url?booking_id=${bookingId}`
  }, [bookingId])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8f9fc',
      fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #e5e7eb',
          borderTopColor: '#7c3aed', borderRadius: '50%',
          margin: '0 auto 16px',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ margin: 0, fontSize: 15 }}>Preparing your payment…</p>
      </div>
    </div>
  )
}
