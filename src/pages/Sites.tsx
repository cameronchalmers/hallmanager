import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Site } from '../lib/database.types'
import { DEFAULT_AVAILABILITY, type WeekAvailability } from '../lib/database.types'
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
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [availability, setAvailability] = useState<WeekAvailability>({ ...DEFAULT_AVAILABILITY })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [copied, setCopied] = useState<string | null>(null) // stores slug, not id

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
    setAvailability({ ...DEFAULT_AVAILABILITY })
    setConfirmDelete(false)
    setSaveError('')
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
    })
    setAvailability(getAvailability(site))
    setConfirmDelete(false)
    setSaveError('')
    setShowModal(true)
  }

  async function saveSite() {
    setSaving(true)
    setSaveError('')
    // Cast WeekAvailability to Json for the Supabase client
    const payload = { ...form, availability: availability as unknown as import('../lib/database.types').Json }
    if (editing) {
      const { error } = await supabase.from('sites').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      setSites(prev => prev.map(s => s.id === editing.id ? { ...s, ...payload } : s))
    } else {
      const { data, error } = await supabase.from('sites').insert(payload).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) setSites(prev => [...prev, data])
    }
    setShowModal(false)
    setSaving(false)
  }

  async function deleteSite() {
    const siteId = editing?.id
    if (!siteId) return
    setSaving(true)
    setDeleteError('')
    const { error } = await supabase.from('sites').delete().eq('id', siteId)
    if (error) {
      setDeleteError(error.message)
    } else {
      setSites(prev => prev.filter(s => s.id !== siteId))
      setShowModal(false)
      setConfirmDelete(false)
    }
    setSaving(false)
  }

  function setDay(day: typeof DAYS[number], key: keyof WeekAvailability[typeof DAYS[number]], value: string | boolean) {
    setAvailability(prev => ({ ...prev, [day]: { ...prev[day], [key]: value } }))
  }

  function copyLink(site: Site) {
    const slug = toSlug(site.name)
    navigator.clipboard.writeText(`${window.location.origin}/book/${slug}`)
    setCopied(slug)
    setTimeout(() => setCopied(null), 2000)
  }

  const bookingUrl = editing ? `${window.location.origin}/book/${toSlug(form.name || editing.name)}` : ''

  return (
    <div>
      {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}

      {!loading && (
        <div className="sites-grid">
          {sites.map(site => {
            const av = getAvailability(site)
            const openDays = DAYS.filter(d => av[d].open)
            return (
              <div key={site.id} className="site-card" onClick={() => openEdit(site)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>{site.emoji}</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); openEdit(site) }}>Edit</button>
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Open: {openDays.length === 7 ? 'Every day' : openDays.length === 0 ? 'Closed' : openDays.map(d => d.slice(0, 3).charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}
                  {site.min_hours && site.min_hours > 1 ? ` · Min. ${site.min_hours}hr` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--surface2)', padding: '3px 7px', borderRadius: 5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    /book/{toSlug(site.name)}
                  </span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 10, flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); copyLink(site) }}>
                    {copied === toSlug(site.name) ? '✓ Copied' : 'Copy link'}
                  </button>
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
        onClose={() => { setShowModal(false); setConfirmDelete(false) }}
        title={editing ? `Edit ${editing.name}` : 'Add New Site'}
        wide
        footer={
          confirmDelete ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {deleteError && (
                <div className="notice notice-warn" style={{ fontSize: 11 }}>
                  ✗ {deleteError} — you may need to run the DELETE policy SQL in Supabase first.
                </div>
              )}
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>This cannot be undone.</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setConfirmDelete(false); setDeleteError('') }}>Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={deleteSite} disabled={saving}>
                  {saving ? 'Deleting…' : 'Yes, delete site'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {saveError && (
                <div className="notice notice-warn" style={{ fontSize: 11 }}>
                  ✗ {saveError} — you may need to run the SQL migrations in Supabase first.
                </div>
              )}
              <div style={{ display: 'flex', gap: 7 }}>
                {editing && <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete site</button>}
                <button className="btn btn-ghost" onClick={() => { setShowModal(false); setConfirmDelete(false); setSaveError('') }}>Cancel</button>
                <button className="btn btn-primary" onClick={saveSite} disabled={saving || !form.name}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Site'}
                </button>
              </div>
            </div>
          )
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

        {/* Min hours */}
        <div className="form-row">
          <label className="form-label">Minimum booking duration (hours)</label>
          <input className="form-input" type="number" min="0.5" step="0.5" value={form.min_hours}
            onChange={e => setForm(f => ({ ...f, min_hours: Number(e.target.value) }))}
            style={{ maxWidth: 120 }} />
        </div>

        {/* Per-day availability */}
        <div className="sec-label" style={{ marginBottom: 8 }}>Availability by Day</div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '110px 60px 1fr 1fr', gap: 0, background: 'var(--surface2)', padding: '7px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
            <span>Day</span><span>Open</span><span>From</span><span>Until</span>
          </div>
          {DAYS.map((day, i) => {
            const sched = availability[day]
            return (
              <div key={day} style={{ display: 'grid', gridTemplateColumns: '110px 60px 1fr 1fr', gap: 0, alignItems: 'center', padding: '8px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: sched.open ? 'var(--surface)' : 'var(--surface2)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{day}</span>
                <div>
                  <button
                    className="toggle"
                    style={{ background: sched.open ? 'var(--accent)' : '#d1d5db' }}
                    onClick={() => setDay(day, 'open', !sched.open)}
                  >
                    <span className="toggle-thumb" style={{ left: sched.open ? 18 : 3 }} />
                  </button>
                </div>
                {sched.open ? (
                  <>
                    <input className="form-input" type="time" value={sched.from}
                      onChange={e => setDay(day, 'from', e.target.value)}
                      style={{ margin: '0 8px 0 0', padding: '5px 8px', fontSize: 12 }} />
                    <input className="form-input" type="time" value={sched.until}
                      onChange={e => setDay(day, 'until', e.target.value)}
                      style={{ padding: '5px 8px', fontSize: 12 }} />
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', gridColumn: '3 / 5' }}>Closed</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Booking link */}
        {editing && (
          <>
            <div className="sec-label" style={{ marginBottom: 8 }}>Public Booking Link</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
              <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-text)', wordBreak: 'break-all' }}>{bookingUrl}</span>
              <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}
                onClick={() => { navigator.clipboard.writeText(bookingUrl); setCopied(toSlug(form.name || editing.name)); setTimeout(() => setCopied(null), 2000) }}>
                {copied === toSlug(form.name || editing.name) ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
