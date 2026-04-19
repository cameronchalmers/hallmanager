import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSite } from '../context/SiteContext'
import type { Booking, Invoice, Site } from '../lib/database.types'
import { formatPence } from '../lib/money'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Expand a recurring booking into all session dates within a date range
function expandRecurring(b: Booking, from: Date, to: Date): string[] {
  const dates: string[] = []
  const cancelled = new Set(b.cancelled_sessions ?? [])
  const cur = new Date(b.date + 'T12:00:00')
  while (cur <= to) {
    const ds = cur.toISOString().split('T')[0]
    const d = new Date(ds + 'T12:00:00')
    if (d >= from && !cancelled.has(ds)) dates.push(ds)
    if (b.recurrence === 'Weekly') cur.setDate(cur.getDate() + 7)
    else if (b.recurrence === 'Fortnightly') cur.setDate(cur.getDate() + 14)
    else if (b.recurrence === 'Monthly') cur.setMonth(cur.getMonth() + 1)
    else break
  }
  return dates
}

// ── Chart components ───────────────────────────────────────────────────────────

function BarChart({ data, maxVal, colorA, colorB, labelA, labelB }: {
  data: { label: string; a: number; b?: number }[]
  maxVal: number
  colorA: string
  colorB?: string
  labelA: string
  labelB?: string
}) {
  return (
    <div>
      {colorB && labelB && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: colorA, display: 'inline-block' }} />{labelA}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: colorB, display: 'inline-block' }} />{labelB}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
        {data.map(d => {
          const pctA = maxVal > 0 ? (d.a / maxVal) * 100 : 0
          const pctB = maxVal > 0 && d.b != null ? (d.b / maxVal) * 100 : 0
          return (
            <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 120 }}>
                <div style={{ flex: 1, background: colorA, borderRadius: '3px 3px 0 0', height: `${pctA}%`, minHeight: d.a > 0 ? 3 : 0, transition: 'height 0.3s' }} title={`${labelA}: ${d.a}`} />
                {colorB && d.b != null && (
                  <div style={{ flex: 1, background: colorB, borderRadius: '3px 3px 0 0', height: `${pctB}%`, minHeight: d.b > 0 ? 3 : 0, transition: 'height 0.3s' }} title={`${labelB}: ${d.b}`} />
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HBar({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 90, fontSize: 12, color: 'var(--text)', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <div style={{ width: 36, fontSize: 12, fontWeight: 700, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>{value}{suffix}</div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function Insights() {
  const { currentSite } = useSite()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (currentSite) fetchData() }, [currentSite?.id])

  async function fetchData() {
    if (!currentSite) return
    setLoading(true)
    const [bRes, iRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('site_id', currentSite.id).in('status', ['confirmed', 'approved', 'pending']),
      supabase.from('invoices').select('*'),
    ])
    const siteBookingIds = new Set((bRes.data ?? []).map(b => b.id))
    setBookings(bRes.data ?? [])
    setInvoices((iRes.data ?? []).filter(inv => inv.booking_id && siteBookingIds.has(inv.booking_id)))
    setSites([currentSite])
    setLoading(false)
  }

  if (loading) return <div className="empty"><div className="empty-icon">⏳</div><div className="empty-title">Loading…</div></div>

  const now = new Date()

  // ── Last 6 months ────────────────────────────────────────────────────────────
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i)
    return { year: d.getFullYear(), month: d.getMonth(), label: format(d, 'MMM yy'), key: getMonthKey(d) }
  })
  const rangeStart = startOfMonth(subMonths(now, 5))
  const rangeEnd = endOfMonth(now)

  // Sessions per month (expanded)
  const sessionsByMonth: Record<string, { oneoff: number; recurring: number }> = {}
  months.forEach(m => { sessionsByMonth[m.key] = { oneoff: 0, recurring: 0 } })

  for (const b of bookings) {
    if (b.type === 'recurring' && b.recurrence) {
      const dates = expandRecurring(b, rangeStart, rangeEnd)
      for (const ds of dates) {
        const key = ds.slice(0, 7)
        if (sessionsByMonth[key]) sessionsByMonth[key].recurring++
      }
    } else {
      const key = b.date.slice(0, 7)
      if (sessionsByMonth[key]) sessionsByMonth[key].oneoff++
    }
  }

  const sessionChartData = months.map(m => ({
    label: m.label,
    a: sessionsByMonth[m.key].oneoff,
    b: sessionsByMonth[m.key].recurring,
  }))
  const maxSessions = Math.max(...sessionChartData.map(d => d.a + (d.b ?? 0)), 1)

  // ── Revenue per month (paid invoices) ────────────────────────────────────────
  const revenueByMonth: Record<string, number> = {}
  months.forEach(m => { revenueByMonth[m.key] = 0 })
  for (const inv of invoices) {
    if (inv.status === 'paid') {
      const key = inv.date?.slice(0, 7)
      if (key && revenueByMonth[key] !== undefined) revenueByMonth[key] += inv.amount ?? 0
    }
  }
  const revenueChartData = months.map(m => ({ label: m.label, a: revenueByMonth[m.key] }))
  const maxRevenue = Math.max(...revenueChartData.map(d => d.a), 1)

  // ── Busiest days of week (one-off by booking date + recurring sessions) ───────
  const dayCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const b of bookings) {
    if (b.type === 'recurring' && b.recurrence) {
      const dates = expandRecurring(b, rangeStart, rangeEnd)
      for (const ds of dates) {
        const dow = (new Date(ds + 'T12:00:00').getDay() + 6) % 7 // Mon=0
        dayCount[dow]++
      }
    } else {
      const dow = (new Date(b.date + 'T12:00:00').getDay() + 6) % 7
      dayCount[dow]++
    }
  }
  const maxDay = Math.max(...Object.values(dayCount), 1)

  // ── Bookings by venue ─────────────────────────────────────────────────────────
  const bySite: Record<string, number> = {}
  for (const b of bookings) {
    bySite[b.site_id] = (bySite[b.site_id] ?? 0) + 1
  }
  const maxSite = Math.max(...Object.values(bySite), 1)

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const thisMonthKey = getMonthKey(now)
  const sessionsThisMonth = (sessionsByMonth[thisMonthKey]?.oneoff ?? 0) + (sessionsByMonth[thisMonthKey]?.recurring ?? 0)
  const revenueThisYear = invoices.filter(i => i.status === 'paid' && i.date?.startsWith(String(now.getFullYear()))).reduce((s, i) => s + (i.amount ?? 0), 0)
  const recurringCount = bookings.filter(b => b.type === 'recurring').length
  const oneoffCount = bookings.filter(b => b.type !== 'recurring').length

  return (
    <div style={{ maxWidth: 960 }}>

      {/* Stat cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Sessions this month</div>
          <div className="stat-value">{sessionsThisMonth}</div>
          <div className="stat-sub">Across all venues</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Revenue this year</div>
          <div className="stat-value">{formatPence(revenueThisYear)}</div>
          <div className="stat-sub">Paid invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active recurring</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{recurringCount}</div>
          <div className="stat-sub">Regular bookers</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">One-off bookings</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{oneoffCount}</div>
          <div className="stat-sub">All time</div>
        </div>
      </div>

      {/* Monthly charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Sessions per month</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last 6 months</span></div>
          <div style={{ padding: '16px 20px 20px' }}>
            <BarChart
              data={sessionChartData}
              maxVal={maxSessions}
              colorA="var(--accent)"
              colorB="var(--blue)"
              labelA="One-off"
              labelB="Recurring"
            />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Revenue per month</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paid invoices</span></div>
          <div style={{ padding: '16px 20px 20px' }}>
            <BarChart
              data={revenueChartData}
              maxVal={maxRevenue}
              colorA="var(--green)"
              labelA="Revenue"
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Peak: {formatPence(Math.max(...revenueChartData.map(d => d.a)))} · Avg: {formatPence(Math.round(revenueChartData.reduce((s, d) => s + d.a, 0) / 6))}
            </div>
          </div>
        </div>
      </div>

      {/* Venue + day breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Bookings by venue</span></div>
          <div style={{ padding: '16px 20px' }}>
            {sites.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No venues found</div>}
            {sites.sort((a, b) => (bySite[b.id] ?? 0) - (bySite[a.id] ?? 0)).map(s => (
              <HBar key={s.id} label={s.name} value={bySite[s.id] ?? 0} max={maxSite} color="var(--accent)" />
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Busiest days</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last 6 months</span></div>
          <div style={{ padding: '16px 20px' }}>
            {DAYS.map((day, i) => (
              <HBar key={day} label={day} value={dayCount[i]} max={maxDay} color="var(--blue)" suffix=" sessions" />
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
