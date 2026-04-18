import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import type { Booking, ExtraSlot, Site } from '../lib/database.types'
import { formatPence } from '../lib/money'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import CalendarWidget from '../components/CalendarWidget'
import { format } from 'date-fns'

type BookingWithSite = Booking & { sites?: Site; user_group_name?: string | null; effective_total?: number }

function nextOccurrence(b: Booking, nowIso: string): string {
  if (b.type !== 'recurring' || !b.recurrence) return b.date

  const toDs = (d: Date) => d.toISOString().split('T')[0]
  // A session is past if its end datetime has already passed
  const isPast = (dateStr: string) => `${dateStr}T${b.end_time}` <= nowIso

  const isMultiDay = b.recurrence === 'Weekly' && b.recurrence_days && (b.recurrence_days as number[]).length > 1

  if (isMultiDay) {
    const days = [...(b.recurrence_days as number[])].sort()
    const weekStart = new Date(nowIso)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    for (let w = 0; w < 53; w++) {
      for (const dayIdx of days) {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + dayIdx + w * 7)
        const ds = toDs(d)
        if (ds >= b.date && !isPast(ds)) return ds
      }
    }
    return b.date
  }

  const cur = new Date(b.date + 'T12:00:00')
  let i = 0
  while (isPast(toDs(cur)) && i < 500) {
    if (b.recurrence === 'Weekly') cur.setDate(cur.getDate() + 7)
    else if (b.recurrence === 'Fortnightly') cur.setDate(cur.getDate() + 14)
    else if (b.recurrence === 'Monthly') cur.setMonth(cur.getMonth() + 1)
    else break
    i++
  }
  return toDs(cur)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<BookingWithSite[]>([])
  const [slots, setSlots] = useState<ExtraSlot[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<BookingWithSite | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [bRes, sRes, sitesRes, usersRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('extra_slots').select('*').order('created_at', { ascending: false }),
      supabase.from('sites').select('*'),
      supabase.from('users').select('id, group_name, custom_rates'),
    ])
    const allSites = sitesRes.data ?? []
    const allUsers = usersRes.data ?? []
    const bookingsWithSites = (bRes.data ?? []).map(b => {
      const linkedUser = allUsers.find(u => u.id === b.user_id)
      const customRate = (linkedUser?.custom_rates as Record<string, number> | null)?.[b.site_id]
      return {
        ...b,
        sites: allSites.find(s => s.id === b.site_id),
        user_group_name: linkedUser?.group_name ?? null,
        effective_total: b.type === 'recurring' && customRate ? Math.round(b.hours * customRate) : (b.total ?? 0),
      }
    }) as BookingWithSite[]
    setBookings(bookingsWithSites)
    setSlots(sRes.data ?? [])
    setSites(allSites)
    setLoading(false)
  }

  async function approveBooking(id: string) {
    // Create Stripe payment link first
    try {
      const { data, error } = await supabase.functions.invoke('stripe-action', {
        body: { action: 'create_payment', booking_id: id },
      })
      if (error) console.error('Stripe payment creation failed:', error)
      else if (data?.url) {
        setBookings(prev => prev.map(b => b.id === id ? { ...b, stripe_payment_url: data.url } : b))
      }
    } catch (e) { console.error('Stripe action error:', e) }

    await supabase.from('bookings').update({ status: 'approved' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'approved' } : b))
    sendEmail('booking_approved', id)
  }

  async function denyBooking(id: string) {
    await supabase.from('bookings').update({ status: 'denied' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'denied' } : b))
    sendEmail('booking_denied', id)
  }

  async function approveSlot(id: string) {
    await supabase.from('extra_slots').update({ status: 'approved' }).eq('id', id)
    setSlots(prev => prev.map(s => s.id === id ? { ...s, status: 'approved' } : s))
    sendEmail('slot_approved', id)
  }

  async function denySlot(id: string) {
    await supabase.from('extra_slots').update({ status: 'denied' }).eq('id', id)
    setSlots(prev => prev.map(s => s.id === id ? { ...s, status: 'denied' } : s))
    sendEmail('slot_denied', id)
  }

  const pending = bookings.filter(b => b.status === 'pending')
  const pendingSlots = slots.filter(s => s.status === 'pending')
  const confirmed = bookings.filter(b => b.status === 'confirmed' || b.status === 'approved')
  const revenue = confirmed.filter(b => b.type === 'oneoff').reduce((s, b) => s + (b.total ?? 0), 0)

  if (loading) return <div className="empty"><div className="empty-icon">⏳</div><div className="empty-title">Loading…</div></div>

  return (
    <div>
      {/* Stat cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Pending Bookings</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{pending.length}</div>
          <div className="stat-sub">Awaiting decision</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Extra Slot Requests</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{pendingSlots.length}</div>
          <div className="stat-sub">From regular bookers</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Revenue</div>
          <div className="stat-value">{formatPence(revenue)}</div>
          <div className="stat-sub">One-off bookings</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Sites</div>
          <div className="stat-value">{sites.length}</div>
          <div className="stat-sub">Under management</div>
        </div>
      </div>

      {/* Extra slot requests */}
      {pendingSlots.length > 0 && (
        <>
          <div className="sec-label">📅 Extra Slot Requests ({pendingSlots.length})</div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="tbl-header cols-slots">
              <span>Booker</span><span>Venue</span><span>Date & Time</span><span>Hours</span><span>Status</span><span>Actions</span>
            </div>
            {pendingSlots.map(sl => {
              const site = sites.find(s => s.id === sl.site_id)
              return (
                <div key={sl.id} className="tbl-row cols-slots">
                  <div>
                    <div style={{ fontWeight: 600 }}>{sl.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sl.reason.slice(0, 40)}{sl.reason.length > 40 ? '…' : ''}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{site?.name}</div>
                  <div>
                    <div>{format(new Date(sl.date), 'dd MMM yyyy')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sl.start_time}–{sl.end_time}</div>
                  </div>
                  <div style={{ fontWeight: 600 }}>{sl.hours}h</div>
                  <div><Badge status={sl.status} /></div>
                  <div className="approve-deny" onClick={e => e.stopPropagation()}>
                    <button className="icon-btn icon-btn-approve" onClick={() => approveSlot(sl.id)}>✓</button>
                    <button className="icon-btn icon-btn-deny" onClick={() => denySlot(sl.id)}>✗</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Pending bookings */}
      {pending.length > 0 && (
        <>
          <div className="sec-label">⏳ Booking Requests ({pending.length})</div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="tbl-header cols-bookings">
              <span>Booking</span><span>Date & Time</span><span>Venue</span><span>Type</span><span>Status</span><span>Actions</span>
            </div>
            {pending.map(b => {
              const site = (b as BookingWithSite).sites
              return (
                <div key={b.id} className="tbl-row cols-bookings" style={{ cursor: 'pointer' }} onClick={() => setPreview(b as BookingWithSite)}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.event}</div>
                  </div>
                  <div>
                    <div>{format(new Date(b.date), 'dd MMM yyyy')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.start_time}–{b.end_time}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{site?.name}</div>
                  <div>
                    <span className={`badge ${b.type === 'recurring' ? 'badge-recurring' : 'badge-oneoff'}`}>
                      {b.type === 'recurring' ? `↻ ${b.recurrence ?? 'recurring'}` : 'One-off'}
                    </span>
                  </div>
                  <div><Badge status={b.status} /></div>
                  <div className="approve-deny" onClick={e => e.stopPropagation()}>
                    <button className="icon-btn icon-btn-approve" onClick={() => approveBooking(b.id)}>✓</button>
                    <button className="icon-btn icon-btn-deny" onClick={() => denyBooking(b.id)}>✗</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Calendar + Upcoming side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="sec-label">Calendar</div>
          <CalendarWidget compact showSiteFilter={false} />
        </div>
        <div>
          <div className="sec-label">Upcoming confirmed</div>
          {confirmed.length === 0 && (
            <div className="card">
              <div className="empty">
                <div className="empty-icon">✅</div>
                <div className="empty-title">No confirmed bookings yet</div>
              </div>
            </div>
          )}
          {(['recurring', 'one-off'] as const).map(type => {
            const nowIso = new Date().toISOString().slice(0, 16)
            const todayStr = nowIso.split('T')[0]
            let group = confirmed.filter(b => type === 'recurring' ? b.type === 'recurring' : b.type !== 'recurring')
            if (type === 'recurring') {
              group = group
                .map(b => ({ ...b, _next: nextOccurrence(b, nowIso) }))
                .sort((a, b) => (a as typeof a & { _next: string })._next.localeCompare((b as typeof b & { _next: string })._next)) as typeof group
            } else {
              group = group.filter(b => b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))
            }
            if (group.length === 0) return null
            return (
              <div key={type} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  {type === 'recurring' ? '↻ Recurring' : 'One-off'}
                </div>
                <div className="card">
                  {group.slice(0, 6).map(b => {
                    const site = (b as BookingWithSite).sites
                    const label = b.type === 'recurring' ? (b.user_group_name ?? b.event) : b.name
                    const sub = b.type === 'recurring' ? `${b.name} · ${site?.name}` : `${b.event} · ${site?.name}`
                    const displayDate = b.type === 'recurring' ? nextOccurrence(b, nowIso) : b.date
                    return (
                      <div key={b.id} className="tbl-row" style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }} onClick={() => setPreview(b as BookingWithSite)}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{format(new Date(displayDate + 'T12:00:00'), 'dd MMM')}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.start_time}–{b.end_time}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick-view modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.event ?? ''}
        sub={preview ? `${format(new Date(preview.date), 'dd MMM yyyy')} · ${preview.start_time}–${preview.end_time}` : ''}
        footer={
          <div style={{ display: 'flex', gap: 7, width: '100%' }}>
            {preview?.status === 'pending' && (
              <>
                <button className="btn btn-danger btn-sm" onClick={() => { denyBooking(preview.id); setPreview(null) }}>✗ Deny</button>
                <button className="btn btn-primary btn-sm" onClick={() => { approveBooking(preview.id); setPreview(null) }}>✓ Approve</button>
              </>
            )}
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => { setPreview(null); navigate('/bookings') }}
            >
              Open in Bookings →
            </button>
          </div>
        }
      >
        {preview && (
          <>
            <div className="notice notice-accent" style={{ marginBottom: 12 }}>
              <span>{preview.sites?.emoji}</span>
              <div>
                <strong>{preview.sites?.name ?? 'Unknown venue'}</strong>
                <div style={{ fontSize: 11, marginTop: 1 }}>{preview.sites?.address}</div>
              </div>
            </div>
            <div className="detail-grid">
              <div><div className="detail-label">Contact</div><div className="detail-value">{preview.name}</div></div>
              <div><div className="detail-label">Status</div><div className="detail-value"><Badge status={preview.status} /></div></div>
              <div><div className="detail-label">Email</div><div className="detail-value" style={{ fontSize: 12 }}>{preview.email}</div></div>
              <div><div className="detail-label">Phone</div><div className="detail-value" style={{ fontSize: 12 }}>{preview.phone}</div></div>
              <div><div className="detail-label">Hours</div><div className="detail-value">{preview.hours}h</div></div>
              <div><div className="detail-label">Type</div><div className="detail-value"><span className={`badge ${preview.type === 'recurring' ? 'badge-recurring' : 'badge-oneoff'}`}>{preview.type === 'recurring' ? `↻ ${preview.recurrence}` : 'One-off'}</span></div></div>
            </div>
            {preview.notes && (
              <div style={{ background: 'var(--surface2)', borderRadius: 7, padding: '9px 12px', fontSize: 12, color: 'var(--text)', marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Notes</div>
                {preview.notes}
              </div>
            )}
            <div className="price-bar">
              <div><div className="pi-label">Rate</div><div className="pi-value">{formatPence(preview.sites?.rate ?? 0)}/hr</div></div>
              <div><div className="pi-label">Hours</div><div className="pi-value">{preview.hours}</div></div>
              <div><div className="pi-label">Deposit</div><div className="pi-value">{formatPence(preview.deposit)}</div></div>
              <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>{formatPence(preview.total)}</div></div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
