import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Site } from '../lib/database.types'
import Modal from '../components/ui/Modal'

const EMOJI_OPTIONS = ['🏛️', '🎭', '🏫', '⛪', '🏢', '🎪', '🏟️', '🏗️', '🎵', '🌿']

const DEFAULT_FORM = {
  name: '',
  address: '',
  capacity: 0,
  rate: 0,
  deposit: 0,
  emoji: '🏛️',
}

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    setForm({ name: site.name, address: site.address, capacity: site.capacity, rate: site.rate, deposit: site.deposit, emoji: site.emoji })
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
    if (!editing) return
    setSaving(true)
    await supabase.from('sites').delete().eq('id', editing.id)
    setSites(prev => prev.filter(s => s.id !== editing.id))
    setShowModal(false)
    setConfirmDelete(false)
    setSaving(false)
  }

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
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{site.address}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
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
            </div>
          ))}

          {/* Add site card */}
          <button
            className="site-card"
            style={{ border: '2px dashed var(--border)', background: 'transparent', boxShadow: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 160, color: 'var(--text-muted)' }}
            onClick={openAdd}
          >
            <span style={{ fontSize: 24 }}>+</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Add new site</span>
          </button>
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit ${editing.name}` : 'Add New Site'}
        footer={
          confirmDelete ? (
            <div style={{ display: 'flex', gap: 7, width: '100%', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>Delete this site? This cannot be undone.</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={deleteSite} disabled={saving}>
                {saving ? 'Deleting…' : 'Yes, delete'}
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
        <div className="form-grid-2">
          <div>
            <label className="form-label">Site name</label>
            <input className="form-input" placeholder="e.g. The Grand Hall" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Address</label>
            <input className="form-input" placeholder="123 Example St, City" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
        </div>
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
      </Modal>
    </div>
  )
}
