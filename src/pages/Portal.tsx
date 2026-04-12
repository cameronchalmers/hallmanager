import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Booking, ExtraSlot, Invoice, Site } from '../lib/database.types'
import { useAuth } from '../context/AuthContext'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

type Tab = 'bookings' | 'slots' | 'invoices' | 'pricing'

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
    hours: '',
    reason: '',
  })

  useEffect(() => { if (user) fetchData() }, [user])

  async function fetchData() {
    setLoading(true)
    const [bRes, sRes, iRes, sitesRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
      supabase.from('extra_slots').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
      supabase.from('invoices').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
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
    const hours = parseFloat(slotForm.hours)
    await supabase.from('extra_slots').insert({
      user_id: user.id,
      name: profile.name,
      site_id: slotForm.site_id,
      date: slotForm.date,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time,
      hours,
      reason: slotForm.reason,
      status: 'pending',
      rate,
      total: rate * hours,
    })
    await fetchData()
    setShowRequest(false)
    setSlotForm({ site_id: '', date: '', start_time: '', end_time: '', hours: '', reason: '' })
    setSaving(false)
  }

  const mySites = sites.filter(s => (profile?.site_ids ?? []).includes(s.id))
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length
  const totalSpend = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)

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
  const previewTotal = previewRate && slotForm.hours ? previewRate * parseFloat(slotForm.hours) : null

  return (
    <div>
      {/* Hero */}
      <div className="portal-hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="ph-greeting">Welcome back, {profile?.name?.split(' ')[0] ?? 'there'} 👋</div>
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
            { label: 'Total Spend', value: `£${totalSpend.toLocaleString()}` },
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
            <div className="tbl-header cols-bookings">
              <span>Event</span><span>Date & Time</span><span>Venue</span><span>Type</span><span>Status</span><span>Total</span>
            </div>
            {bookings.length === 0 && (
              <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No bookings yet</div></div>
            )}
            {bookings.map(b => {
              const site = sites.find(s => s.id === b.site_id)
              return (
                <div key={b.id} className="tbl-row cols-bookings">
                  <div>
                    <div style={{ fontWeight: 600 }}>{b.event}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.name}</div>
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
                  <div style={{ fontWeight: 700 }}>£{b.total}</div>
                </div>
              )
            })}
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
                  <div style={{ fontWeight: 700 }}>£{sl.total}</div>
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
                <span style={{ fontWeight: 700 }}>£{inv.amount}</span>
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
                const customRate = (profile?.custom_rates as Record<string, number>)?.[s.id]
                return (
                  <div key={s.id} className="card" style={{ margin: 0, padding: 16 }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{s.emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{s.name}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Standard rate</span>
                        <span style={{ fontWeight: 600 }}>£{s.rate}/hr</span>
                      </div>
                      {customRate && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>Your rate</span>
                          <span style={{ fontWeight: 700, color: 'var(--accent-text)' }}>£{customRate}/hr</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Deposit</span>
                        <span style={{ fontWeight: 600 }}>£{s.deposit}</span>
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
              disabled={saving || !slotForm.site_id || !slotForm.date || !slotForm.start_time || !slotForm.end_time || !slotForm.hours || !slotForm.reason}
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
            <input className="form-input" type="time" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">End time</label>
            <input className="form-input" type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">Hours</label>
          <input className="form-input" type="number" min="0.5" step="0.5" value={slotForm.hours} onChange={e => setSlotForm(f => ({ ...f, hours: e.target.value }))} placeholder="e.g. 2" />
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
        {previewTotal !== null && (
          <div className="price-bar" style={{ marginTop: 8 }}>
            <div><div className="pi-label">Custom Rate</div><div className="pi-value">£{previewRate}/hr</div></div>
            <div><div className="pi-label">Hours</div><div className="pi-value">{slotForm.hours}</div></div>
            <div><div className="pi-label">No Deposit</div><div className="pi-value">—</div></div>
            <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>£{previewTotal}</div></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
