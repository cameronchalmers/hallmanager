import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSite } from '../context/SiteContext'
import type { SiteCredentials } from '../lib/database.types'
import { DEFAULT_AVAILABILITY, type WeekAvailability } from '../lib/database.types'
import { poundsToPence } from '../lib/money'

const EMOJI_OPTIONS = ['🏛️', '🎭', '🏫', '⛪', '🏢', '🎪', '🏟️', '🏗️', '🎵', '🌿']
const AMENITY_OPTIONS = ['WiFi', 'Parking', 'Kitchen', 'Toilets', 'Disabled Access', 'PA System', 'Stage', 'Projector & Screen', 'Tables & Chairs', 'Outdoor Space', 'Bar', 'Air Conditioning', 'Changing Rooms', 'CCTV']
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function getAvailability(av: unknown): WeekAvailability {
  if (av && typeof av === 'object' && !Array.isArray(av)) return av as WeekAvailability
  return { ...DEFAULT_AVAILABILITY }
}

const EMPTY_CREDS: Omit<SiteCredentials, 'site_id' | 'updated_at'> = {
  stripe_secret_key: null, stripe_publishable_key: null,
  qf_account_num: null, qf_app_id: null, qf_api_key: null,
}

type Section = 'venue' | 'integrations' | 'booking-link'

