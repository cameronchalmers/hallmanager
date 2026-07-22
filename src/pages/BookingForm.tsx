import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useForceLightMode } from '../hooks/useForceLightMode'
import type { Site, WeekAvailability } from '../lib/database.types'
import { getRatePackages, getCustomQuestions, type RatePackage } from '../lib/database.types'
import { formatPence } from '../lib/money'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

interface SlotBooking {
  date: string
  end_date: string | null
  start_time: string
  end_time: string
  type: string
  recurrence: string | null
  cancelled_sessions: string[] | null
  recurrence_days: number[] | null
}

function toDs(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return toDs(d)
}

function getBookingsOnDate(bookings: SlotBooking[], dateStr: string): SlotBooking[] {
  if (!dateStr) return []
  const targetDow = (new Date(dateStr + 'T12:00:00').getDay() + 6) % 7
  return bookings.filter(b => {
    const cancelled = new Set(b.cancelled_sessions ?? [])
    if (cancelled.has(dateStr)) return false
    // One-off bookings can span multiple days (package bookings with end_date)
    if (b.type !== 'recurring') return dateStr >= b.date && dateStr <= (b.end_date ?? b.date)
    if (dateStr < b.date) return false

    const isMultiDay = b.recurrence === 'Weekly' && b.recurrence_days && b.recurrence_days.length > 1
    const startDow = (new Date(b.date + 'T12:00:00').getDay() + 6) % 7
    const diffDays = Math.round((new Date(dateStr + 'T12:00:00').getTime() - new Date(b.date + 'T12:00:00').getTime()) / 86400000)

    if (b.recurrence === 'Weekly') {
      if (isMultiDay) return (b.recurrence_days as number[]).includes(targetDow) && diffDays % 7 === 0
      return startDow === targetDow && diffDays % 7 === 0
    }
    if (b.recurrence === 'Fortnightly') return startDow === targetDow && diffDays % 14 === 0
    if (b.recurrence === 'Monthly') {
      const s = new Date(b.date + 'T12:00:00'), t = new Date(dateStr + 'T12:00:00')
      return s.getDate() === t.getDate() && (t.getFullYear() * 12 + t.getMonth()) > (s.getFullYear() * 12 + s.getMonth())
    }
    return false
  })
}

function getSiteSchedule(site: Site, date: string): { open: boolean; from: string; until: string } | null {
  if (!site.availability || typeof site.availability !== 'object' || Array.isArray(site.availability)) return null
  const av = site.availability as unknown as WeekAvailability
  if (!date) return null
  const dayName = DAY_NAMES[new Date(date + 'T12:00:00').getDay()]
  return av[dayName] ?? null
}

const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const CAL_DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Inline month calendar for package/vehicle sites — booked days come from the
 *  same booking list used for the conflict warning; clicking a free day sets
 *  the (start) date. */
