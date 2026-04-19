import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Site } from '../lib/database.types'
import { DEFAULT_AVAILABILITY, type WeekAvailability } from '../lib/database.types'
import { formatPence, poundsToPence } from '../lib/money'
import Modal from '../components/ui/Modal'

const EMOJI_OPTIONS = ['🏛️', '🎭', '🏫', '⛪', '🏢', '🎪', '🏟️', '🏗️', '🎵', '🌿']
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function getAvailability(site: Site): WeekAvailability {
  if (site.availability && typeof site.availability === 'object' && !Array.isArray(site.availability)) {
    return site.availability as unknown as WeekAvailability
  }
  return { ...DEFAULT_AVAILABILITY }
}

const DEFAULT_FORM = {
  name: '',
  address: '',
  capacity: 0,
  rate: 0,
  deposit: 0,
  emoji: '🏛️',
  min_hours: 1,
}

export default function Sites() {
  const navigate = useNavigate()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { fetchSites() }, [])

  async function fetchSites() {
    setLoading(true)
    const { data } = await supabase.from('sites').select('*')
    setSites(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setForm(DEFAULT_FORM)
    setSaveError('')
    setShowModal(true)
  }

  async function saveSite() {
    setSaving(true)
    setSaveError('')
    const payload = {
      ...form,
      availability: DEFAULT_AVAILABILITY as unknown as import('../lib/database.types').Json,
      amenities: [],
      description: null,
      photos: [],
    }
    const { data, error } = await supabase.from('sites').insert(payload).select().single()
    if (error) { setSaveError(error.message); setSaving(false); return }
    if (data) {
      setSites(prev => [...prev, data])
      setShowModal(false)
      navigate(`/${data.id}/site-settings`)
    }
    setSaving(false)
  }

  return (
    <div>
      {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}

      {!loading && (
        <div className="sites-grid">
          {sites.map(site => {
            const av = getAvailability(site)
            const openDays = DAYS.filter(d => av[d].open)
            return (
              <div key={site.id} className="site-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/${site.id}/site-settings`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>{site.emoji}</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); navigate(`/${site.id}/dashboard`) }}>
                    Open
                  </button>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{site.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{site.address}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
                  {[
                    { label: 'per hour', value: formatPence(site.rate) },
                    { label: 'deposit', value: formatPence(site.deposit) },
                    { label: 'capacity', value: String(site.capacity) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'var(--surface2)', borderRadius: 7, padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Open: {openDays.length === 7 ? 'Every day' : openDays.length === 0 ? 'Closed' : openDays.map(d => d.slice(0, 3).charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}
                  {site.min_hours && site.min_hours > 1 ? ` · Min. ${site.min_hours}hr` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--surface2)', padding: '3px 7px', borderRadius: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  /book/{toSlug(site.name)}
                </div>
              </div>
            )
          })}

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
        onClose={() => { setShowModal(false); setSaveError('') }}
        title="Add New Site"
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {saveError && <div className="notice notice-warn" style={{ fontSize: 11 }}>✗ {saveError}</div>}
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setSaveError('') }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSite} disabled={saving || !form.name}>
                {saving ? 'Creating…' : 'Create Site'}
              </button>
            </div>
          </div>
        }
      >
        {/* Emoji */}
        <div className="form-row" style={{ marginBottom: 12 }}>
          <label className="form-label">Emoji</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                style={{ width: 38, height: 38, fontSize: 18, borderRadius: 8, cursor: 'pointer',
                  border: `2px solid ${form.emoji === e ? 'var(--accent)' : 'var(--border)'}`,
                  background: form.emoji === e ? 'var(--accent-light)' : 'var(--surface2)' }}>
                {e}
              </button>
            ))}
          </div>
        </div>

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

        <div className="form-grid-3">
          <div>
            <label className="form-label">Capacity</label>
            <input className="form-input" type="number" min="1" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="form-label">Rate (£/hr)</label>
            <input className="form-input" type="number" min="0" step="0.01" value={form.rate / 100} onChange={e => setForm(f => ({ ...f, rate: poundsToPence(Number(e.target.value)) }))} />
          </div>
          <div>
            <label className="form-label">Deposit (£)</label>
            <input className="form-input" type="number" min="0" step="0.01" value={form.deposit / 100} onChange={e => setForm(f => ({ ...f, deposit: poundsToPence(Number(e.target.value)) }))} />
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 12 }}>
          <label className="form-label">Minimum booking duration (hours)</label>
          <input className="form-input" type="number" min="0.5" step="0.5" value={form.min_hours}
            onChange={e => setForm(f => ({ ...f, min_hours: Number(e.target.value) }))}
            style={{ maxWidth: 120 }} />
        </div>

        <div className="notice notice-accent" style={{ marginTop: 16, fontSize: 12 }}>
          After creating the site, you can configure availability, integrations, and photos in Site Settings.
        </div>
      </Modal>
    </div>
  )
}
