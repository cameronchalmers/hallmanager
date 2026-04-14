import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface SlotBooking {
  date: string
  start_time: string
  end_time: string
  type: string
  recurrence: string | null
  cancelled_sessions: string[] | null
  recurrence_days: number[] | null
}

interface Site {
  id: string
  name: string
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function toDs(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getDays(year: number, month: number) {
  const days: { date: Date; curr: boolean }[] = []
  const firstDow = new Date(year, month, 1).getDay()
  const offset = (firstDow + 6) % 7
  const total = new Date(year, month + 1, 0).getDate()
  for (let i = 0; i < offset; i++) days.push({ date: new Date(year, month, i - offset + 1), curr: false })
  for (let i = 1; i <= total; i++) days.push({ date: new Date(year, month, i), curr: true })
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, days.length - total - offset + 1), curr: false })
  return days
}

function buildSlotMap(bookings: SlotBooking[], year: number, month: number): Map<string, SlotBooking[]> {
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const map = new Map<string, SlotBooking[]>()

  function add(ds: string, b: SlotBooking) {
    const list = map.get(ds) ?? []
    list.push(b)
    map.set(ds, list)
  }

  for (const b of bookings) {
    if (b.type !== 'recurring' || !b.recurrence) {
      if (b.date >= monthStart && b.date <= monthEnd) add(b.date, b)
    } else {
      const cancelled = new Set(b.cancelled_sessions ?? [])
      const isMultiDay = b.recurrence === 'Weekly' && b.recurrence_days && b.recurrence_days.length > 1

      if (isMultiDay) {
        const days = [...(b.recurrence_days as number[])].sort()
        const start = new Date(b.date + 'T12:00:00')
        const startDow = (start.getDay() + 6) % 7
        const weekCur = new Date(start)
        weekCur.setDate(weekCur.getDate() - startDow)
        const max = new Date(monthEnd + 'T12:00:00')
        while (weekCur <= max) {
          for (const dayIdx of days) {
            const d = new Date(weekCur)
            d.setDate(d.getDate() + dayIdx)
            const ds = toDs(d)
            if (ds >= monthStart && ds <= monthEnd && ds >= b.date && !cancelled.has(ds)) add(ds, b)
          }
          weekCur.setDate(weekCur.getDate() + 7)
        }
      } else {
        const cur = new Date(b.date + 'T12:00:00')
        const max = new Date(monthEnd + 'T12:00:00')
        while (cur <= max) {
          const ds = toDs(cur)
          if (ds >= monthStart && !cancelled.has(ds)) add(ds, b)
          if (b.recurrence === 'Weekly') cur.setDate(cur.getDate() + 7)
          else if (b.recurrence === 'Fortnightly') cur.setDate(cur.getDate() + 14)
          else if (b.recurrence === 'Monthly') cur.setMonth(cur.getMonth() + 1)
          else break
        }
      }
    }
  }
  return map
}

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 || 12
  return `${h12}${m ? `:${String(m).padStart(2,'0')}` : ''}${ampm}`
}

