import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Site } from '../lib/database.types'
import Modal from '../components/ui/Modal'

const EMOJI_OPTIONS = ['🏛️', '🎭', '🏫', '⛪', '🏢', '🎪', '🏟️', '🏗️', '🎵', '🌿']

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const DEFAULT_FORM = {
  name: '',
  address: '',
  capacity: 0,
  rate: 0,
  deposit: 0,
  emoji: '🏛️',
  min_hours: 1,
  available_from: '09:00',
  available_until: '22:00',
}

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => { fetchSites() }, [])

  async function fetchSites() {
    setLoading(true)
    const { data } = await supabase.from('sites').select('*')
    setSites(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setConfirmDelete(false)
    setShowModal(true)
  }

  function openEdit(site: Site) {
    setEditing(site)
    setForm({
      name: site.name,
      address: site.address,
      capacity: site.capacity,
      rate: site.rate,
      deposit: site.deposit,
      emoji: site.emoji,
      min_hours: site.min_hours ?? 1,
      available_from: site.available_from ?? '09:00',
      available_until: site.available_until ?? '22:00',
    })
    setConfirmDelete(false)
    setShowModal(true)
  }

  async function saveSite() {
    setSaving(true)
    if (editing) {
      await supabase.from('sites').update(form).eq('id', editing.id)
      setSites(prev => prev.map(s => s.id === editing.id ? { ...s, ...form } : s))
    } else {
      const { data } = await supabase.from('sites').insert(form).select().single()
      if (data) setSites(prev => [...prev, data])
    }
    setShowModal(false)
    setSaving(false)
  }

  async function deleteSite() {
    // Capture the ID immediately — don't rely on `editing` in the async callback
    const siteId = editing?.id
    if (!siteId) return
    setSaving(true)
    const { error } = await supabase.from('sites').delete().eq('id', siteId)
    if (!error) {
      setSites(prev => prev.filter(s => s.id !== siteId))
      setShowModal(false)
      setConfirmDelete(false)
    }
    setSaving(false)
  }

  function copyLink(site: Site) {
    const url = `${window.location.origin}/book/${toSlug(site.name)}`
    navigator.clipboard.writeText(url)
    setCopied(site.id)
    setTimeout(() => setCopied(null), 2000)
  }

  const bookingUrl = editing ? `${window.location.origin}/book/${toSlug(editing.name || form.name)}` : ''

  return (
    <div>
      {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}

      {!loading && (
        <div className="sites-grid">
          {sites.map(site => (
            <div key={site.id} className="site-card" onClick={() => openEdit(site)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: 28 }}>{site.emoji}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={e => { e.stopPropagation(); openEdit(site) }}
                >
                  Edit
                </button>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{site.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{site.address}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
                {[
                  { label: 'per hour', value: `£${site.rate}` },
                  { label: 'deposit', value: `£${site.deposit}` },
                  { label: 'capacity', value: String(site.capacity) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--surface2)', borderRadius: 7, padding: '8px 6px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
              {/* Booking link */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--surface2)', padding: '3px 7px', borderRadius: 5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  /book/{toSlug(site.name)}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 8px', fontSize: 10, flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); copyLink(site) }}
                >
                  {copied === site.id ? '✓ Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          ))}

          {/* Add site card */}
          <button
            className="site-card"
            style={{ border: '2px dashed var(--border)', background: 'transparent', boxShadow: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 180, color: 'var(--text-muted)' }}
            onClick={openAdd}
          >
            <span style={{ fontSize: 24 }}>+</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Add new site</span>
          </button>
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setConfirmDelete(false) }}
        title={editing ? `Edit ${editing.name}` : 'Add New Site'}
        wide
        footer={
          confirmDelete ? (
            <div style={{ display: 'flex', gap: 7, width: '100%', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>This cannot be undone.</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={deleteSite} disabled={saving}>
                {saving ? 'Deleting…' : 'Yes, delete site'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 7, width: '100%' }}>
              {editing && (
                <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
                  Delete site
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setConfirmDelete(false) }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSite} disabled={saving || !form.name}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Site'}
              </button>
            </div>
          )
        }
      >
        {/* Emoji */}
        <div className="form-row" style={{ marginBottom: 12 }}>
          <label className="form-label">Emoji</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {EMOJI_OPTIONS.map(e => (
              <button
                key={e}
                onClick={() => setForm(f => ({ ...f, emoji: e }))}
                style={{
                  width: 38, height: 38, fontSize: 18, borderRadius: 8,
                  border: `2px solid ${form.emoji === e ? 'var(--accent)' : 'var(--border)'}`,
                  background: form.emoji === e ? 'var(--accent-light)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Name & address */}
        <div className="form-grid-2">
          <div>
            <label className="form-label">Site name</label>
            <input className="form-input" placeholder="e.g. Wingrove Hall" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Address</label>
            <input className="form-input" placeholder="123 Example St, City" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
        </div>

        {/* Rate / deposit / capacity */}
        <div className="form-grid-3">
          <div>
            <label className="form-label">Capacity</label>
            <input className="form-input" type="number" min="1" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="form-label">Rate (£/hr)</label>
            <input className="form-input" type="number" min="0" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="form-label">Deposit (£)</label>
            <input className="form-input" type="number" min="0" value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: Number(e.target.value) }))} />
          </div>
        </div>

        {/* Hiring policy */}
        <div className="sec-label" style={{ marginBottom: 8, marginTop: 4 }}>Hiring Policy</div>
        <div className="form-grid-3">
          <div>
            <label className="form-label">Min. booking (hrs)</label>
            <input
              className="form-input"
              type="number"
              min="0.5"
              step="0.5"
              value={form.min_hours}
              onChange={e => setForm(f => ({ ...f, min_hours: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="form-label">Available from</label>
            <input
              className="form-input"
              type="time"
              value={form.available_from}
              onChange={e => setForm(f => ({ ...f, available_from: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">Available until</label>
            <input
              className="form-input"
              type="time"
              value={form.available_until}
              onChange={e => setForm(f => ({ ...f, available_until: e.target.value }))}
            />
          </div>
        </div>

        {/* Booking link */}
        {editing && (
          <>
            <div className="sec-label" style={{ marginBottom: 8, marginTop: 4 }}>Public Booking Link</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
              <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-text)', wordBreak: 'break-all' }}>
                {bookingUrl}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ flexShrink: 0 }}
                onClick={() => { navigator.clipboard.writeText(bookingUrl); setCopied(editing.id); setTimeout(() => setCopied(null), 2000) }}
              >
                {copied === editing.id ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
