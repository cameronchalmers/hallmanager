import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Booking, Site } from '../lib/database.types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getDays(year: number, month: number) {
  const days: { date: Date; curr: boolean }[] = []
  const firstDow = new Date(year, month, 1).getDay()
  const offset = (firstDow + 6) % 7 // Mon=0 … Sun=6
  const total = new Date(year, month + 1, 0).getDate()
  for (let i = 0; i < offset; i++) days.push({ date: new Date(year, month, i - offset + 1), curr: false })
  for (let i = 1; i <= total; i++) days.push({ date: new Date(year, month, i), curr: true })
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, days.length - total - offset + 1), curr: false })
  return days
}

// Expands all bookings (including recurring) into a date → bookings map for a given month
function buildSessionMap(bookings: Booking[], year: number, month: number): Map<string, Booking[]> {
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const map = new Map<string, Booking[]>()

  for (const b of bookings) {
    if (b.type !== 'recurring' || !b.recurrence) {
      if (b.date >= monthStart && b.date <= monthEnd) {
        const list = map.get(b.date) ?? []
        list.push(b)
        map.set(b.date, list)
      }
    } else {
      const cancelled = new Set(b.cancelled_sessions ?? [])
      const cur = new Date(b.date + 'T12:00:00')
      const max = new Date(monthEnd + 'T12:00:00')
      while (cur <= max) {
        const ds = cur.toISOString().split('T')[0]
        if (ds >= monthStart && !cancelled.has(ds)) {
          const list = map.get(ds) ?? []
          list.push(b)
          map.set(ds, list)
        }
        if (b.recurrence === 'Weekly') cur.setDate(cur.getDate() + 7)
        else if (b.recurrence === 'Fortnightly') cur.setDate(cur.getDate() + 14)
        else if (b.recurrence === 'Monthly') cur.setMonth(cur.getMonth() + 1)
        else break
      }
    }
  }
  return map
}

export default function CalendarWidget({ showSiteFilter = true, compact = false }: { showSiteFilter?: boolean; compact?: boolean }) {
  const today = new Date()
  const [cal, setCal] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [bookings, setBookings] = useState<Booking[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteFilter, setSiteFilter] = useState('all')
  const [selDay, setSelDay] = useState<Date | null>(null)

  useEffect(() => { fetchMonth() }, [cal])

  async function fetchMonth() {
    const start = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(cal.year, cal.month + 1, 0).getDate()
    const end = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const [oneoffsRes, recurringRes, sRes] = await Promise.all([
      // One-off bookings whose date falls in this month
      supabase.from('bookings').select('*')
        .in('status', ['pending', 'approved', 'confirmed'])
        .neq('type', 'recurring')
        .gte('date', start).lte('date', end),
      // All recurring bookings that started on or before end of this month
      supabase.from('bookings').select('*')
        .in('status', ['pending', 'approved', 'confirmed'])
        .eq('type', 'recurring')
        .lte('date', end),
      supabase.from('sites').select('*'),
    ])
    setBookings([...(oneoffsRes.data ?? []), ...(recurringRes.data ?? [])])
    setSites(sRes.data ?? [])
  }

  const filtered = bookings.filter(b => siteFilter === 'all' || b.site_id === siteFilter)
  const sessionMap = buildSessionMap(filtered, cal.year, cal.month)
  const days = getDays(cal.year, cal.month)

  const localDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const getForDay = (d: Date) => sessionMap.get(localDateStr(d)) ?? []
  const selBookings = selDay ? getForDay(selDay) : []

  const gridCard = (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 2px' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setCal(c => { const d = new Date(c.year, c.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{MONTHS[cal.month]} {cal.year}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setCal(c => { const d = new Date(c.year, c.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })}>›</button>
      </div>
      {showSiteFilter && (
        <div style={{ padding: '4px 14px 2px', display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Venue:</span>
          <select className="form-input" style={{ width: 'auto', padding: '3px 6px', fontSize: 11 }} value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
            <option value="all">All</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-dh">{d}</div>)}
        {days.map((d, i) => {
          const bs = getForDay(d.date)
          const hasOneoff = bs.some(b => b.type !== 'recurring')
          const hasRecurring = bs.some(b => b.type === 'recurring')
          const isToday = d.date.toDateString() === today.toDateString()
          const isSel = selDay && d.date.toDateString() === selDay.toDateString()
          return (
            <button
              key={i}
              className={['cal-day', !d.curr ? 'other' : '', isToday ? 'today' : '', bs.length > 0 && !isToday ? 'booked' : '', isSel && !isToday ? 'sel' : ''].join(' ')}
              onClick={() => setSelDay(prev => prev?.toDateString() === d.date.toDateString() ? null : d.date)}
            >
              {d.date.getDate()}
              {(hasOneoff || hasRecurring) && (
                <span style={{ position: 'absolute', bottom: 2, display: 'flex', gap: 2 }}>
                  {hasOneoff && <span style={{ width: 4, height: 4, borderRadius: '50%', background: isToday ? 'rgba(255,255,255,0.8)' : 'var(--accent)', display: 'inline-block' }} />}
                  {hasRecurring && <span style={{ width: 4, height: 4, borderRadius: '50%', background: isToday ? 'rgba(255,255,255,0.8)' : 'var(--blue)', display: 'inline-block' }} />}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ padding: '4px 14px 12px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} /> One-off
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} /> Recurring
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} /> Today
        </span>
      </div>

      {/* Compact: inline day detail below grid */}
      {compact && selDay && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
            {selDay.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          {selBookings.length === 0 && (
            <div style={{ padding: '6px 14px 10px', fontSize: 12, color: 'var(--text-muted)' }}>No bookings</div>
          )}
          {selBookings.map((b, i) => {
            const site = sites.find(s => s.id === b.site_id)
            return (
              <div key={b.id + i} style={{ padding: '6px 14px', borderTop: i > 0 ? '1px solid var(--border)' : undefined, paddingBottom: i === selBookings.length - 1 ? 12 : 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{b.event}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.start_time}–{b.end_time}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.name} · {site?.name}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const detailCard = (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {selDay ? selDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Select a date'}
        </span>
      </div>
      {!selDay && <div className="empty"><div className="empty-icon">📅</div><div className="empty-title">Click a date</div></div>}
      {selDay && selBookings.length === 0 && (
        <div className="empty"><div className="empty-icon">✅</div><div className="empty-title">Free</div><div style={{ fontSize: 12 }}>No bookings this day</div></div>
      )}
      {selBookings.map((b, i) => {
        const site = sites.find(s => s.id === b.site_id)
        return (
          <div key={b.id + i} style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.event}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.start_time}–{b.end_time}</span>
                {b.status === 'pending' && <span className="badge badge-pending" style={{ fontSize: 10 }}>Pending</span>}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.name} · {site?.name}</div>
            {b.type === 'recurring' && (
              <span className="badge badge-recurring" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>↻ {b.recurrence}</span>
            )}
          </div>
        )
      })}
    </div>
  )

  if (compact) return gridCard

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {gridCard}
      {detailCard}
    </div>
  )
}