export default function SiteSettings() {
  const { currentSite, setCurrentSite } = useSite()
  const [form, setForm] = useState({ name: '', address: '', capacity: 0, rate: 0, deposit: 0, emoji: '🏛️', min_hours: 1 })
  const [availability, setAvailability] = useState<WeekAvailability>({ ...DEFAULT_AVAILABILITY })
  const [amenities, setAmenities] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [creds, setCreds] = useState<Omit<SiteCredentials, 'site_id' | 'updated_at'>>(EMPTY_CREDS)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('venue')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!currentSite) return
    setForm({
      name: currentSite.name,
      address: currentSite.address,
      capacity: currentSite.capacity,
      rate: currentSite.rate,
      deposit: currentSite.deposit,
      emoji: currentSite.emoji,
      min_hours: currentSite.min_hours ?? 1,
    })
    setAvailability(getAvailability(currentSite.availability))
    setAmenities(currentSite.amenities ?? [])
    setDescription(currentSite.description ?? '')
    setPhotos(currentSite.photos ?? [])
    setWhatsappNumber(currentSite.whatsapp_number ?? '')
    setGoogleReviewUrl(currentSite.google_review_url ?? '')
    setCreds(EMPTY_CREDS)
    supabase.from('site_credentials').select('*').eq('site_id', currentSite.id).single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => {
        if (data) setCreds({
          stripe_secret_key: data.stripe_secret_key ?? null,
          stripe_publishable_key: data.stripe_publishable_key ?? null,
          qf_account_num: data.qf_account_num ?? null,
          qf_app_id: data.qf_app_id ?? null,
          qf_api_key: data.qf_api_key ?? null,
        })
      })
  }, [currentSite?.id])

  async function save() {
    if (!currentSite) return
    setSaving(true)
    setSaveError('')
    setSaved(false)
    const payload = {
      ...form,
      availability: availability as unknown as import('../lib/database.types').Json,
      amenities,
      description: description || null,
      photos,
      whatsapp_number: whatsappNumber || null,
      google_review_url: googleReviewUrl || null,
    }
    const { error } = await supabase.from('sites').update(payload).eq('id', currentSite.id)
    if (error) { setSaveError(error.message); setSaving(false); return }
    if (Object.values(creds).some(v => v)) {
      await supabase.from('site_credentials').upsert({ site_id: currentSite.id, ...creds, updated_at: new Date().toISOString() })
    }
    setCurrentSite({ ...currentSite, ...payload })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentSite) return
    if (file.size > 5 * 1024 * 1024) { setSaveError('Photo must be under 5MB'); e.target.value = ''; return }
    setUploadingPhoto(true)
    const path = `${currentSite.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
    const { error } = await supabase.storage.from('venue-photos').upload(path, file)
    if (error) { setSaveError(`Photo upload failed: ${error.message}`); setUploadingPhoto(false); return }
    const { data: { publicUrl } } = supabase.storage.from('venue-photos').getPublicUrl(path)
    setPhotos(prev => [...prev, publicUrl])
    setUploadingPhoto(false)
    e.target.value = ''
  }

  function toggleAmenity(a: string) {
    setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])
  }

  function setDay(day: typeof DAYS[number], key: keyof WeekAvailability[typeof DAYS[number]], value: string | boolean) {
    setAvailability(prev => ({ ...prev, [day]: { ...prev[day], [key]: value } }))
  }

  const bookingUrl = currentSite ? `${window.location.origin}/book/${toSlug(form.name || currentSite.name)}` : ''
  const calendarUrl = currentSite ? `${window.location.origin}/availability/${toSlug(form.name || currentSite.name)}` : ''

  if (!currentSite) return null

  const tabs: { id: Section; label: string }[] = [
    { id: 'venue', label: 'Venue Details' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'booking-link', label: 'Booking Link' },
  ]

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, background: 'var(--surface2)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveSection(t.id)}
            style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeSection === t.id ? 'var(--surface)' : 'transparent', color: activeSection === t.id ? 'var(--text)' : 'var(--text-muted)', boxShadow: activeSection === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Venue Details ─────────────────────────────────────────────────────── */}
      {activeSection === 'venue' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* Left column — main fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="card">
              <div className="card-header"><span className="card-title">Basic Info</span></div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
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
                    <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Address</label>
                    <input className="form-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
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
                <div>
                  <label className="form-label">Minimum booking duration (hours)</label>
                  <input className="form-input" type="number" min="0.5" step="0.5" value={form.min_hours}
                    onChange={e => setForm(f => ({ ...f, min_hours: Number(e.target.value) }))}
                    style={{ maxWidth: 120 }} />
                </div>
                <div>
                  <label className="form-label">Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(shown on booking page)</span></label>
                  <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={description} onChange={e => setDescription(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Amenities</span></div>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AMENITY_OPTIONS.map(a => (
                    <button key={a} onClick={() => toggleAmenity(a)} style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${amenities.includes(a) ? 'var(--accent)' : 'var(--border)'}`, background: amenities.includes(a) ? 'var(--accent-light)' : 'var(--surface2)', color: amenities.includes(a) ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Photos</span></div>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {photos.map(url => (
                    <div key={url} style={{ position: 'relative', width: 90, height: 70 }}>
                      <img src={url} alt="" style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <button onClick={() => setPhotos(prev => prev.filter(p => p !== url))} style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: '#000000aa', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
                    </div>
                  ))}
                  <label style={{ width: 90, height: 70, borderRadius: 8, border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploadingPhoto ? 'wait' : 'pointer', color: 'var(--text-muted)', fontSize: 11, gap: 3 }}>
                    {uploadingPhoto ? '⏳' : <>＋<span>Add photo</span></>}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadPhoto} disabled={uploadingPhoto} />
                  </label>
                </div>
              </div>
            </div>

          </div>

          {/* Right column — availability */}
          <div className="card" style={{ position: 'sticky', top: 16 }}>
            <div className="card-header"><span className="card-title">Availability</span></div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 44px 1fr 1fr', background: 'var(--surface2)', padding: '7px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                <span>Day</span><span>Open</span><span>From</span><span>To</span>
              </div>
              {DAYS.map((day, i) => {
                const sched = availability[day]
                return (
                  <div key={day} style={{ display: 'grid', gridTemplateColumns: '90px 44px 1fr 1fr', alignItems: 'center', padding: '8px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: sched.open ? 'var(--surface)' : 'var(--surface2)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{day.slice(0,3)}</span>
                    <div>
                      <button className="toggle" style={{ background: sched.open ? 'var(--accent)' : '#d1d5db' }} onClick={() => setDay(day, 'open', !sched.open)}>
                        <span className="toggle-thumb" style={{ left: sched.open ? 18 : 3 }} />
                      </button>
                    </div>
                    {sched.open ? (
                      <>
                        <input className="form-input" type="time" value={sched.from} onChange={e => setDay(day, 'from', e.target.value)} style={{ margin: '0 4px 0 0', padding: '4px 6px', fontSize: 11 }} />
                        <input className="form-input" type="time" value={sched.until} onChange={e => setDay(day, 'until', e.target.value)} style={{ padding: '4px 6px', fontSize: 11 }} />
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', gridColumn: '3 / 5' }}>Closed</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {/* ── Integrations ──────────────────────────────────────────────────────── */}
      {activeSection === 'integrations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Contact & Reviews</span>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">WhatsApp number</label>
                <input className="form-input" placeholder="e.g. 447466214530" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Used in email footers so bookers can reach you. Include country code, no + or spaces.</div>
              </div>
              <div>
                <label className="form-label">Google Review URL</label>
                <input className="form-input" placeholder="https://g.page/r/..." value={googleReviewUrl} onChange={e => setGoogleReviewUrl(e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Included in post-booking review request emails.</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Stripe</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Payment processing</span>
            </div>
            <div style={{ padding: '14px 18px 6px' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                Leave blank to use the global Stripe account from environment variables.
              </p>
            </div>
            <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">Secret key</label>
                <input className="form-input" type="password" placeholder={creds.stripe_secret_key ? '••••••••' : 'sk_live_...'} value={creds.stripe_secret_key ?? ''} onChange={e => setCreds(c => ({ ...c, stripe_secret_key: e.target.value || null }))} autoComplete="new-password" />
              </div>
              <div>
                <label className="form-label">Publishable key</label>
                <input className="form-input" placeholder={creds.stripe_publishable_key ? '••••••••' : 'pk_live_...'} value={creds.stripe_publishable_key ?? ''} onChange={e => setCreds(c => ({ ...c, stripe_publishable_key: e.target.value || null }))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">QuickFile</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Invoicing & accounts</span>
            </div>
            <div style={{ padding: '14px 18px 6px' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                Leave blank to use the global QuickFile account from environment variables.
              </p>
            </div>
            <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid-3">
                <div>
                  <label className="form-label">Account no.</label>
                  <input className="form-input" placeholder={creds.qf_account_num ? '••••••••' : '12345678'} value={creds.qf_account_num ?? ''} onChange={e => setCreds(c => ({ ...c, qf_account_num: e.target.value || null }))} />
                </div>
                <div>
                  <label className="form-label">App ID</label>
                  <input className="form-input" placeholder={creds.qf_app_id ? '••••••••' : 'app-id'} value={creds.qf_app_id ?? ''} onChange={e => setCreds(c => ({ ...c, qf_app_id: e.target.value || null }))} />
                </div>
                <div>
                  <label className="form-label">API key</label>
                  <input className="form-input" type="password" placeholder={creds.qf_api_key ? '••••••••' : 'api-key'} value={creds.qf_api_key ?? ''} onChange={e => setCreds(c => ({ ...c, qf_api_key: e.target.value || null }))} autoComplete="new-password" />
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── Booking Link ──────────────────────────────────────────────────────── */}
      {activeSection === 'booking-link' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Booking Request Form</span>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Share this link with customers so they can submit a booking request for {currentSite.name}.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-text)', wordBreak: 'break-all' }}>{bookingUrl}</span>
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}
                  onClick={() => { navigator.clipboard.writeText(bookingUrl); setCopied('booking'); setTimeout(() => setCopied(null), 2000) }}>
                  {copied === 'booking' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Public Availability Calendar</span>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                A public calendar showing which dates are available for booking at {currentSite.name}.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-text)', wordBreak: 'break-all' }}>{calendarUrl}</span>
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}
                  onClick={() => { navigator.clipboard.writeText(calendarUrl); setCopied('calendar'); setTimeout(() => setCopied(null), 2000) }}>
                  {copied === 'calendar' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Save bar */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        {saveError && <span style={{ fontSize: 12, color: 'var(--error, #ef4444)' }}>{saveError}</span>}
        {saved && <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Saved</span>}
        <button className="btn btn-primary" onClick={save} disabled={saving || !form.name} style={{ marginLeft: 'auto' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
