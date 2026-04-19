import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import { useSite } from '../context/SiteContext'
import type { AppUser, Booking, Site } from '../lib/database.types'
import { formatPence, poundsToPence } from '../lib/money'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

type BookingWithSite = Booking & { sites?: Site }

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dateDow(dateStr: string): number {
  return (new Date(dateStr + 'T12:00:00').getDay() + 6) % 7
}

function expandRecurring(b: BookingWithSite): string[] {
  if (b.type !== 'recurring' || !b.recurrence) return []
  const max = new Date(); max.setFullYear(max.getFullYear() + 1)
  const toDs = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const isMultiDay = b.recurrence === 'Weekly' && b.recurrence_days && b.recurrence_days.length > 1

  if (isMultiDay) {
    const days = [...(b.recurrence_days as number[])].sort()
    const start = new Date(b.date + 'T12:00:00')
    const startDow = (start.getDay() + 6) % 7
    const weekCur = new Date(start)
    weekCur.setDate(weekCur.getDate() - startDow)
    const dates: string[] = []
    while (weekCur <= max) {
      for (const dayIdx of days) {
        const d = new Date(weekCur)
        d.setDate(d.getDate() + dayIdx)
        const ds = toDs(d)
        if (ds >= b.date && d <= max) dates.push(ds)
      }
      weekCur.setDate(weekCur.getDate() + 7)
    }
    return dates.sort()
  }

  const dates: string[] = []
  const cur = new Date(b.date + 'T12:00:00')
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
  recurrence_days: [] as number[],
  notes: '',
  status: 'confirmed',
  waive_deposit: false,
}


function calcHours(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}


