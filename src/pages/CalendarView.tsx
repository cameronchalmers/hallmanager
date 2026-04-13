import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Booking, Site } from '../lib/database.types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getDays(year: number, month: number) {
  const days: { date: Date; curr: boolean }[] = []
  const first = new Date(year, month, 1).getDay()
  const total = new Date(year, month + 1, 0).getDate()
  for (let i = 0; i < first; i++) days.push({ date: new Date(year, month, -first + i + 1), curr: false })
  for (let i = 1; i <= total; i++) days.push({ date: new Date(year, month, i), curr: true })
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, days.length - total - first + 1), curr: false })
  return days
}

export default function CalendarView() {
  const today = new Date()
  const [cal, setCal] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [bookings, setBookings] = useState<Booking[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteFilter, setSiteFilter] = useState('all')
  const [selDay, setSelDay] = useState<Date | null>(null)

  useEffect(() => { fetchMonth() }, [cal])

  async function fetchMonth() {
    const start = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-01`
    const end = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-31`
    const [bRes, sRes] = await Promise.all([
      supabase.from('bookings').select('*').neq('status', 'denied').gte('date', start).lte('date', end),
      supabase.from('sites').select('*'),
    ])
    setBookings(bRes.data ?? [])
    setSites(sRes.data ?? [])
  }

  const days = getDays(cal.year, cal.month)
  const filteredBookings = bookings.filter(b => siteFilter === 'all' || b.site_id === siteFilter)

  const getForDay = (d: Date) => {
    const ds = d.toISOString().split('T')[0]
    return filteredBookings.filter(b => b.date === ds)
  }

  const selBookings = selDay ? getForDay(selDay) : []

  function prevMonth() {
    setCal(c => { const d = new Date(c.year, c.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  }
  function nextMonth() {
    setCal(c => { const d = new Date(c.year, c.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 2px' }}>
          <button className="btn btn-ghost btn-sm" onClick={prevMonth}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{MONTHS[cal.month]} {cal.year}</span>
          <button className="btn btn-ghost btn-sm" onClick={nextMonth}>›</button>
        </div>
        <div style={{ padding: '4px 14px 2px', display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Venue:</span>
          <select className="form-input" style={{ width: 'auto', padding: '3px 6px', fontSize: 11 }} value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
            <option value="all">All</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="cal-grid">
          {DAYS.map(d => <div key={d} className="cal-dh">{d}</div>)}
          {days.map((d, i) => {
            const bs = getForDay(d.date)
            const isToday = d.date.toDateString() === today.toDateString()
            const isSel = selDay && d.date.toDateString() === selDay.toDateString()
            return (
              <button
                key={i}
                className={[
                  'cal-day',
                  !d.curr ? 'other' : '',
                  isToday ? 'today' : '',
                  bs.length > 0 && !isToday ? 'booked' : '',
                  isSel && !isToday ? 'sel' : '',
                ].join(' ')}
                onClick={() => setSelDay(d.date)}
              >
                {d.date.getDate()}
                {bs.length > 0 && <span className="cal-dot" />}
              </button>
            )
          })}
        </div>
        <div style={{ padding: '4px 14px 12px', display: 'flex', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
            Booked
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} />
            Today
          </span>
        </div>
      </div>

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
        {selBookings.map(b => {
          const site = sites.find(s => s.id === b.site_id)
          return (
            <div key={b.id} style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{b.event}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.start_time}–{b.end_time}</span>
                  {b.status === 'pending' && <span className="badge badge-pending" style={{ fontSize: 10 }}>Pending</span>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.name} · {site?.name}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
