import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Booking, ExtraSlot, Invoice, Site } from '../lib/database.types'
import { useAuth } from '../context/AuthContext'
import { formatPence } from '../lib/money'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

type Tab = 'bookings' | 'slots' | 'invoices' | 'pricing'
type Session = { booking: Booking; date: string }

function expandBooking(b: Booking, maxDate: string): Session[] {
  if (b.type !== 'recurring' || !b.recurrence || ['cancelled', 'denied'].includes(b.status)) {
    return [{ booking: b, date: b.date }]
  }
  const cancelled = new Set(b.cancelled_sessions ?? [])
  const sessions: Session[] = []
  const cur = new Date(b.date + 'T12:00:00')
  const max = new Date(maxDate + 'T12:00:00')
  while (cur <= max) {
    const dateStr = cur.toISOString().split('T')[0]
    if (!cancelled.has(dateStr)) sessions.push({ booking: b, date: dateStr })
    if (b.recurrence === 'Weekly') cur.setDate(cur.getDate() + 7)
    else if (b.recurrence === 'Fortnightly') cur.setDate(cur.getDate() + 14)
    else if (b.recurrence === 'Monthly') cur.setMonth(cur.getMonth() + 1)
    else break
  }
  return sessions
}

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, '0')
  const m = ((i % 4) * 15).toString().padStart(2, '0')
  return `${h}:${m}`
})