export default function Bookings() {
  const { currentSite } = useSite()
  const [bookings, setBookings] = useState<BookingWithSite[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [regularUsers, setRegularUsers] = useState<AppUser[]>([])
  const [staffUsers, setStaffUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'oneoff' | 'recurring'>('oneoff')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<BookingWithSite | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [refundInput, setRefundInput] = useState<string | null>(null)
  const [copiedPayment, setCopiedPayment] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(DEFAULT_FORM)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [checkedSessions, setCheckedSessions] = useState<Map<string, Set<string>>>(new Map())
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ description: '', amount: '', date: '', status: 'paid' })
  const [invoiceSaving, setInvoiceSaving] = useState(false)

  useEffect(() => { if (currentSite) fetchBookings() }, [currentSite?.id])

  async function fetchBookings() {
    if (!currentSite) return
    setLoading(true)
    const [bRes, uRes, staffRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('site_id', currentSite.id).order('date', { ascending: false }),
      supabase.from('users').select('*').eq('role', 'regular'),
      supabase.from('users').select('*').in('role', ['admin', 'manager']),
    ])
    const bookingsWithSites = (bRes.data ?? []).map(b => ({
      ...b,
      sites: currentSite,
    })) as BookingWithSite[]
    setBookings(bookingsWithSites)
    setSites([currentSite])
    setRegularUsers((uRes.data ?? []) as unknown as AppUser[])
    setStaffUsers((staffRes.data ?? []) as unknown as AppUser[])
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
    await supabase.from('bookings').update({ status: 'approved' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'approved' } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: 'approved' } : null)
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
    supabase.functions.invoke('manage-calendar-event', { body: { action: 'delete', booking_id: id } })
      .catch(() => {/* Calendar not configured */})
  }

  async function markAsPaid(id: string) {
    setActionLoading('paid')
    await supabase.from('bookings').update({ status: 'confirmed', stripe_payment_status: 'paid' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'confirmed', stripe_payment_status: 'paid' } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: 'confirmed', stripe_payment_status: 'paid' } : null)
    setActionLoading(null)
    const booking = bookings.find(b => b.id === id)
    if (booking?.type === 'oneoff') {
      supabase.functions.invoke('manage-calendar-event', { body: { action: 'create', booking_id: id } })
        .catch(() => {/* Calendar not configured */})
    }
  }

  async function refundDeposit(id: string, amountPence: number) {
    setActionLoading('refund')
    const { error } = await supabase.functions.invoke('stripe-action', {
      body: { action: 'refund_deposit', booking_id: id, amount: amountPence },
    })
    if (!error) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, stripe_payment_status: 'deposit_refunded', refunded_amount: amountPence } : b))
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, stripe_payment_status: 'deposit_refunded', refunded_amount: amountPence } : null)
      setRefundInput(null)
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
      recurrence_days: b.recurrence_days ?? (b.date ? [dateDow(b.date)] : []),
      notes: b.notes ?? '',
      status: b.status,
      waive_deposit: false,
    })
    setEditMode(true)
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    const hours = calcHours(editForm.start_time, editForm.end_time)
    const site = selected.sites
    const linkedUser = selected.user_id ? regularUsers.find(u => u.id === selected.user_id) : null
    const customRate = linkedUser ? (linkedUser.custom_rates as Record<string, number> | null)?.[selected.site_id] : null
    const effectiveRate = customRate ?? site?.rate ?? 0
    const total = site ? Math.round(hours * effectiveRate) + selected.deposit : selected.total
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
      recurrence_days: editForm.type === 'recurring' && editForm.recurrence === 'Weekly' && editForm.recurrence_days.length > 0 ? editForm.recurrence_days : null,
      notes: editForm.notes || null,
      total,
    }).eq('id', selected.id)

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
      if (customRate) updates.total = Math.round(booking.hours * customRate)
    }

    await supabase.from('bookings').update(updates).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updates } : b))
    if (selected?.id === bookingId) setSelected(prev => prev ? { ...prev, ...updates } : null)
  }

  async function assignStaff(bookingId: string, userId: string | null) {
    await supabase.from('bookings').update({ assigned_to: userId }).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, assigned_to: userId } : b))
    if (selected?.id === bookingId) setSelected(prev => prev ? { ...prev, assigned_to: userId } : null)
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
      amount: b.total != null ? String(b.total / 100) : '',
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
      amount: poundsToPence(parseFloat(invoiceForm.amount) || 0),
      status: invoiceForm.status,
      date: invoiceForm.date,
    })
    setInvoiceSaving(false)
    setShowInvoice(false)
  }

  async function deleteBooking(id: string) {
    if (!window.confirm('Permanently delete this booking? No email will be sent.')) return
    await supabase.from('bookings').delete().eq('id', id)
    setBookings(prev => prev.filter(b => b.id !== id))
    setSelected(null)
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
    const { data: newBooking } = await supabase.from('bookings').insert({
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
      recurrence_days: isRecurring && form.recurrence === 'Weekly' && form.recurrence_days.length > 0 ? form.recurrence_days : null,
      notes: form.notes || null,
      status: form.status,
      deposit: isRecurring || form.waive_deposit ? 0 : site.deposit,
      total: isRecurring || form.waive_deposit ? Math.round(hours * effectiveRate) : Math.round(hours * site.rate) + site.deposit,
    }).select('id').single()
    await fetchBookings()
    setShowCreate(false)
    setForm(DEFAULT_FORM)
    setSaving(false)
    if (newBooking?.id && form.status === 'confirmed' && form.type === 'oneoff') {
      supabase.functions.invoke('manage-calendar-event', { body: { action: 'create', booking_id: newBooking.id } })
        .catch(() => {/* Calendar not configured */})
    }
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
              <div className="tbl-row cols-bookings" onClick={() => { setSelected(b); setRefundInput(null) }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.event}</div>
                  {b.user_id && (() => { const u = regularUsers.find(u => u.id === b.user_id); return u ? <div style={{ fontSize: 10, color: 'var(--accent-text)', fontWeight: 600, marginTop: 1 }}>🔗 {u.group_name ?? u.name}</div> : null })()}
                  {b.assigned_to && (() => { const u = staffUsers.find(u => u.id === b.assigned_to); return u ? <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>👤 {u.name}</div> : null })()}
                </div>
                <div>
                  <div>{format(new Date(b.date), 'dd MMM yyyy')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.start_time}–{b.end_time}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{site?.name ?? '—'}</div>
                <div>
                  <span className={`badge ${b.type === 'recurring' ? 'badge-recurring' : 'badge-oneoff'}`}>
                    {b.type === 'recurring'
                      ? `↻ ${b.recurrence ?? ''}${b.recurrence_days && b.recurrence_days.length > 1 ? ' · ' + b.recurrence_days.slice().sort((a,c)=>a-c).map(d => WEEK_DAYS[d]).join(', ') : ''}`
                      : 'One-off'}
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
            <input className="form-input" type="date" value={form.date} onChange={e => {
              const d = e.target.value
              const dow = d ? dateDow(d) : null
              setForm(f => ({ ...f, date: d, recurrence_days: dow !== null ? [dow, ...f.recurrence_days.filter(x => x !== dow)].sort((a, b) => a - b) : f.recurrence_days }))
            }} />
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
            {form.recurrence === 'Weekly' && (
              <div className="form-row">
                <label className="form-label">Days of week</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {WEEK_DAYS.map((day, idx) => {
                    const isPrimary = form.date ? dateDow(form.date) === idx : false
                    const isOn = form.recurrence_days.includes(idx)
                    return (
                      <button
                        key={day}
                        type="button"
                        className="btn btn-sm"
                        style={{ background: isOn ? 'var(--accent)' : 'var(--surface2)', color: isOn ? '#fff' : 'var(--text)', border: '1px solid var(--border)', minWidth: 42 }}
                        onClick={() => {
                          if (isPrimary) return
                          setForm(f => ({
                            ...f,
                            recurrence_days: isOn
                              ? f.recurrence_days.filter(d => d !== idx)
                              : [...f.recurrence_days, idx].sort((a, b) => a - b),
                          }))
                        }}
                      >
                        {day}{isPrimary ? ' ·' : ''}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>The date's day is always included (·). Select additional days.</div>
              </div>
            )}
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
        {form.type === 'oneoff' && (
          <div className="form-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.waive_deposit}
                onChange={e => setForm(f => ({ ...f, waive_deposit: e.target.checked }))}
              />
              <span>Waive deposit for this booking</span>
            </label>
          </div>
        )}
        {formSite && formHours > 0 && (
          <div className="price-bar" style={{ marginTop: 4 }}>
            <div><div className="pi-label">Rate</div><div className="pi-value">{formatPence(formEffectiveRate)}/hr{formEffectiveRate !== formSite.rate ? ' ✦' : ''}</div></div>
            <div><div className="pi-label">Hours</div><div className="pi-value">{formHours}</div></div>
            {form.type === 'recurring' || form.waive_deposit
              ? <div><div className="pi-label">No Deposit</div><div className="pi-value">—</div></div>
              : <div><div className="pi-label">Deposit</div><div className="pi-value">{formatPence(formSite.deposit)}</div></div>}
            <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>{formatPence(form.type === 'recurring' || form.waive_deposit ? Math.round(formHours * formEffectiveRate) : Math.round(formHours * formSite.rate) + formSite.deposit)}</div></div>
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
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(selected)}>Edit</button>
              <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => deleteBooking(selected.id)} disabled={!!actionLoading}>Delete</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => approveBooking(selected.id)} disabled={!!actionLoading}>
                {actionLoading === 'approve' ? 'Approving…' : '✓ Approve & Send Payment'}
              </button>
            </div>
          ) : selected?.status === 'approved' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <div style={{ display: 'flex', gap: 7 }}>
                <input readOnly className="form-input" value={`${window.location.origin}/pay/${selected.id}`} style={{ flex: 1, fontSize: 11 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/pay/${selected.id}`); setCopiedPayment(true); setTimeout(() => setCopiedPayment(false), 2000) }}>
                  {copiedPayment ? '✓ Copied' : 'Copy link'}
                </button>
              </div>
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
                <span className="badge badge-neutral" style={{ alignSelf: 'center' }}>
                  {formatPence((selected as BookingWithSite & { refunded_amount?: number }).refunded_amount ?? selected.deposit)} refunded
                </span>
              ) : selected.stripe_payment_status === 'paid' ? (
                refundInput !== null ? (
                  <>
                    <span style={{ fontSize: 12, alignSelf: 'center', color: 'var(--text-muted)' }}>£</span>
                    <input
                      className="form-input"
                      style={{ width: 80, padding: '4px 8px', fontSize: 13 }}
                      value={refundInput}
                      onChange={e => setRefundInput(e.target.value)}
                      onKeyDown={e => e.key === 'Escape' && setRefundInput(null)}
                      autoFocus
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!!actionLoading || !refundInput || isNaN(parseFloat(refundInput)) || parseFloat(refundInput) <= 0}
                      onClick={() => refundDeposit(selected.id, Math.round(parseFloat(refundInput!) * 100))}
                    >
                      {actionLoading === 'refund' ? 'Refunding…' : 'Confirm'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setRefundInput(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => setRefundInput((selected.deposit / 100).toFixed(2))} disabled={!!actionLoading}>
                    Issue Refund
                  </button>
                )
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
              <div><div className="detail-label">Type</div><div className="detail-value"><span className={`badge ${selected.type === 'recurring' ? 'badge-recurring' : 'badge-oneoff'}`}>{selected.type === 'recurring' ? `↻ ${selected.recurrence}${selected.recurrence_days && selected.recurrence_days.length > 1 ? ' · ' + selected.recurrence_days.slice().sort((a,c)=>a-c).map(d => WEEK_DAYS[d]).join(', ') : ''}` : 'One-off'}</span></div></div>
              <div><div className="detail-label">Capacity</div><div className="detail-value">Up to {selected.sites?.capacity} guests</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
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
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 5 }}>Assigned to</label>
                <select
                  className="form-input"
                  value={selected.assigned_to ?? ''}
                  onChange={e => assignStaff(selected.id, e.target.value || null)}
                >
                  <option value="">— Unassigned —</option>
                  {staffUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {selected.notes && (
              <div style={{ background: '#fafafa', borderRadius: 7, padding: '9px 12px', fontSize: 12, color: '#3f3f46', marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Notes</div>
                {selected.notes}
              </div>
            )}
            <div className="price-bar">
              <div><div className="pi-label">Rate</div><div className="pi-value">{formatPence(selected.sites?.rate ?? 0)}/hr</div></div>
              <div><div className="pi-label">Hours</div><div className="pi-value">{selected.hours}</div></div>
              <div><div className="pi-label">Deposit</div><div className="pi-value">{formatPence(selected.deposit)}</div></div>
              <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>{formatPence(selected.total)}</div></div>
            </div>
          </>
        )}
        {selected && editMode && (() => {
          const editHours = calcHours(editForm.start_time, editForm.end_time)
          const editLinkedUser = selected.user_id ? regularUsers.find(u => u.id === selected.user_id) : null
          const editCustomRate = editLinkedUser ? (editLinkedUser.custom_rates as Record<string, number> | null)?.[selected.site_id] : null
          const editEffectiveRate = editCustomRate ?? selected.sites?.rate ?? 0
          const editTotal = selected.sites ? Math.round(editHours * editEffectiveRate) + selected.deposit : selected.total
          const totalChanged = editTotal !== selected.total
          return (
            <>
              {selected.status === 'confirmed' && totalChanged && (
                <div className="notice notice-warn" style={{ marginBottom: 12, fontSize: 12 }}>
                  Total has changed from {formatPence(selected.total)} to {formatPence(editTotal)}. Since this booking is already paid, send a new payment link manually if additional payment is needed.
                </div>
              )}
              {selected.status === 'approved' && totalChanged && (
                <div className="notice notice-accent" style={{ marginBottom: 12, fontSize: 12 }}>
                  Total will change from {formatPence(selected.total)} to {formatPence(editTotal)}. The payment link will reflect the updated amount automatically.
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
                <>
                  <div className="form-row">
                    <label className="form-label">Recurrence</label>
                    <select className="form-input" value={editForm.recurrence} onChange={e => setEditForm(f => ({ ...f, recurrence: e.target.value }))}>
                      <option value="">Select…</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Fortnightly">Fortnightly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                  {editForm.recurrence === 'Weekly' && (
                    <div className="form-row">
                      <label className="form-label">Days of week</label>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {WEEK_DAYS.map((day, idx) => {
                          const isPrimary = editForm.date ? dateDow(editForm.date) === idx : false
                          const isOn = editForm.recurrence_days.includes(idx)
                          return (
                            <button
                              key={day}
                              type="button"
                              className="btn btn-sm"
                              style={{ background: isOn ? 'var(--accent)' : 'var(--surface2)', color: isOn ? '#fff' : 'var(--text)', border: '1px solid var(--border)', minWidth: 42 }}
                              onClick={() => {
                                if (isPrimary) return
                                setEditForm(f => ({
                                  ...f,
                                  recurrence_days: isOn
                                    ? f.recurrence_days.filter(d => d !== idx)
                                    : [...f.recurrence_days, idx].sort((a, b) => a - b),
                                }))
                              }}
                            >
                              {day}{isPrimary ? ' ·' : ''}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Start time</label>
                  <input className="form-input" type="time" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">End time</label>
                  <input className="form-input" type="time" value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">Notes <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {editHours > 0 && selected.sites && (
                <div className="price-bar" style={{ marginTop: 4 }}>
                  <div><div className="pi-label">Rate</div><div className="pi-value">{formatPence(editEffectiveRate)}/hr{editCustomRate ? ' ✦' : ''}</div></div>
                  <div><div className="pi-label">Hours</div><div className="pi-value">{editHours}</div></div>
                  <div><div className="pi-label">Deposit</div><div className="pi-value">{formatPence(selected.deposit)}</div></div>
                  <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>{formatPence(editTotal)}</div></div>
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
