import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import type { Booking, Site } from '../lib/database.types'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

type BookingWithSite = Booking & { sites?: Site }

export default function Bookings() {
  const [bookings, setBookings] = useState<BookingWithSite[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<BookingWithSite | null>(null)

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    setLoading(true)
    const [bRes] = await Promise.all([
      supabase.from('bookings').select('*, sites(*)').order('date', { ascending: false }),
    ])
    setBookings((bRes.data ?? []) as BookingWithSite[])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('bookings').update({ status }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
    if (status === 'confirmed') sendEmail('booking_approved', id)
    if (status === 'denied') sendEmail('booking_denied', id)
  }

  const filtered = bookings.filter(b => {
    const ms = filter === 'all' || b.status === filter ||
      (filter === 'recurring' && b.type === 'recurring') ||
      (filter === 'oneoff' && b.type === 'oneoff')
    const mq = !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.event.toLowerCase().includes(search.toLowerCase())
    return ms && mq
  })

  const FILTERS = ['all', 'pending', 'confirmed', 'denied', 'recurring', 'oneoff']

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