function calcHours(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

export default function Portal() {
  const { user, profile } = useAuth()
  const [tab, setTab] = useState<Tab>('bookings')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [slots, setSlots] = useState<ExtraSlot[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showRequest, setShowRequest] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slotForm, setSlotForm] = useState({
    site_id: '',
    date: '',
    start_time: '',
    end_time: '',
    reason: '',
  })

  useEffect(() => { if (user) fetchData() }, [user])

  async function fetchData() {
    setLoading(true)
    const [bRes, sRes, iRes, sitesRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
      supabase.from('extra_slots').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
      supabase.from('invoices').select('*').order('date', { ascending: false }),
      supabase.from('sites').select('*'),
    ])
    setBookings(bRes.data ?? [])
    setSlots(sRes.data ?? [])
    setInvoices(iRes.data ?? [])
    setSites(sitesRes.data ?? [])
    setLoading(false)
  }

  async function submitSlotRequest() {
    if (!user || !profile) return
    setSaving(true)
    const site = sites.find(s => s.id === slotForm.site_id)
    const rate = (profile.custom_rates as Record<string, number>)?.[slotForm.site_id] ?? site?.rate ?? 0
    const hours = calcHours(slotForm.start_time, slotForm.end_time)
    await supabase.from('extra_slots').insert({
      user_id: user.id,
      name: profile.group_name ?? profile.name,
      site_id: slotForm.site_id,
      date: slotForm.date,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time,
      hours,
      reason: slotForm.reason,
      status: 'pending',
      rate,
      total: Math.round(rate * hours),
    })
    await fetchData()
    setShowRequest(false)
    setSlotForm({ site_id: '', date: '', start_time: '', end_time: '', reason: '' })
    setSaving(false)
  }

  const mySites = sites.filter(s => (profile?.site_ids ?? []).includes(s.id))
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length

  const customRates = profile?.custom_rates as Record<string, number> | null

  function sessionTotal(b: Booking) {
    const site = sites.find(s => s.id === b.site_id)
    const rate = customRates?.[b.site_id] ?? site?.rate ?? 0
    return Math.round(b.hours * rate)
  }

  const today = new Date().toISOString().split('T')[0]
  const maxFuture = new Date(); maxFuture.setFullYear(maxFuture.getFullYear() + 1)
  const maxFutureStr = maxFuture.toISOString().split('T')[0]

  const allSessions: Session[] = bookings.flatMap(b => expandBooking(b, maxFutureStr))
  const upcoming = allSessions.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const past = allSessions.filter(s => s.date < today).sort((a, b) => b.date.localeCompare(a.date))

  async function markAttendance(bookingId: string, date: string, value: boolean | null) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return
    if (booking.type === 'recurring') {
      const prev = (booking.session_attendance ?? {}) as Record<string, boolean>
      const updated: Record<string, boolean> = { ...prev }
      if (value === null) delete updated[date]
      else updated[date] = value
      await supabase.from('bookings').update({ session_attendance: updated }).eq('id', bookingId)
      setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, session_attendance: updated } : b))
    } else {
      await supabase.from('bookings').update({ attended: value }).eq('id', bookingId)
      setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, attended: value } : b))
    }
  }

  function sessionAttended(s: Session): boolean | null | undefined {
    if (s.booking.type === 'recurring') {
      return (s.booking.session_attendance as Record<string, boolean> | null)?.[s.date] ?? null
    }
    return s.booking.attended
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'bookings', label: 'My Bookings' },
    { key: 'slots', label: 'Extra Slots' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'pricing', label: 'My Pricing' },
  ]

  const selectedSite = sites.find(s => s.id === slotForm.site_id)
  const previewRate = selectedSite
    ? ((profile?.custom_rates as Record<string, number>)?.[slotForm.site_id] ?? selectedSite.rate)
    : null
  const previewHours = calcHours(slotForm.start_time, slotForm.end_time)
  const previewTotal = previewRate && previewHours > 0 ? Math.round(previewRate * previewHours) : null

  return (
    <div>
      {/* Hero */}
      <div className="portal-hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="ph-greeting">Welcome back, {profile?.group_name ?? profile?.name?.split(' ')[0] ?? 'there'} 👋</div>
            <div className="ph-sub">Your booker portal — manage your sessions and requests</div>
          </div>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
            onClick={() => setShowRequest(true)}
          >
            + Request Extra Slot
          </button>
        </div>
        <div className="ph-stats">
          {[
            { label: 'Total Bookings', value: bookings.length },
            { label: 'Confirmed', value: confirmedBookings },
            { label: 'Extra Slots', value: slots.length },
          ].map(({ label, value }) => (
            <div key={label} className="ph-stat">
              <div className="ph-stat-val">{value}</div>
              <div className="ph-stat-lbl">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="portal-tabs">
          {tabs.map(({ key, label }) => (
            <button key={key} className={`ptab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}

        {!loading && tab === 'bookings' && (
          <>
            {bookings.length === 0 && (
              <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No bookings yet</div></div>
            )}

            {bookings.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

                {/* Upcoming */}
                <div style={{ borderRight: '1px solid var(--border)' }}>
                  <div style={{ padding: '10px 16px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    Upcoming sessions
                  </div>
                  {upcoming.length === 0 && (
                    <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No upcoming sessions</div>
                  )}
                  {upcoming.map(s => {
                    const b = s.booking
                    const site = sites.find(st => st.id === b.site_id)
                    return (
                      <div key={b.id + s.date} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.event}</div>
                          <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{formatPence(sessionTotal(b))}</div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(new Date(s.date + 'T12:00:00'), 'dd MMM yyyy')} · {b.start_time}–{b.end_time}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{site?.name ?? '—'}</div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                          <Badge status={b.status} />
                          <span className={`badge ${b.type === 'recurring' ? 'badge-recurring' : 'badge-oneoff'}`}>
                            {b.type === 'recurring' ? `↻ ${b.recurrence ?? ''}` : 'One-off'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Past */}
                <div>
                  <div style={{ padding: '10px 16px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    Past sessions
                  </div>
                  {past.length === 0 && (
                    <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No past sessions</div>
                  )}
                  {past.map(s => {
                    const b = s.booking
                    const site = sites.find(st => st.id === b.site_id)
                    const attended = sessionAttended(s)
                    const cancelled = ['cancelled', 'denied'].includes(b.status)
                    return (
                      <div key={b.id + s.date} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, opacity: cancelled ? 0.5 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.event}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatPence(sessionTotal(b))}</div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(new Date(s.date + 'T12:00:00'), 'dd MMM yyyy')} · {b.start_time}–{b.end_time}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{site?.name ?? '—'}</div>
                        {!cancelled && (
                          <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                            <button
                              onClick={() => markAttendance(b.id, s.date, attended === true ? null : true)}
                              style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${attended === true ? '#16a34a' : 'var(--border)'}`, background: attended === true ? '#dcfce7' : 'var(--surface2)', color: attended === true ? '#16a34a' : 'var(--text-muted)' }}
                            >✓ Attended</button>
                            <button
                              onClick={() => markAttendance(b.id, s.date, attended === false ? null : false)}
                              style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${attended === false ? '#dc2626' : 'var(--border)'}`, background: attended === false ? '#fee2e2' : 'var(--surface2)', color: attended === false ? '#dc2626' : 'var(--text-muted)' }}
                            >✗ Missed</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

              </div>
            )}
          </>
        )}

        {!loading && tab === 'slots' && (
          <>
            <div className="tbl-header cols-slots">
              <span>Venue</span><span>Date & Time</span><span>Hours</span><span>Status</span><span>Actions</span><span>Total</span>
            </div>
            {slots.length === 0 && (
              <div className="empty"><div className="empty-icon">📅</div><div className="empty-title">No extra slot requests yet</div></div>
            )}
            {slots.map(sl => {
              const site = sites.find(s => s.id === sl.site_id)
              return (
                <div key={sl.id} className="tbl-row cols-slots">
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{site?.name}</div>
                  <div>
                    <div>{format(new Date(sl.date), 'dd MMM yyyy')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sl.start_time}–{sl.end_time}</div>
                  </div>
                  <div style={{ fontWeight: 600 }}>{sl.hours}h</div>
                  <div><Badge status={sl.status} /></div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</div>
                  <div style={{ fontWeight: 700 }}>{formatPence(sl.total)}</div>
                </div>
              )
            })}
          </>
        )}

        {!loading && tab === 'invoices' && (
          <>
            <div className="inv-row" style={{ background: 'var(--surface2)', fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' }}>
              <span>Invoice</span><span>Description</span><span>Amount</span><span>Date</span><span>Status</span><span>Payment</span>
            </div>
            {invoices.length === 0 && (
              <div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">No invoices yet</div></div>
            )}
            {invoices.map(inv => (
              <div key={inv.id} className="inv-row">
                <span style={{ fontWeight: 700, color: 'var(--accent-text)', fontSize: 12 }}>{inv.id.slice(0, 8).toUpperCase()}</span>
                <span style={{ fontSize: 12 }}>{inv.description}</span>
                <span style={{ fontWeight: 700 }}>{formatPence(inv.amount)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{format(new Date(inv.date), 'dd MMM yy')}</span>
                <span>{inv.qf_synced ? <span className="badge badge-qf">🔗 Synced</span> : <span className="badge badge-pending">Not synced</span>}</span>
                <span><span className={`badge ${inv.status === 'paid' ? 'badge-approved' : 'badge-pending'}`}>{inv.status === 'paid' ? '✓ Paid' : '⏳ Due'}</span></span>
              </div>
            ))}
          </>
        )}

        {!loading && tab === 'pricing' && (
          <div style={{ padding: 18 }}>
            {mySites.length === 0 && (
              <div className="empty"><div className="empty-title">No sites assigned yet</div></div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
              {mySites.map(s => {
                const rate = customRates?.[s.id] ?? s.rate
                return (
                  <div key={s.id} className="card" style={{ margin: 0, padding: 16 }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{s.emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{s.name}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>Your rate</span>
                        <span style={{ fontWeight: 700, color: 'var(--accent-text)' }}>{formatPence(rate)}/hr</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>No deposit</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>—</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Capacity</span>
                        <span style={{ fontWeight: 600 }}>{s.capacity} people</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Request Extra Slot Modal */}
      <Modal
        open={showRequest}
        onClose={() => setShowRequest(false)}
        title="Request Extra Slot"
        sub="One-off additional booking"
        footer={
          <div style={{ display: 'flex', gap: 7, width: '100%' }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowRequest(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={saving || !slotForm.site_id || !slotForm.date || !slotForm.start_time || !slotForm.end_time || previewHours <= 0 || !slotForm.reason}
              onClick={submitSlotRequest}
            >
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        }
      >
        <div className="notice notice-accent" style={{ marginBottom: 12 }}>
          ℹ️ Your negotiated custom rate will apply automatically — no deposit required for extra slots.
        </div>
        <div className="form-row">
          <label className="form-label">Venue</label>
          <select className="form-input" value={slotForm.site_id} onChange={e => setSlotForm(f => ({ ...f, site_id: e.target.value }))}>
            <option value="">Select venue…</option>
            {mySites.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={slotForm.date} onChange={e => setSlotForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="form-grid-2">
          <div>
            <label className="form-label">Start time</label>
            <select className="form-input" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value, end_time: '' }))}>
              <option value="">Select…</option>
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">End time</label>
            <select className="form-input" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))}>
              <option value="">Select…</option>
              {TIME_SLOTS.filter(t => !slotForm.start_time || t > slotForm.start_time).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">Reason for extra slot</label>
          <textarea
            className="form-input"
            rows={3}
            value={slotForm.reason}
            onChange={e => setSlotForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Why do you need this extra slot?"
            style={{ resize: 'none' }}
          />
        </div>
        {previewRate != null && previewTotal != null && (
          <div className="price-bar" style={{ marginTop: 8 }}>
            <div><div className="pi-label">Rate</div><div className="pi-value">{formatPence(previewRate)}/hr</div></div>
            <div><div className="pi-label">Hours</div><div className="pi-value">{previewHours}</div></div>
            <div><div className="pi-label">No Deposit</div><div className="pi-value">—</div></div>
            <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>{formatPence(previewTotal)}</div></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