function AvailabilityCalendar({ bookings, blockedDates, selectedStart, spanDays, onSelect }: {
  bookings: SlotBooking[]
  blockedDates: string[]
  selectedStart: string
  spanDays: number
  onSelect: (ds: string) => void
}) {
  const today = new Date()
  const todayDs = toDs(today)
  const [cal, setCal] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const isCurrentMonth = cal.y === today.getFullYear() && cal.m === today.getMonth()

  const offset = (new Date(cal.y, cal.m, 1).getDay() + 6) % 7
  const totalDays = new Date(cal.y, cal.m + 1, 0).getDate()
  const selEnd = selectedStart ? addDays(selectedStart, Math.max(0, spanDays - 1)) : ''

  const navBtn: React.CSSProperties = {
    border: '1px solid var(--border,#e5e7eb)', background: 'var(--surface,#fff)', borderRadius: 7,
    width: 26, height: 26, cursor: 'pointer', fontSize: 14, color: 'var(--text-muted,#71717a)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ border: '1px solid var(--border,#e5e7eb)', borderRadius: 10, padding: '12px 12px 10px', background: 'var(--surface,#fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" style={{ ...navBtn, opacity: isCurrentMonth ? 0.35 : 1, cursor: isCurrentMonth ? 'default' : 'pointer' }} disabled={isCurrentMonth}
          onClick={() => setCal(c => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{CAL_MONTHS[cal.m]} {cal.y}</span>
        <button type="button" style={navBtn}
          onClick={() => setCal(c => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {CAL_DOW.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted,#9ca3af)', padding: '2px 0' }}>{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => <div key={`o${i}`} />)}
        {Array.from({ length: totalDays }).map((_, i) => {
          const ds = toDs(new Date(cal.y, cal.m, i + 1))
          const isPast = ds < todayDs
          const isBlocked = !isPast && blockedDates.includes(ds)
          const isBooked = !isPast && !isBlocked && getBookingsOnDate(bookings, ds).length > 0
          const inSel = selectedStart && ds >= selectedStart && ds <= selEnd
          const clickable = !isPast && !isBlocked && !isBooked
          let bg = 'var(--surface2,#f0fdf4)'
          let color = 'var(--text,#111827)'
          if (isPast) { bg = 'transparent'; color = '#d1d5db' }
          else if (isBlocked) { bg = '#f3f4f6'; color = '#c4c4c4' }
          else if (isBooked) { bg = '#fee2e2'; color = '#b91c1c' }
          else bg = '#f0fdf4'
          if (inSel) { bg = 'var(--accent,#7c3aed)'; color = '#fff' }
          return (
            <button
              key={ds}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(ds)}
              style={{
                aspectRatio: '1.15', minHeight: 30, border: 'none', borderRadius: 7, background: bg, color,
                fontSize: 12, fontWeight: inSel ? 700 : 500, cursor: clickable ? 'pointer' : 'default',
                fontFamily: 'inherit', padding: 0,
              }}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--text-muted,#71717a)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'inline-block' }} /> Available</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#fee2e2', border: '1px solid #fca5a5', display: 'inline-block' }} /> Booked</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--accent,#7c3aed)', display: 'inline-block' }} /> Your dates</span>
      </div>
    </div>
  )
}

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
  package_label: '',
}

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, '0')
  const m = ((i % 4) * 15).toString().padStart(2, '0')
  return `${h}:${m}`
})

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function calcHours(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

// Signed variant — a vehicle can be returned earlier in the day than it was
// picked up (e.g. pickup Fri 17:00, return Sun 09:00)
function calcHoursSigned(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em - sh * 60 - sm) / 60
}

function fmt(t: string) {
  return t.slice(0, 5)
}

export default function BookingForm() {
  useForceLightMode()
  const { slug } = useParams<{ slug?: string }>()
  const [searchParams] = useSearchParams()
  const [sites, setSites] = useState<Site[]>([])
  const [lockedSite, setLockedSite] = useState<Site | null>(null)
  const [form, setForm] = useState({ ...DEFAULT_FORM, date: searchParams.get('date') ?? '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [siteBookings, setSiteBookings] = useState<SlotBooking[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('sites').select('*').then(({ data }) => {
      const all = data ?? []
      setSites(all)
      if (slug) {
        const match = all.find(s => toSlug(s.name) === slug)
        if (match) {
          setLockedSite(match)
          setForm(f => ({ ...f, site_id: match.id }))
          fetchSiteBookings(match.id)
        } else {
          setNotFound(true)
        }
      }
    })
  }, [slug])

  async function fetchSiteBookings(siteId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_site_bookings', { p_site_id: siteId })
    setSiteBookings((data ?? []) as SlotBooking[])
  }

  const activeSite = lockedSite ?? sites.find(s => s.id === form.site_id)
  const isVehicle = activeSite?.site_type === 'vehicle'
  const isPackages = activeSite?.pricing_mode === 'packages' || isVehicle
  const packages = isPackages ? getRatePackages(activeSite) : []
  const selectedPackage: RatePackage | null = isPackages ? packages.find(p => p.label === form.package_label) ?? null : null
  const customQuestions = getCustomQuestions(activeSite)
  const hours = selectedPackage
    ? (isVehicle
        ? (Math.max(1, selectedPackage.days) - 1) * 24 + calcHoursSigned(selectedPackage.start_time, selectedPackage.end_time)
        : calcHours(selectedPackage.start_time, selectedPackage.end_time) * Math.max(1, selectedPackage.days))
    : calcHours(form.start_time, form.end_time)
  const deposit = selectedPackage ? (selectedPackage.deposit ?? activeSite?.deposit ?? 0) : (activeSite?.deposit ?? 0)
  const total = selectedPackage
    ? selectedPackage.price + deposit
    : activeSite ? Math.round(hours * activeSite.rate) + deposit : 0
  const packageEndDate = selectedPackage && selectedPackage.days > 1 && form.date
    ? addDays(form.date, selectedPackage.days - 1)
    : null

  function set(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeSite) { setError('Please choose a venue.'); return }

    if (isPackages) {
      if (!selectedPackage) { setError('Please choose a package.'); return }
    } else {
      if (hours <= 0) { setError('Please check your times — end must be after start.'); return }

      // Enforce site hiring policy (hourly sites only — package windows are fixed)
      if (activeSite.min_hours && hours < activeSite.min_hours) {
        setError(`Minimum booking at ${activeSite.name} is ${activeSite.min_hours} hour${activeSite.min_hours !== 1 ? 's' : ''}.`)
        return
      }
      const sched = getSiteSchedule(activeSite, form.date)
      if (sched) {
        if (!sched.open) {
          const dayName = DAY_NAMES[new Date(form.date + 'T12:00:00').getDay()]
          setError(`${activeSite.name} is closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s.`)
          return
        }
        if (form.start_time < sched.from) {
          setError(`${activeSite.name} doesn't open until ${sched.from} on this day.`)
          return
        }
        if (form.end_time > sched.until) {
          setError(`${activeSite.name} closes at ${sched.until} on this day.`)
          return
        }
      }
    }

    setSubmitting(true)
    setError('')
    // Generate the id client-side so we can reference the booking in the
    // confirmation email call (anon can't SELECT back its own insert)
    const bookingId = crypto.randomUUID()
    const { error: err } = await supabase.from('bookings').insert({
      id: bookingId,
      name: form.name,
      email: form.email,
      phone: form.phone,
      event: form.event,
      site_id: activeSite.id,
      date: form.date,
      start_time: selectedPackage ? selectedPackage.start_time : form.start_time,
      end_time: selectedPackage ? selectedPackage.end_time : form.end_time,
      end_date: packageEndDate,
      package_label: selectedPackage ? selectedPackage.label : null,
      hours,
      type: selectedPackage ? 'oneoff' : form.type,
      recurrence: !selectedPackage && form.type === 'recurring' ? form.recurrence : null,
      notes: form.notes || null,
      custom_answers: Object.values(answers).some(v => v) ? answers : null,
      status: 'pending',
      deposit,
      total,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    const { error: emailErr } = await supabase.functions.invoke('send-email', {
      body: { type: 'booking_submitted', id: bookingId },
    })
    if (emailErr) console.error('Email invoke error:', emailErr)
    setSubmitted(true)
    setSubmitting(false)
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg,#f4f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Figtree', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏛️</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: 'var(--text,#111)' }}>Venue not found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted,#71717a)' }}>This booking link doesn't match any venue.</div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg,#f4f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'Figtree', sans-serif" }}>
        <div style={{ background: 'var(--surface,#fff)', borderRadius: 16, padding: 40, maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text,#111)' }}>Request submitted!</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted,#71717a)', marginBottom: 24 }}>
            Thanks, {form.name.split(' ')[0]}. We'll review your booking and be in touch at <strong>{form.email}</strong> shortly.
          </div>
          <div style={{ background: 'var(--surface2,#f4f4f6)', borderRadius: 10, padding: '12px 16px', fontSize: 13, textAlign: 'left', marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text,#111)' }}>{form.event}</div>
            <div style={{ color: 'var(--text-muted,#71717a)' }}>
              {activeSite?.name} · {form.date}{packageEndDate ? ` – ${packageEndDate}` : ''} · {selectedPackage ? selectedPackage.label : `${form.start_time}–${form.end_time}`}
            </div>
            <div style={{ marginTop: 6, fontWeight: 700, color: 'var(--text,#111)' }}>Total: {formatPence(total)} <span style={{ fontWeight: 400, color: 'var(--text-muted,#71717a)' }}>(deposit: {formatPence(deposit)})</span></div>
          </div>
          <button
            style={{ background: 'var(--accent,#7c3aed)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            onClick={() => { setForm(f => ({ ...f, name: '', email: '', phone: '', event: '', date: '', start_time: '', end_time: '', notes: '', package_label: '' })); setAnswers({}); setSubmitted(false) }}
          >
            Submit another request
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg,#f4f4f6)', padding: '32px 16px', fontFamily: "'Figtree', sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div className={lockedSite ? 'booking-layout' : ''}>

          {/* Left: venue info (only when a specific site is locked) */}
          {lockedSite && (
            <div className="booking-layout-info">
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--accent,#7c3aed)', color: '#fff', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {lockedSite.emoji}
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{lockedSite.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted,#71717a)', marginTop: 3 }}>{lockedSite.address}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
                  {lockedSite.pricing_mode === 'packages' ? (
                    <span className="badge badge-accent">
                      {(() => { const ps = getRatePackages(lockedSite); return ps.length ? `from ${formatPence(Math.min(...ps.map(p => p.price)))}` : 'Package pricing' })()}
                    </span>
                  ) : (
                    <span className="badge badge-accent">{formatPence(lockedSite.rate)}/hr</span>
                  )}
                  <span className="badge badge-neutral">{formatPence(lockedSite.deposit)} deposit</span>
                  <span className="badge badge-neutral">{lockedSite.site_type === 'vehicle' ? `${lockedSite.capacity} seats` : `Up to ${lockedSite.capacity} guests`}</span>
                  {lockedSite.pricing_mode !== 'packages' && lockedSite.min_hours && <span className="badge badge-neutral">Min. {lockedSite.min_hours}hr booking</span>}
                </div>

                {lockedSite.photos && lockedSite.photos.length > 0 && (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: '#000' }}>
                    <img
                      src={lockedSite.photos[photoIndex]}
                      alt=""
                      style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block', transition: 'opacity 0.2s' }}
                    />
                    {lockedSite.photos.length > 1 && (
                      <>
                        <button
                          onClick={() => setPhotoIndex(i => (i - 1 + lockedSite.photos!.length) % lockedSite.photos!.length)}
                          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >‹</button>
                        <button
                          onClick={() => setPhotoIndex(i => (i + 1) % lockedSite.photos!.length)}
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >›</button>
                        <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
                          {lockedSite.photos.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setPhotoIndex(i)}
                              style={{ width: i === photoIndex ? 18 : 6, height: 6, borderRadius: 99, background: i === photoIndex ? '#fff' : 'rgba(255,255,255,0.5)', border: 'none', cursor: 'pointer', padding: 0, transition: 'width 0.2s' }}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <a
                  href={`/availability/${toSlug(lockedSite.name)}`}
                  style={{ display: 'block', width: '100%', background: 'var(--surface2,#f4f4f6)', color: 'var(--text,#18181b)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 10, padding: '13px', fontWeight: 700, fontSize: 14, textAlign: 'center', textDecoration: 'none', marginBottom: 16, boxSizing: 'border-box' }}
                >
                  📅 View availability calendar
                </a>

                {lockedSite.description && (
                  <p style={{ fontSize: 14, color: 'var(--text-muted,#71717a)', marginTop: 0, marginBottom: 16, lineHeight: 1.7 }}>{lockedSite.description}</p>
                )}

                {lockedSite.amenities && lockedSite.amenities.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted,#71717a)', marginBottom: 8 }}>Amenities</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {lockedSite.amenities.map(a => (
                        <span key={a} style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 99, background: 'var(--surface2,#f4f4f6)', color: 'var(--text-muted,#71717a)', border: '1px solid var(--border,#e5e7eb)' }}>{a}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Right: form (or full-width when no locked site) */}
          <div>
            {/* Header — only shown on single-column (no locked site) */}
            {!lockedSite && (
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent,#7c3aed)', color: '#fff', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  H
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Request a Booking</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted,#71717a)', marginTop: 4 }}>Fill in the details below and we'll be in touch to confirm</div>
                <a href="/availability" style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--accent,#7c3aed)', fontWeight: 600, textDecoration: 'none' }}>📅 View availability calendar →</a>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Venue selector — only shown when no slug */}
              {!lockedSite && (
                <div className="card" style={{ marginBottom: 14, padding: '18px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted,#71717a)', marginBottom: 10 }}>Venue</div>
                  <div className="form-row">
                    <label className="form-label">Select a venue</label>
                    <select className="form-input" required value={form.site_id} onChange={e => { set('site_id', e.target.value); if (e.target.value) fetchSiteBookings(e.target.value) }}>
                      <option value="">Choose a venue…</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                    </select>
                  </div>
                  {activeSite && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      {isPackages ? (
                        <span className="badge badge-accent">
                          {packages.length ? `from ${formatPence(Math.min(...packages.map(p => p.price)))}` : 'Package pricing'}
                        </span>
                      ) : (
                        <span className="badge badge-accent">{formatPence(activeSite.rate)}/hr</span>
                      )}
                      <span className="badge badge-neutral">{formatPence(activeSite.deposit)} deposit</span>
                      <span className="badge badge-neutral">{isVehicle ? `${activeSite.capacity} seats` : `Up to ${activeSite.capacity} guests`}</span>
                      {!isPackages && activeSite.min_hours && <span className="badge badge-neutral">Min. {activeSite.min_hours}hr</span>}
                      {activeSite.available_from && activeSite.available_until && (
                        <span className="badge badge-neutral">{activeSite.available_from}–{activeSite.available_until}</span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-muted,#71717a)' }}>{activeSite.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Contact */}
              <div className="card" style={{ marginBottom: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted,#71717a)', marginBottom: 10 }}>Your details</div>
                <div className="form-grid-2">
                  <div>
                    <label className="form-label">Full name</label>
                    <input className="form-input" required placeholder="Jane Smith" value={form.name} onChange={e => set('name', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" required placeholder="jane@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="tel" required placeholder="07700 900000" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
              </div>

              {/* Event */}
              <div className="card" style={{ marginBottom: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted,#71717a)', marginBottom: 10 }}>Event details</div>
                <div className="form-row">
                  <label className="form-label">{isVehicle ? 'Purpose of hire' : 'Event / purpose'}</label>
                  <input className="form-input" required placeholder={isVehicle ? 'e.g. Youth club trip, Airport run…' : 'e.g. Birthday party, Dance class…'} value={form.event} onChange={e => set('event', e.target.value)} />
                </div>
                <div className="form-grid-2">
                  {!isPackages && (
                    <div>
                      <label className="form-label">Booking type</label>
                      <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
                        <option value="oneoff">One-off</option>
                        <option value="recurring">Recurring</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="form-label">{isPackages && selectedPackage && selectedPackage.days > 1 ? 'Start date' : 'Date'}</label>
                    <input className="form-input" type="date" required value={form.date} onChange={e => set('date', e.target.value)} />
                  </div>
                </div>
                {isPackages && (
                  <div className="form-row">
                    <label className="form-label">Availability <span style={{ fontWeight: 400, color: 'var(--text-muted,#71717a)' }}>(tap a date to select it)</span></label>
                    <AvailabilityCalendar
                      bookings={siteBookings}
                      blockedDates={activeSite?.blocked_dates ?? []}
                      selectedStart={form.date}
                      spanDays={selectedPackage?.days ?? 1}
                      onSelect={ds => set('date', ds)}
                    />
                  </div>
                )}
                {isPackages && (
                  <div className="form-row">
                    <label className="form-label">Choose a package</label>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {packages.map(p => {
                        const sel = form.package_label === p.label
                        const dep = p.deposit ?? activeSite?.deposit ?? 0
                        return (
                          <button
                            type="button"
                            key={p.label}
                            onClick={() => set('package_label', sel ? '' : p.label)}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                              padding: '12px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                              border: `2px solid ${sel ? 'var(--accent,#7c3aed)' : 'var(--border,#e5e7eb)'}`,
                              background: sel ? 'var(--accent-light,#f5f3ff)' : 'var(--surface,#fff)',
                              fontFamily: 'inherit',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text,#111827)' }}>{p.label}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted,#71717a)', marginTop: 2 }}>
                                {isVehicle
                                  ? `Pickup ${fmt(p.start_time)} · return ${fmt(p.end_time)}${p.days > 1 ? ` (${p.days} days)` : ' same day'}`
                                  : `${fmt(p.start_time)}–${fmt(p.end_time)}${p.days > 1 ? ` · ${p.days} days` : ''}`}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text,#111827)' }}>{formatPence(p.price)}</div>
                              {dep > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted,#71717a)' }}>+ {formatPence(dep)} deposit</div>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {selectedPackage && selectedPackage.days > 1 && form.date && packageEndDate && (
                      <div className="notice notice-accent" style={{ marginTop: 8 }}>
                        {isVehicle
                          ? <>🚐 Pickup {new Date(form.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at {fmt(selectedPackage.start_time)} — return {new Date(packageEndDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} by {fmt(selectedPackage.end_time)}</>
                          : <>📅 Covers {new Date(form.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} – {new Date(packageEndDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</>}
                      </div>
                    )}
                  </div>
                )}
                {!isPackages && form.type === 'recurring' && (
                  <div className="form-row">
                    <label className="form-label">Recurrence</label>
                    <select className="form-input" value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
                      <option value="">Select…</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Fortnightly">Fortnightly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                )}
                {(() => {
                  if (isPackages) return null
                  const sched = activeSite && form.date ? getSiteSchedule(activeSite, form.date) : null
                  if (!sched) return null
                  if (!sched.open) {
                    const dayName = DAY_NAMES[new Date(form.date + 'T12:00:00').getDay()]
                    return <div className="notice notice-warn" style={{ marginBottom: 8 }}>⚠️ {activeSite!.name} is closed on {dayName.charAt(0).toUpperCase() + dayName.slice(1)}s. Please choose a different date.</div>
                  }
                  return <div className="notice notice-accent" style={{ marginBottom: 8 }}>🕐 Available {sched.from}–{sched.until} on this day</div>
                })()}
                {(() => {
                  if (!form.date) return null
                  const coveredDates = selectedPackage && selectedPackage.days > 1 && packageEndDate
                    ? Array.from({ length: selectedPackage.days }, (_, i) => addDays(form.date, i))
                    : [form.date]
                  const booked = coveredDates.flatMap(d =>
                    getBookingsOnDate(siteBookings, d).filter(b => b.type !== 'recurring').map(b => ({ day: d, b })))
                  if (booked.length === 0) return null
                  return (
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#c2410c', marginBottom: 6 }}>
                        ⚠️ Already booked on {coveredDates.length > 1 ? 'these dates' : 'this date'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {booked.sort((a, b) => (a.day + a.b.start_time).localeCompare(b.day + b.b.start_time)).map(({ day, b }, i) => (
                          <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#fed7aa', color: '#9a3412' }}>
                            {coveredDates.length > 1 ? `${new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ` : ''}{b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, color: '#9a3412' }}>
                        {isPackages
                          ? 'You can still submit a request — we\'ll confirm availability with you.'
                          : 'You can still submit a request for a different time slot — we\'ll confirm availability.'}
                      </div>
                    </div>
                  )
                })()}
                {(() => {
                  if (isPackages) return null
                  const sched = activeSite && form.date ? getSiteSchedule(activeSite, form.date) : null
                  const openFrom = sched?.open ? sched.from : null
                  const openUntil = sched?.open ? sched.until : null
                  return (
                    <div className="form-grid-2">
                      <div>
                        <label className="form-label">Start time</label>
                        <select className="form-input" required value={form.start_time} onChange={e => { set('start_time', e.target.value); set('end_time', '') }}>
                          <option value="">Select…</option>
                          {TIME_SLOTS
                            .filter(t => (!openFrom || t >= openFrom) && (!openUntil || t < openUntil))
                            .map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">End time</label>
                        <select className="form-input" required value={form.end_time} onChange={e => set('end_time', e.target.value)}>
                          <option value="">Select…</option>
                          {TIME_SLOTS
                            .filter(t => (!form.start_time || t > form.start_time) && (!openUntil || t <= openUntil))
                            .map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  )
                })()}
                {customQuestions.map(q => (
                  <div className="form-row" key={q.label}>
                    <label className="form-label">{q.label}{!q.required && <span style={{ fontWeight: 400, color: 'var(--text-muted,#71717a)' }}> (optional)</span>}</label>
                    <input
                      className="form-input"
                      required={q.required}
                      value={answers[q.label] ?? ''}
                      onChange={e => setAnswers(a => ({ ...a, [q.label]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="form-row">
                  <label className="form-label">Additional notes <span style={{ fontWeight: 400, color: 'var(--text-muted,#71717a)' }}>(optional)</span></label>
                  <textarea className="form-input" rows={3} style={{ resize: 'none' }} placeholder="Any special requirements…" value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>

              {/* Price summary */}
              {activeSite && (selectedPackage || (!isPackages && hours > 0)) && (
                <div className="price-bar" style={{ marginBottom: 14 }}>
                  {selectedPackage ? (
                    <>
                      <div><div className="pi-label">Package</div><div className="pi-value">{selectedPackage.label}</div></div>
                      <div><div className="pi-label">{selectedPackage.days > 1 ? 'Days' : 'Hours'}</div><div className="pi-value">{selectedPackage.days > 1 ? selectedPackage.days : hours}</div></div>
                    </>
                  ) : (
                    <>
                      <div><div className="pi-label">Rate</div><div className="pi-value">{formatPence(activeSite.rate)}/hr</div></div>
                      <div><div className="pi-label">Hours</div><div className="pi-value">{hours}</div></div>
                    </>
                  )}
                  <div><div className="pi-label">Deposit</div><div className="pi-value">{formatPence(deposit)}</div></div>
                  <div><div className="pi-label" style={{ fontWeight: 700 }}>Total</div><div className="pi-value" style={{ fontWeight: 800 }}>{formatPence(total)}</div></div>
                </div>
              )}

              {error && <div className="notice notice-warn" style={{ marginBottom: 12 }}>{error}</div>}

              <button
                type="submit"
                disabled={submitting || (!lockedSite && !form.site_id) || !form.name || !form.email}
                style={{ width: '100%', background: 'var(--accent,#7c3aed)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Submitting…' : 'Submit Booking Request'}
              </button>
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted,#71717a)', marginTop: 10 }}>
                Your request will be reviewed and you'll receive a confirmation email
              </div>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}
