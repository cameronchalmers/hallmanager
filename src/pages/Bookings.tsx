import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import type { AppUser, Booking, Site } from '../lib/database.types'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

type BookingWithSite = Booking & { sites?: Site }

function expandRecurring(b: BookingWithSite): string[] {
  if (b.type !== 'recurring' || !b.recurrence) return []
  const dates: string[] = []
  const cur = new Date(b.date + 'T12:00:00')
  const max = new Date(); max.setFullYear(max.getFullYear() + 1)
  while (cur <= max) {
    dates.push(cur.toISOString().split('T')[0])
    if (b.recurrence === 'Weekly') cur.setDate(cur.getDate() + 7)
    else if (b.recurrence === 'Fortnightly') cur.setDate(cur.getDate() + 14)
    else if (b.recurrence === 'Monthly') cur.setMonth(cur.getMonth() + 1)
    else break
  }
  return dates
}

const DEFAULT_FORM = {
  site_id: '',
  user_id: '',
  name: '',
  email: '',
  phone: '',
  event: '',
  date: '',
  start_time: '',
  end_time: '',
  type: 'oneoff',
  recurrence: '',
  notes: '',
  status: 'confirmed',
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

export default function Bookings() {
  const [bookings, setBookings] = useState<BookingWithSite[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [regularUsers, setRegularUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'oneoff' | 'recurring'>('oneoff')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<BookingWithSite | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [copiedPayment, setCopiedPayment] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(DEFAULT_FORM)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [checkedSessions, setCheckedSessions] = useState<Map<string, Set<string>>>(new Map())
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ description: '', amount: '', date: '', status: 'paid' })
  const [invoiceSaving, setInvoiceSaving] = useState(false)

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    setLoading(true)
    const [bRes, sRes, uRes] = await Promise.all([
      supabase.from('bookings').select('*').order('date', { ascending: false }),
      supabase.from('sites').select('*'),
      supabase.from('users').select('*').eq('role', 'regular'),
    ])
    const allSites = sRes.data ?? []
    const bookingsWithSites = (bRes.data ?? []).map(b => ({
      ...b,
      sites: allSites.find(s => s.id === b.site_id),
    })) as BookingWithSite[]
    setBookings(bookingsWithSites)
    setSites(allSites)
    setRegularUsers((uRes.data ?? []) as unknown as AppUser[])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('bookings').update({ status }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
    if (status === 'denied') sendEmail('booking_denied', id)
  }

  async function approveBooking(id: string) {
    setActionLoading('approve')
    // Create Stripe payment link first
    let stripeUrl: string | null = null
    try {
      const { data, error } = await supabase.functions.invoke('stripe-action', {
        body: { action: 'create_payment', booking_id: id },
      })
      if (error) console.error('Stripe payment creation failed:', error)
      else stripeUrl = data?.url ?? null
    } catch (e) { console.error('Stripe action error:', e) }

    await supabase.from('bookings').update({ status: 'approved' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'approved', stripe_payment_url: stripeUrl } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: 'approved', stripe_payment_url: stripeUrl } : null)
    sendEmail('booking_approved', id)
    setActionLoading(null)
  }

  async function cancelBooking(id: string) {
    setActionLoading('cancel')
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: 'cancelled' } : null)
    sendEmail('booking_cancelled', id)
    setSelected(null)
    setActionLoading(null)
  }

  async function markAsPaid(id: string) {
    setActionLoading('paid')
    await supabase.from('bookings').update({ status: 'confirmed', stripe_payment_status: 'paid' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'confirmed', stripe_payment_status: 'paid' } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: 'confirmed', stripe_payment_status: 'paid' } : null)
    setActionLoading(null)
  }

  async function refundDeposit(id: string) {
    setActionLoading('refund')
    const { error } = await supabase.functions.invoke('stripe-action', {
      body: { action: 'refund_deposit', booking_id: id },
    })
    if (!error) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, stripe_payment_status: 'deposit_refunded' } : b))
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, stripe_payment_status: 'deposit_refunded' } : null)
      // Notify QuickFile — creates a credit note for the deposit (fails silently if QF not connected)
      supabase.functions.invoke('quickfile', { body: { action: 'refund_deposit', booking_id: id } })
        .catch(() => {/* QF not configured — ignore */})
    }
    setActionLoading(null)
  }

  function startEdit(b: BookingWithSite) {
    setEditForm({
      site_id: b.site_id,
      user_id: b.user_id ?? '',
      name: b.name,
      email: b.email,
      phone: b.phone,
      event: b.event,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      type: b.type,
      recurrence: b.recurrence ?? '',
      notes: b.notes ?? '',
      status: b.status,
    })
    setEditMode(true)
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    const hours = calcHours(editForm.start_time, editForm.end_time)
    const site = selected.sites
    const total = site ? hours * site.rate + selected.deposit : selected.total
    const totalChanged = total !== selected.total

    await supabase.from('bookings').update({
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone,
      event: editForm.event,
      date: editForm.date,
      start_time: editForm.start_time,
      end_time: editForm.end_time,
      hours,
      type: editForm.type,
      recurrence: editForm.type === 'recurring' ? editForm.recurrence : null,
      notes: editForm.notes || null,
      total,
    }).eq('id', selected.id)

    // If total changed on an unpaid approved booking, regenerate the Stripe payment link
    if (totalChanged && selected.status === 'approved') {
      try {
        await supabase.functions.invoke('stripe-action', {
          body: { action: 'create_payment', booking_id: selected.id },
        })
      } catch (e) { console.error('Stripe regeneration failed:', e) }
    }

    await fetchBookings()
    setEditMode(false)
    setSaving(false)
  }

  async function linkUser(bookingId: string, userId: string | null) {
    const booking = bookings.find(b => b.id === bookingId)
    const updates: { user_id: string | null; total?: number } = { user_id: userId }

    // Recalculate total using the user's custom rate for this site if applicable
    if (userId && booking?.type === 'recurring' && booking.site_id && booking.hours) {
      const user = regularUsers.find(u => u.id === userId)
      const customRate = (user?.custom_rates as Record<string, number> | null)?.[booking.site_id]
      if (customRate) updates.total = booking.hours * customRate
    }

    await supabase.from('bookings').update(updates).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updates } : b))
    if (selected?.id === bookingId) setSelected(prev => prev ? { ...prev, ...updates } : null)
  }

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSessionCheck(bookingId: string, date: string) {
    setCheckedSessions(prev => {
      const next = new Map(prev)
      const cur = new Set(next.get(bookingId) ?? [])
      cur.has(date) ? cur.delete(date) : cur.add(date)
      next.set(bookingId, cur)
      return next
    })
  }

  function toggleAllSessions(bookingId: string, dates: string[]) {
    setCheckedSessions(prev => {
      const next = new Map(prev)
      const cur = next.get(bookingId) ?? new Set()
      const activeDates = dates.filter(d => d)
      const allChecked = activeDates.every(d => cur.has(d))
      next.set(bookingId, allChecked ? new Set() : new Set(activeDates))
      return next
    })
  }

  async function cancelSessions(bookingId: string, dates: string[]) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return
    const existing = booking.cancelled_sessions ?? []
    const updated = [...new Set([...existing, ...dates])]
    await supabase.from('bookings').update({ cancelled_sessions: updated }).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, cancelled_sessions: updated } : b))
    setCheckedSessions(prev => { const next = new Map(prev); next.delete(bookingId); return next })
  }

  async function uncancelSession(bookingId: string, date: string) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return
    const updated = (booking.cancelled_sessions ?? []).filter(d => d !== date)
    await supabase.from('bookings').update({ cancelled_sessions: updated }).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, cancelled_sessions: updated } : b))
  }

  function openInvoiceModal(b: BookingWithSite) {
    const dateFormatted = new Date(b.date + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    setInvoiceForm({
      description: `${b.event} — ${b.sites?.name ?? 'venue'}, ${dateFormatted}`,
      amount: String(b.total ?? ''),
      date: new Date().toISOString().split('T')[0],
      status: 'paid',
    })
    setShowInvoice(true)
  }

  async function createInvoice() {
    if (!selected) return
    setInvoiceSaving(true)
    await supabase.from('invoices').insert({
      booking_id: selected.id,
      user_id: selected.user_id ?? null,
      description: invoiceForm.description,
      amount: parseFloat(invoiceForm.amount) || 0,
      status: invoiceForm.status,
      date: invoiceForm.date,
    })
    setInvoiceSaving(false)
    setShowInvoice(false)
  }

  async function createBooking() {
    const site = sites.find(s => s.id === form.site_id)
    if (!site) return
    setSaving(true)
    const hours = calcHours(form.start_time, form.end_time)
    const isRecurring = form.type === 'recurring'
    const linkedUser = form.user_id ? regularUsers.find(u => u.id === form.user_id) : null
    const effectiveRate = isRecurring && linkedUser
      ? ((linkedUser.custom_rates as Record<string, number> | null)?.[form.site_id] ?? site.rate)
      : site.rate
    await supabase.from('bookings').insert({
      name: form.name,
      email: form.email,
      phone: form.phone,
      event: form.event,
      site_id: form.site_id,
      user_id: form.user_id || null,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      hours,
      type: form.type,
      recurrence: isRecurring ? form.recurrence : null,
      notes: form.notes || null,
      status: form.status,
      deposit: isRecurring ? 0 : site.deposit,
      total: isRecurring ? hours * effectiveRate : hours * site.rate + site.deposit,
    })
    await fetchBookings()
    setShowCreate(false)
    setForm(DEFAULT_FORM)
    setSaving(false)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const filtered = bookings.filter(b => {
    if (b.type !== tab) return false
    const active = !['cancelled', 'denied'].includes(b.status)
    if (tab === 'recurring') {
      if (statusFilter === 'cancelled') return !active
      return active
    } else {
      if (statusFilter === 'pending') return b.status === 'pending'
      if (statusFilter === 'upcoming') return active && b.date >= todayStr
      if (statusFilter === 'past') return active && b.date < todayStr
      if (statusFilter === 'cancelled') return !active
      return active // 'active'
    }
  }).filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.event.toLowerCase().includes(search.toLowerCase()))

  const pendingCount = bookings.filter(b => b.type === 'oneoff' && b.status === 'pending').length
  const recurringActive = bookings.filter(b => b.type === 'recurring' && !['cancelled','denied'].includes(b.status)).length
  const formSite = sites.find(s => s.id === form.site_id)
  const formHours = calcHours(form.start_time, form.end_time)
  const formLinkedUser = form.user_id ? regularUsers.find(u => u.id === form.user_id) : null
  const formEffectiveRate = form.type === 'recurring' && formLinkedUser && formSite
    ? ((formLinkedUser.custom_rates as Record<string, number> | null)?.[form.site_id] ?? formSite.rate)
    : formSite?.rate ?? 0

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid var(--border)' }}>
        {([['oneoff', 'One-off'], ['recurring', '↻ Recurring']] as const).map(([t, label]) => (
          <button
            key={t}
            className="btn btn-ghost"
            style={{
              borderRadius: '6px 6px 0 0',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--accent)' : undefined,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClick={() => { setTab(t); setStatusFilter('active') }}
          >
            {label}
            {t === 'oneoff' && pendingCount > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px', lineHeight: 1.4 }}>{pendingCount}</span>
            )}
            {t === 'recurring' && (
              <span style={{ background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px', lineHeight: 1.4 }}>{recurringActive}</span>
            )}
          </button>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto', alignSelf: 'center', marginBottom: 4 }} onClick={() => setShowCreate(true)}>
          + New Booking
        </button>
      </div>

      {/* Sub-filters + search */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 16, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ width: 180 }}
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {tab === 'recurring' ? (
          [['active', 'Active'], ['cancelled', 'Cancelled']].map(([f, label]) => (
            <button
              key={f}
              className="btn btn-ghost btn-sm"
              style={statusFilter === f ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
              onClick={() => setStatusFilter(f)}
            >{label}</button>
          ))
        ) : (
          [['active', 'All active'], ['pending', 'Pending'], ['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled']].map(([f, label]) => (
            <button
              key={f}
              className="btn btn-ghost btn-sm"
              style={statusFilter === f ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
              onClick={() => setStatusFilter(f)}
            >{label}</button>
          ))
        )}
      </div>

      <div className="card">
        <div className="tbl-header cols-bookings">
          <span>Booking</span><span>Date & Time</span><span>Venue</span><span>Type</span><span>Status</span><span>Actions</span>
        </div>
        {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}
        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📋</div>
            <div className="empty-title">No bookings found</div>
          </div>
        )}
        {filtered.map(b => {
          const site = b.sites
          const isExpanded = expandedIds.has(b.id)
          const allDates = b.type === 'recurring' ? expandRecurring(b) : []
          const cancelledSet = new Set(b.cancelled_sessions ?? [])
          const checked = checkedSessions.get(b.id) ?? new Set<string>()
          const today = todayStr
          return (
            <div key={b.id}>
              <div className="tbl-row cols-bookings" onClick={() => setSelected(b)}>
                <div>
                  <div style={{ fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.event}</div>
                  {b.user_id && (() => { const u = regularUsers.find(u => u.id === b.user_id); return u ? <div style={{ fontSize: 10, color: 'var(--accent-text)', fontWeight: 600, marginTop: 1 }}>🔗 {u.group_name ?? u.name}</div> : null })()}
                </div>
                <div>
                  <div>{format(new Date(b.date), 'dd MMM yyyy')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.start_time}–{b.end_time}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{site?.name ?? '—'}</div>
                <div>
                  <span className={`badge ${b.type === 'recurring' ? 'badge-recurring' : 'badge-oneoff'}`}>
                    {b.type === 'recurring' ? `↻ ${b.recurrence ?? ''}` : 'One-off'}
                  </span>
                </div>
                <div><Badge status={b.status} /></div>
                <div className="approve-deny" onClick={e => e.stopPropagation()}>
                  {b.type === 'recurring' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => toggleExpanded(b.id)}
                    >
                      {isExpanded ? '▲ Hide' : '▼ Sessions'}
                    </button>
                  )}
                  {b.status === 'pending' ? (
                    <>
                      <button className="icon-btn icon-btn-approve" onClick={() => approveBooking(b.id)}>✓</button>
                      <button className="icon-btn icon-btn-deny" onClick={() => updateStatus(b.id, 'denied')}>✗</button>
                    </>
                  ) : b.status === 'confirmed' && b.type !== 'recurring' ? (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setSelected(b); }}>View</button>
                  ) : null}
                </div>
              </div>

              {/* Inline session expansion */}
              {isExpanded && b.type === 'recurring' && (
                <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  {/* Batch action bar */}
                  <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={allDates.filter(d => !cancelledSet.has(d) && d >= today).length > 0 && allDates.filter(d => !cancelledSet.has(d) && d >= today).every(d => checked.has(d))}
                        onChange={() => toggleAllSessions(b.id, allDates.filter(d => !cancelledSet.has(d) && d >= today))}
                      />
                      Select all upcoming
                    </label>
                    {checked.size > 0 && (
                      <button
                        className="btn btn-sm"
                        style={{ background: '#ef4444', color: '#fff', border: 'none', marginLeft: 'auto' }}
                        onClick={() => { if (window.confirm(`Cancel ${checked.size} session${checked.size > 1 ? 's' : ''}?`)) cancelSessions(b.id, [...checked]) }}
                      >
                        Cancel {checked.size} session{checked.size > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>

                  {/* Session list */}
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {allDates.map(date => {
                      const isCancelled = cancelledSet.has(date)
                      const isPast = date < today
                      return (
                        <div key={date} style={{
                          display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px',
                          gap: 10, alignItems: 'center', padding: '7px 16px',
                          borderBottom: '1px solid var(--border)',
                          opacity: isCancelled ? 0.45 : 1,
                        }}>
                          <input
                            type="checkbox"
                            disabled={isCancelled || isPast}
                            checked={checked.has(date)}
                            onChange={() => toggleSessionCheck(b.id, date)}
                          />
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{format(new Date(date + 'T12:00:00'), 'dd MMM yyyy')}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{b.start_time}–{b.end_time}</span>
                          </div>
                          <div>
                            {isCancelled
                              ? <span className="badge badge-denied">Cancelled</span>
                              : isPast
                              ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Past</span>
                              : <span className="badge badge-approved">Upcoming</span>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {isCancelled ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 11, padding: '2px 8px' }}
                                onClick={() => uncancelSession(b.id, date)}
                              >Restore</button>
                            ) : !isPast ? (
                              <button
                                className="btn btn-sm"
                                style={{ fontSize: 11, padding: '2px 8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                                onClick={() => cancelSessions(b.id, [date])}
                              >Cancel</button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Create booking modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setForm(DEFAULT_FORM) }}
        title="New Booking"
        sub="Create a booking on behalf of a customer"
        wide
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setForm(DEFAULT_FORM) }}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={createBooking}
              disabled={saving || !form.site_id || !form.name || !form.email || !form.date || !form.start_time || !form.end_time}
            >
              {saving ? 'Creating…' : 'Create Booking'}
            </button>
          </>
        }
      >
        <div className="form-grid-2">
          <div>
            <label className="form-label">Venue</label>
            <select className="form-input" value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
              <option value="">Select venue…</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <div>
            <label className="form-label">Contact name</label>
            <input className="form-input" placeholder="Jane Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="jane@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div className="form-grid-2">
          <div>
            <label className="form-label">Phone</label>
            <input className="form-input" placeholder="07700 900000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Event / purpose</label>
            <input className="form-input" placeholder="Birthday party…" value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} />
          </div>
        </div>
        <div className="form-grid-2">
          <div>
            <label className="form-label">Type</label>
            <select className="form-input" value={form.type} onChange={e => {
              const t = e.target.value
              setForm(f => ({ ...f, type: t, recurrence: t === 'recurring' ? (f.recurrence || 'Weekly') : f.recurrence }))
            }}>
              <option value="oneoff">One-off</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
          <div>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
        </div>
        {form.type === 'recurring' && (
          <>
            <div className="form-row">
              <label className="form-label">Recurrence</label>
              <select className="form-input" value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}>
                <option value="Weekly">Weekly</option>
                <option value="Fortnightly">Fortnightly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">Linked booker <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — applies custom rate)</span></label>
              <select className="form-input" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">None</option>
                {regularUsers.map(u => <option key={u.id} value={u.id}>{u.group_name ?? u.name}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="form-grid-2">
          <div>
            <label className="form-label">Start time</label>
            <input className="form-input" type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">End time</label>
            <input className="form-input" type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">Notes <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
          <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        {formSite && formHours > 0 && (
          <div className="price-bar" style={{ marginTop: 4 }}>
            <div><div className="pi-label">Rate</div><div className="pi-value">£{formEffectiveRate}/hr{formEffectiveRate !== formSite.rate ? ' ✦' : ''}</div></div>
            <div><div className="pi-label">Hours</div><div className="pi-value">{formHours}</div></div>
            {form.type === 'recurring'
              ? <div><div className="pi-label">No Deposit</div><div className="pi-value">—</div></div>
              : <div><div className="pi-label">Deposit</div><div className="pi-value">£{formSite.deposit}</div></div>}
            <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>£{form.type === 'recurring' ? formHours * formEffectiveRate : formHours * formSite.rate + formSite.deposit}</div></div>
          </div>
        )}
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setEditMode(false) }}
        title={editMode ? 'Edit Booking' : (selected?.event ?? '')}
        sub={!editMode && selected ? `${format(new Date(selected.date), 'dd MMM yyyy')} · created ${format(new Date(selected.created_at), 'dd MMM yyyy')}` : ''}
        footer={
          editMode ? (
            <div style={{ display: 'flex', gap: 7, width: '100%' }}>
              <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => setEditMode(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          ) : selected?.status === 'pending' ? (
            <div style={{ display: 'flex', gap: 7, width: '100%' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { updateStatus(selected.id, 'denied'); setSelected(null) }} disabled={!!actionLoading}>✗ Deny</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => approveBooking(selected.id)} disabled={!!actionLoading}>
                {actionLoading === 'approve' ? 'Approving…' : '✓ Approve & Send Payment'}
              </button>
            </div>
          ) : selected?.status === 'approved' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {selected.stripe_payment_url && (
                <div style={{ display: 'flex', gap: 7 }}>
                  <input readOnly className="form-input" value={selected.stripe_payment_url} style={{ flex: 1, fontSize: 11 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(selected.stripe_payment_url!); setCopiedPayment(true); setTimeout(() => setCopiedPayment(false), 2000) }}>
                    {copiedPayment ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 7 }}>
                <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={() => cancelBooking(selected.id)} disabled={!!actionLoading}>
                  {actionLoading === 'cancel' ? 'Cancelling…' : 'Cancel Booking'}
                </button>
                {selected.stripe_payment_status === 'deposit_refunded' ? (
                  <span className="badge badge-neutral" style={{ alignSelf: 'center' }}>Deposit refunded</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => markAsPaid(selected.id)} disabled={!!actionLoading}>
                    {actionLoading === 'paid' ? 'Saving…' : '✓ Mark as Paid'}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(selected)}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
          ) : selected?.status === 'confirmed' ? (
            <div style={{ display: 'flex', gap: 7, width: '100%' }}>
              <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={() => cancelBooking(selected.id)} disabled={!!actionLoading}>
                {actionLoading === 'cancel' ? 'Cancelling…' : 'Cancel Booking'}
              </button>
              {selected.stripe_payment_status === 'deposit_refunded' ? (
                <span className="badge badge-neutral" style={{ alignSelf: 'center' }}>Deposit refunded</span>
              ) : selected.stripe_payment_status === 'paid' ? (
                <button className="btn btn-primary btn-sm" onClick={() => refundDeposit(selected.id)} disabled={!!actionLoading}>
                  {actionLoading === 'refund' ? 'Refunding…' : `Refund Deposit (£${selected.deposit})`}
                </button>
              ) : null}
              <button className="btn btn-ghost btn-sm" onClick={() => openInvoiceModal(selected)}>+ Invoice</button>
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(selected)}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setSelected(null)}>Close</button>
          )
        }
      >
        {selected && !editMode && (
          <>
            <div className="notice notice-accent" style={{ marginBottom: 12 }}>
              <span>{selected.sites?.emoji}</span>
              <div>
                <strong>{selected.sites?.name ?? 'Unknown venue'}</strong>
                <div style={{ fontSize: 11, marginTop: 1 }}>{selected.sites?.address}</div>
              </div>
            </div>
            <div className="detail-grid">
              <div><div className="detail-label">Contact</div><div className="detail-value">{selected.name}</div></div>
              <div><div className="detail-label">Status</div><div className="detail-value"><Badge status={selected.status} /></div></div>
              <div><div className="detail-label">Email</div><div className="detail-value" style={{ fontSize: 12 }}>{selected.email}</div></div>
              <div><div className="detail-label">Phone</div><div className="detail-value" style={{ fontSize: 12 }}>{selected.phone}</div></div>
              <div><div className="detail-label">Date</div><div className="detail-value">{format(new Date(selected.date), 'dd MMM yyyy')}</div></div>
              <div><div className="detail-label">Time</div><div className="detail-value">{selected.start_time}–{selected.end_time} ({selected.hours}h)</div></div>
              <div><div className="detail-label">Type</div><div className="detail-value"><span className={`badge ${selected.type === 'recurring' ? 'badge-recurring' : 'badge-oneoff'}`}>{selected.type === 'recurring' ? `↻ ${selected.recurrence}` : 'One-off'}</span></div></div>
              <div><div className="detail-label">Capacity</div><div className="detail-value">Up to {selected.sites?.capacity} guests</div></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 5 }}>Linked hirer</label>
              <select
                className="form-input"
                value={selected.user_id ?? ''}
                onChange={e => linkUser(selected.id, e.target.value || null)}
              >
                <option value="">— No linked hirer —</option>
                {regularUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.group_name ?? u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            {selected.notes && (
              <div style={{ background: '#fafafa', borderRadius: 7, padding: '9px 12px', fontSize: 12, color: '#3f3f46', marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Notes</div>
                {selected.notes}
              </div>
            )}
            <div className="price-bar">
              <div><div className="pi-label">Rate</div><div className="pi-value">£{selected.sites?.rate ?? 0}/hr</div></div>
              <div><div className="pi-label">Hours</div><div className="pi-value">{selected.hours}</div></div>
              <div><div className="pi-label">Deposit</div><div className="pi-value">£{selected.deposit}</div></div>
              <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>£{selected.total}</div></div>
            </div>
          </>
        )}
        {selected && editMode && (() => {
          const editHours = calcHours(editForm.start_time, editForm.end_time)
          const editTotal = selected.sites ? editHours * selected.sites.rate + selected.deposit : selected.total
          const totalChanged = editTotal !== selected.total
          return (
            <>
              {selected.status === 'confirmed' && totalChanged && (
                <div className="notice notice-warn" style={{ marginBottom: 12, fontSize: 12 }}>
                  Total has changed from £{selected.total} to £{editTotal}. Since this booking is already paid, send a new payment link manually if additional payment is needed.
                </div>
              )}
              {selected.status === 'approved' && totalChanged && (
                <div className="notice notice-accent" style={{ marginBottom: 12, fontSize: 12 }}>
                  Total will change from £{selected.total} to £{editTotal}. The Stripe payment link will be regenerated automatically.
                </div>
              )}
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Name</label>
                  <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Event / purpose</label>
                  <input className="form-input" value={editForm.event} onChange={e => setEditForm(f => ({ ...f, event: e.target.value }))} />
                </div>
              </div>
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="oneoff">One-off</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              {editForm.type === 'recurring' && (
                <div className="form-row">
                  <label className="form-label">Recurrence</label>
                  <select className="form-input" value={editForm.recurrence} onChange={e => setEditForm(f => ({ ...f, recurrence: e.target.value }))}>
                    <option value="">Select…</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Fortnightly">Fortnightly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              )}
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Start time</label>
                  <select className="form-input" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}>
                    <option value="">Select…</option>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">End time</label>
                  <select className="form-input" value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}>
                    <option value="">Select…</option>
                    {TIME_SLOTS.filter(t => !editForm.start_time || t > editForm.start_time).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">Notes <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {editHours > 0 && selected.sites && (
                <div className="price-bar" style={{ marginTop: 4 }}>
                  <div><div className="pi-label">Rate</div><div className="pi-value">£{selected.sites.rate}/hr</div></div>
                  <div><div className="pi-label">Hours</div><div className="pi-value">{editHours}</div></div>
                  <div><div className="pi-label">Deposit</div><div className="pi-value">£{selected.deposit}</div></div>
                  <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>£{editTotal}</div></div>
                </div>
              )}
            </>
          )
        })()}
      </Modal>

      <Modal
        open={showInvoice}
        title="Create Invoice"
        onClose={() => setShowInvoice(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowInvoice(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={createInvoice} disabled={invoiceSaving}>
              {invoiceSaving ? 'Saving…' : 'Create Invoice'}
            </button>
          </div>
        }
      >
        <div className="form-row">
          <label className="form-label">Description</label>
          <input className="form-input" value={invoiceForm.description} onChange={e => setInvoiceForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="form-label">Amount (£)</label>
            <input className="form-input" type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={invoiceForm.date} onChange={e => setInvoiceForm(f => ({ ...f, date: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">Status</label>
          <select className="form-input" value={invoiceForm.status} onChange={e => setInvoiceForm(f => ({ ...f, status: e.target.value }))}>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </Modal>
    </div>
  )
}
