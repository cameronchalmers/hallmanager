import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import type { Booking, Site } from '../lib/database.types'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

type BookingWithSite = Booking & { sites?: Site }

const DEFAULT_FORM = {
  site_id: '',
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

function calcHours(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

export default function Bookings() {
  const [bookings, setBookings] = useState<BookingWithSite[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<BookingWithSite | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    setLoading(true)
    const [bRes, sRes] = await Promise.all([
      supabase.from('bookings').select('*').order('date', { ascending: false }),
      supabase.from('sites').select('*'),
    ])
    const allSites = sRes.data ?? []
    const bookingsWithSites = (bRes.data ?? []).map(b => ({
      ...b,
      sites: allSites.find(s => s.id === b.site_id),
    })) as BookingWithSite[]
    setBookings(bookingsWithSites)
    setSites(allSites)
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('bookings').update({ status }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
    if (status === 'confirmed') sendEmail('booking_approved', id)
    if (status === 'denied') sendEmail('booking_denied', id)
  }

  async function createBooking() {
    const site = sites.find(s => s.id === form.site_id)
    if (!site) return
    setSaving(true)
    const hours = calcHours(form.start_time, form.end_time)
    await supabase.from('bookings').insert({
      name: form.name,
      email: form.email,
      phone: form.phone,
      event: form.event,
      site_id: form.site_id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      hours,
      type: form.type,
      recurrence: form.type === 'recurring' ? form.recurrence : null,
      notes: form.notes || null,
      status: form.status,
      deposit: site.deposit,
      total: hours * site.rate + site.deposit,
    })
    await fetchBookings()
    setShowCreate(false)
    setForm(DEFAULT_FORM)
    setSaving(false)
  }

  const filtered = bookings.filter(b => {
    const ms = filter === 'all' || b.status === filter ||
      (filter === 'recurring' && b.type === 'recurring') ||
      (filter === 'oneoff' && b.type === 'oneoff')
    const mq = !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.event.toLowerCase().includes(search.toLowerCase())
    return ms && mq
  })

  const FILTERS = ['all', 'pending', 'confirmed', 'denied', 'recurring', 'oneoff']
  const formSite = sites.find(s => s.id === form.site_id)
  const formHours = calcHours(form.start_time, form.end_time)

  return (
    <div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ width: 180 }}
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {FILTERS.map(f => (
          <button
            key={f}
            className="btn btn-ghost btn-sm"
            style={filter === f ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowCreate(true)}>
          + New Booking
        </button>
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
          return (
            <div key={b.id} className="tbl-row cols-bookings" onClick={() => setSelected(b)}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.event}</div>
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
                {b.status === 'pending' ? (
                  <>
                    <button className="icon-btn icon-btn-approve" onClick={() => updateStatus(b.id, 'confirmed')}>✓</button>
                    <button className="icon-btn icon-btn-deny" onClick={() => updateStatus(b.id, 'denied')}>✗</button>
                  </>
                ) : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
              </div>
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
            <select className="form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
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
          <div className="form-row">
            <label className="form-label">Recurrence</label>
            <select className="form-input" value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}>
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
            <div><div className="pi-label">Rate</div><div className="pi-value">£{formSite.rate}/hr</div></div>
            <div><div className="pi-label">Hours</div><div className="pi-value">{formHours}</div></div>
            <div><div className="pi-label">Deposit</div><div className="pi-value">£{formSite.deposit}</div></div>
            <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>£{formHours * formSite.rate + formSite.deposit}</div></div>
          </div>
        )}
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.event ?? ''}
        sub={selected ? `${format(new Date(selected.date), 'dd MMM yyyy')} · created ${format(new Date(selected.created_at), 'dd MMM yyyy')}` : ''}
        footer={
          selected?.status === 'pending' ? (
            <div style={{ display: 'flex', gap: 7, width: '100%' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { updateStatus(selected.id, 'denied'); setSelected(null) }}>✗ Deny</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { updateStatus(selected.id, 'confirmed'); setSelected(null) }}>✓ Approve & Notify</button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setSelected(null)}>Close</button>
          )
        }
      >
        {selected && (
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
      </Modal>
    </div>
  )
}
