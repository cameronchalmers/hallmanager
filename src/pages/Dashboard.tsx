import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import type { Booking, ExtraSlot, Site } from '../lib/database.types'
import Badge from '../components/ui/Badge'
import { format } from 'date-fns'

type BookingWithSite = Booking & { sites?: Site }

export default function Dashboard() {
  const [bookings, setBookings] = useState<BookingWithSite[]>([])
  const [slots, setSlots] = useState<ExtraSlot[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [bRes, sRes, sitesRes] = await Promise.all([
      supabase.from('bookings').select('*, sites(*)').order('created_at', { ascending: false }),
      supabase.from('extra_slots').select('*').order('created_at', { ascending: false }),
      supabase.from('sites').select('*'),
    ])
    setBookings((bRes.data ?? []) as BookingWithSite[])
    setSlots(sRes.data ?? [])
    setSites(sitesRes.data ?? [])
    setLoading(false)
  }

  async function approveBooking(id: string) {
    await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'confirmed' } : b))
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
  const confirmed = bookings.filter(b => b.status === 'confirmed')
  const revenue = confirmed.reduce((s, b) => s + (b.total ?? 0), 0)

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
          <div className="stat-value">£{revenue.toLocaleString()}</div>
          <div className="stat-sub">Confirmed bookings</div>
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
                <div key={b.id} className="tbl-row cols-bookings">
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

      {/* Upcoming confirmed */}
      <div className="sec-label">Upcoming confirmed</div>
      <div className="card">
        <div className="tbl-header cols-bookings">
          <span>Booking</span><span>Date & Time</span><span>Venue</span><span>Type</span><span>Status</span><span></span>
        </div>
        {confirmed.length === 0 && (
          <div className="empty">
            <div className="empty-icon">✅</div>
            <div className="empty-title">No confirmed bookings yet</div>
          </div>
        )}
        {confirmed.slice(0, 5).map(b => {
          const site = (b as BookingWithSite).sites
          return (
            <div key={b.id} className="tbl-row cols-bookings">
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
              <div></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
