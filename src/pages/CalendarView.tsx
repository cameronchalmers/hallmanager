import { useState } from 'react'
import CalendarWidget from '../components/CalendarWidget'
import { supabase } from '../lib/supabase'
import { useSite } from '../context/SiteContext'

function toDs(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CalendarView() {
  const { currentSite, setCurrentSite } = useSite()
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function addBlock() {
    if (!currentSite || !newDate) return
    setSaving(true)
    const current = currentSite.blocked_dates ?? []
    if (current.includes(newDate)) { setSaving(false); return }
    const updated = [...current, newDate].sort()
    await supabase.from('sites').update({ blocked_dates: updated }).eq('id', currentSite.id)
    setCurrentSite({ ...currentSite, blocked_dates: updated })
    setNewDate('')
    setSaving(false)
  }

  async function removeBlock(date: string) {
    if (!currentSite) return
    const updated = (currentSite.blocked_dates ?? []).filter(d => d !== date)
    await supabase.from('sites').update({ blocked_dates: updated }).eq('id', currentSite.id)
    setCurrentSite({ ...currentSite, blocked_dates: updated })
  }

  const today = toDs(new Date())
  const upcoming = (currentSite?.blocked_dates ?? []).filter(d => d >= today).sort()
  const past = (currentSite?.blocked_dates ?? []).filter(d => d < today).sort().reverse()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      <CalendarWidget showSiteFilter />

      {/* Blocked dates panel */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Blocked Dates</span>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 6 }}>Block a date</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="date"
              className="form-input"
              value={newDate}
              min={today}
              onChange={e => setNewDate(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={addBlock}
              disabled={!newDate || saving}
            >
              Block
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Blocked days show as closed on the public calendar.
          </div>
        </div>

        {/* Upcoming blocks */}
        {upcoming.length > 0 && (
          <div style={{ padding: '10px 16px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 6 }}>Upcoming</div>
            {upcoming.map(d => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{fmtDate(d)}</span>
                <button
                  onClick={() => removeBlock(d)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                  title="Unblock"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {upcoming.length === 0 && (
          <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No upcoming blocked dates</div>
        )}

        {/* Past blocks (collapsed) */}
        {past.length > 0 && (
          <details style={{ padding: '8px 16px 12px' }}>
            <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
              {past.length} past blocked date{past.length > 1 ? 's' : ''}
            </summary>
            <div style={{ marginTop: 6 }}>
              {past.map(d => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(d)}</span>
                  <button
                    onClick={() => removeBlock(d)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}
                    title="Remove"
                  >×</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
