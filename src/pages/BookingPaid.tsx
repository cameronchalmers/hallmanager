export default function BookingPaid() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8f9fc',
      fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: '24px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        maxWidth: 480,
        width: '100%',
        overflow: 'hidden',
      }}>
        <div style={{ height: 6, background: '#7c3aed' }} />
        <div style={{ padding: '40px 40px 36px', textAlign: 'center' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#f0fdf4',
            border: '2px solid #bbf7d0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: 26,
          }}>✓</div>
          <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
            Payment received — you're confirmed!
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 15, color: '#6b7280', lineHeight: 1.6 }}>
            Thank you for your payment. Your booking is now confirmed and you'll receive a confirmation email shortly.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
            If you have any questions, please get in touch with us directly.
          </p>
        </div>
      </div>
    </div>
  )
}