export default function PublicCalendar() {
  const { slug } = useParams<{ slug?: string }>()
  const today = new Date()
  const [cal, setCal] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [bookings, setBookings] = useState<SlotBooking[]>([])
  const [site, setSite] = useState<Site | null>(null)
  const [selDay, setSelDay] = useState<Date | null>(null)
  const [accentColor, setAccentColor] = useState('#7c3aed')

  useEffect(() => {
    loadSite()
    loadAccent()
  }, [slug])

  useEffect(() => {
    if (site) fetchMonth()
  }, [cal, site])

  async function loadSite() {
    const { data } = await (supabase as any).from('sites').select('id, name')
    const all: Site[] = data ?? []
    if (slug) {
      const match = all.find(s => toSlug(s.name) === slug)
      setSite(match ?? null)
    } else {
      setSite(all[0] ?? null)
    }
  }

  async function loadAccent() {
    const { data } = await (supabase as any).from('app_settings').select('value').eq('key', 'accent_color').maybeSingle()
    if (data?.value) setAccentColor(String(data.value).replace(/"/g, ''))
  }

  async function fetchMonth() {
    if (!site) return
    const { data } = await (supabase as any).rpc('get_site_bookings', { p_site_id: site.id })
    setBookings(data ?? [])
  }

  const slotMap = buildSlotMap(bookings, cal.year, cal.month)
  const days = getDays(cal.year, cal.month)

  const localDs = (d: Date) => toDs(d)
  const getForDay = (d: Date) => slotMap.get(localDs(d)) ?? []
  const selSlots = selDay ? getForDay(selDay).sort((a, b) => a.start_time.localeCompare(b.start_time)) : []

  const isWeekend = (d: Date) => { const dow = d.getDay(); return dow === 0 || dow === 6 }

  const prevMonth = () => setCal(c => { const d = new Date(c.year, c.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  const nextMonth = () => setCal(c => { const d = new Date(c.year, c.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7ff', fontFamily: "'Figtree', 'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: accentColor, color: '#fff', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>H</div>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#18181b' }}>{site?.name ?? 'Availability'}</span>
              <span style={{ fontSize: 13, color: '#71717a', marginLeft: 8 }}>Availability Calendar</span>
            </div>
          </div>
          <a href={slug ? `/book/${slug}` : '/book'} style={{ background: accentColor, color: '#fff', fontWeight: 600, fontSize: 13, padding: '7px 16px', borderRadius: 8, textDecoration: 'none' }}>
            Book a slot →
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={prevMonth} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 16, minWidth: 160, textAlign: 'center', color: '#18181b' }}>{MONTHS[cal.month]} {cal.year}</span>
            <button onClick={nextMonth} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          </div>

          <button
            onClick={() => { setCal({ year: today.getFullYear(), month: today.getMonth() }); setSelDay(null) }}
            style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, color: '#71717a', cursor: 'pointer', marginLeft: 'auto' }}
          >
            Today
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#71717a' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fee2e2', border: '1px solid #fca5a5', display: 'inline-block' }} /> Fully booked
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#71717a' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fef3c7', border: '1px solid #fde68a', display: 'inline-block' }} /> Partially booked
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#71717a' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'inline-block' }} /> Available
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selDay ? '1fr 300px' : '1fr', gap: 16, alignItems: 'start' }}>
          {/* Calendar grid */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e5e7eb' }}>
              {DAYS.map((d, i) => (
                <div key={d} style={{
                  padding: '10px 0',
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: i >= 5 ? accentColor : '#71717a',
                  background: i >= 5 ? `${accentColor}08` : 'transparent',
                  borderRight: i < 6 ? '1px solid #f3f4f6' : 'none',
                }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {days.map((d, i) => {
                const slots = getForDay(d.date)
                const isToday = d.date.toDateString() === today.toDateString()
                const isSel = selDay && d.date.toDateString() === selDay.toDateString()
                const isPast = d.date < today && !isToday
                const weekend = isWeekend(d.date)
                const dow = (d.date.getDay() + 6) % 7 // 0=Mon…6=Sun
                const isLastInRow = dow === 6

                // Determine fill colour
                let bg = weekend && d.curr ? `${accentColor}06` : '#fff'
                if (!d.curr) bg = '#fafafa'
                if (slots.length > 0 && d.curr && !isPast) {
                  // Simple heuristic: if booked hours cover most of the day, show red; else amber
                  const totalHours = slots.reduce((acc, s) => {
                    const [sh, sm] = s.start_time.split(':').map(Number)
                    const [eh, em] = s.end_time.split(':').map(Number)
                    return acc + (eh + em/60) - (sh + sm/60)
                  }, 0)
                  bg = totalHours >= 4 ? '#fee2e2' : '#fef3c7'
                }
                if (slots.length === 0 && d.curr && !isPast) bg = weekend ? `${accentColor}06` : '#fff'
                if (isSel) bg = `${accentColor}18`
                if (isToday) bg = accentColor

                return (
                  <button
                    key={i}
                    disabled={!d.curr || isPast}
                    onClick={() => setSelDay(prev => prev?.toDateString() === d.date.toDateString() ? null : d.date)}
                    style={{
                      position: 'relative',
                      padding: '10px 6px 22px',
                      minHeight: 62,
                      background: bg,
                      border: 'none',
                      borderRight: !isLastInRow ? '1px solid #f3f4f6' : 'none',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: d.curr && !isPast ? 'pointer' : 'default',
                      textAlign: 'center',
                      transition: 'background 0.1s',
                      outline: isSel ? `2px solid ${accentColor}` : 'none',
                      outlineOffset: -2,
                    }}
                  >
                    <span style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: isToday ? 800 : d.curr ? 500 : 400,
                      color: isToday ? '#fff' : !d.curr || isPast ? '#d1d5db' : weekend ? '#18181b' : '#18181b',
                    }}>
                      {d.date.getDate()}
                    </span>

                    {/* Slot pills */}
                    {d.curr && !isPast && slots.length > 0 && (
                      <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 1, padding: '0 3px' }}>
                        {slots.slice(0, 2).map((s, si) => (
                          <span key={si} style={{
                            fontSize: 9,
                            background: isToday ? 'rgba(255,255,255,0.25)' : slots.length >= 2 && si === 0 ? '#fca5a5' : '#fde68a',
                            color: isToday ? '#fff' : '#78350f',
                            borderRadius: 3,
                            padding: '1px 3px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.4,
                          }}>
                            {fmt12(s.start_time)}–{fmt12(s.end_time)}
                          </span>
                        ))}
                        {slots.length > 2 && (
                          <span style={{ fontSize: 9, color: isToday ? 'rgba(255,255,255,0.8)' : '#9ca3af' }}>+{slots.length - 2} more</span>
                        )}
                      </span>
                    )}

                    {/* Weekend label on available days */}
                    {d.curr && !isPast && slots.length === 0 && weekend && !isToday && (
                      <span style={{ position: 'absolute', bottom: 5, left: 0, right: 0, fontSize: 9, color: `${accentColor}80`, textAlign: 'center' }}>Free</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Day detail panel */}
          {selDay && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#18181b' }}>
                    {selDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <div style={{ fontSize: 11, color: '#71717a', marginTop: 1 }}>
                    {selSlots.length === 0 ? 'No bookings — available all day' : `${selSlots.length} booking${selSlots.length > 1 ? 's' : ''}`}
                  </div>
                </div>
                <button onClick={() => setSelDay(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>

              {selSlots.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#18181b', marginBottom: 4 }}>All clear!</div>
                  <div style={{ fontSize: 12, color: '#71717a', marginBottom: 16 }}>No bookings on this day.</div>
                  <a href={slug ? `/book/${slug}` : '/book'} style={{ background: accentColor, color: '#fff', fontWeight: 600, fontSize: 13, padding: '8px 18px', borderRadius: 8, textDecoration: 'none', display: 'inline-block' }}>
                    Book this day →
                  </a>
                </div>
              )}

              {selSlots.map((s, i) => (
                <div key={i} style={{ padding: '12px 16px', borderBottom: i < selSlots.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#18181b', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt12(s.start_time)} – {fmt12(s.end_time)}
                    </span>
                    {s.type === 'recurring' && (
                      <span style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>
                        ↻ {s.recurrence}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#71717a', marginTop: 3 }}>
                    {(() => {
                      const [sh, sm] = s.start_time.split(':').map(Number)
                      const [eh, em] = s.end_time.split(':').map(Number)
                      const hrs = (eh + em/60) - (sh + sm/60)
                      return `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hour${hrs !== 1 ? 's' : ''}`
                    })()}
                  </div>
                </div>
              ))}

              {selSlots.length > 0 && (
                <div style={{ padding: '12px 16px', background: '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 12, color: '#71717a', marginBottom: 8 }}>
                    Want a different time? You can still submit a request — we'll confirm availability.
                  </div>
                  <a href={slug ? `/book/${slug}` : '/book'} style={{ background: accentColor, color: '#fff', fontWeight: 600, fontSize: 13, padding: '7px 16px', borderRadius: 8, textDecoration: 'none', display: 'inline-block' }}>
                    Request a slot →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 20 }}>
          Booked times are shown — click any date to see details. Availability is subject to confirmation.
        </p>
      </div>
    </div>
  )
}
