import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import type { ExtraSlot, Site } from '../lib/database.types'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

export default function ExtraSlots() {
  const [slots, setSlots] = useState<ExtraSlot[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<ExtraSlot | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [sRes, sitesRes] = await Promise.all([
      supabase.from('extra_slots').select('*').order('created_at', { ascending: false }),
      supabase.from('sites').select('*'),
    ])
    setSlots(sRes.data ?? [])
    setSites(sitesRes.data ?? [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: 'approved' | 'denied' | 'cancelled') {
    const { error } = await supabase.from('extra_slots').update({ status }).eq('id', id)
    if (error) { alert(`Failed to update status: ${error.message}`); return }
    setSlots(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
    if (status === 'approved') sendEmail('slot_approved', id)
    if (status === 'denied') sendEmail('slot_denied', id)
  }

  const FILTERS = ['all', 'pending', 'approved', 'denied', 'cancelled']
  const filtered = filter === 'all' ? slots : slots.filter(s => s.status === filter)

  return (
    <div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 16, alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button
            key={f}
            className="btn btn-ghost btn-sm"
            style={filter === f ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({f === 'all' ? slots.length : slots.filter(s => s.status === f).length})
          </button>
        ))}
      </div>

      <div className="notice notice-accent" style={{ marginBottom: 16 }}>
        <span>📅</span>
        Extra slot requests are one-off additional bookings from regular bookers. Their negotiated custom rate applies automatically — no deposit required.
      </div>

      <div className="card">
        <div className="tbl-header cols-slots">
          <span>Booker</span><span>Venue</span><span>Date & Time</span><span>Hours</span><span>Status</span><span>Actions</span>
        </div>
        {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}
        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📅</div>
            <div className="empty-title">No extra slot requests</div>
          </div>
        )}
        {filtered.map(sl => {
          const site = sites.find(s => s.id === sl.site_id)
          return (
            <div key={sl.id} className="tbl-row cols-slots" onClick={() => setSelected(sl)}>
              <div>
                <div style={{ fontWeight: 600 }}>{sl.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sl.reason.slice(0, 45)}{sl.reason.length > 45 ? '…' : ''}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{site?.name}</div>
              <div>
                <div>{format(new Date(sl.date), 'dd MMM yyyy')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sl.start_time}–{sl.end_time}</div>
              </div>
              <div style={{ fontWeight: 600 }}>{sl.hours}h · £{sl.total}</div>
              <div><Badge status={sl.status} /></div>
              <div className="approve-deny" onClick={e => e.stopPropagation()}>
                {sl.status === 'pending' ? (
                  <>
                    <button className="icon-btn icon-btn-approve" onClick={() => updateStatus(sl.id, 'approved')}>✓</button>
                    <button className="icon-btn icon-btn-deny" onClick={() => updateStatus(sl.id, 'denied')}>✗</button>
                  </>
                ) : sl.status === 'approved' ? (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }} onClick={() => updateStatus(sl.id, 'cancelled')}>Cancel</button>
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
        title="Extra Slot Request"
        sub={selected ? `from ${selected.name}` : ''}
        footer={
          selected?.status === 'pending' ? (
            <div style={{ display: 'flex', gap: 7, width: '100%' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { updateStatus(selected.id, 'denied'); setSelected(null) }}>✗ Deny</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { updateStatus(selected.id, 'approved'); setSelected(null) }}>✓ Approve & Notify</button>
            </div>
          ) : selected?.status === 'approved' ? (
            <div style={{ display: 'flex', gap: 7, width: '100%' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { updateStatus(selected.id, 'cancelled'); setSelected(null) }}>Cancel Slot</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setSelected(null)}>Close</button>
            </div>
          ) : (
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
          )
        }
      >
        {selected && (() => {
          const site = sites.find(s => s.id === selected.site_id)
          return (
            <>
              <div className="notice notice-accent" style={{ marginBottom: 12 }}>
                <span>{site?.emoji}</span>
                <div><strong>{site?.name}</strong><div style={{ fontSize: 11, marginTop: 1 }}>{site?.address}</div></div>
              </div>
              <div className="notice notice-info" style={{ marginBottom: 12 }}>
                ℹ️ This is a one-off extra slot for a regular booker. Their custom rate of <strong>£{selected.rate}/hr</strong> applies automatically.
              </div>
              <div className="detail-grid">
                <div><div className="detail-label">Booker</div><div className="detail-value">{selected.name}</div></div>
                <div><div className="detail-label">Status</div><div className="detail-value"><Badge status={selected.status} /></div></div>
                <div><div className="detail-label">Date</div><div className="detail-value">{format(new Date(selected.date), 'dd MMM yyyy')}</div></div>
                <div><div className="detail-label">Time</div><div className="detail-value">{selected.start_time}–{selected.end_time} ({selected.hours}h)</div></div>
              </div>
              <div style={{ background: '#fafafa', borderRadius: 7, padding: '9px 12px', fontSize: 12, marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Reason for extra slot</div>
                {selected.reason}
              </div>
              <div className="price-bar">
                <div><div className="pi-label">Custom Rate</div><div className="pi-value">£{selected.rate}/hr</div></div>
                <div><div className="pi-label">Hours</div><div className="pi-value">{selected.hours}</div></div>
                <div><div className="pi-label">No Deposit</div><div className="pi-value">—</div></div>
                <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>£{selected.total}</div></div>
              </div>
            </>
          )
        })()}
      </Modal>
    </div>
  )
}
