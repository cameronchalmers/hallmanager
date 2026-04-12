import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Invoice, AppUser } from '../lib/database.types'
import { format } from 'date-fns'

interface SyncEntry { time: string; action: string; ok: boolean }

export default function QuickFile() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [accountNum, setAccountNum] = useState('123456789')
  const [apiKey, setApiKey] = useState('qf_live_••••••••••••••••')
  const [syncLog, setSyncLog] = useState<SyncEntry[]>([
    { time: 'Today 09:14', action: 'Monthly sync completed — 2 invoices pushed to QuickFile', ok: true },
    { time: 'Yesterday 09:00', action: 'Auto-sync: invoice marked as paid in QuickFile', ok: true },
  ])

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [invRes, userRes] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*').eq('role', 'regular'),
    ])
    setInvoices(invRes.data ?? [])
    setUsers((userRes.data ?? []) as unknown as AppUser[])
    setLoading(false)
  }

  const unsynced = invoices.filter(i => !i.qf_synced)

  async function doSync() {
    setSyncing(true)
    await new Promise(r => setTimeout(r, 1400))
    await supabase.from('invoices').update({ qf_synced: true }).in('id', unsynced.map(i => i.id))
    setInvoices(prev => prev.map(i => ({ ...i, qf_synced: true })))
    setSyncLog(l => [{ time: 'Just now', action: `Sync completed — ${unsynced.length} invoice(s) pushed to QuickFile`, ok: true }, ...l])
    setSyncing(false)
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Status card */}
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div className="qf-header">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px' }}>QuickFile</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Accounting integration</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block', marginRight: 5 }} />
              Connected
            </span>
            {unsynced.length > 0 && (
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={doSync}
              >
                {syncing ? 'Syncing…' : `Sync now (${unsynced.length} pending)`}
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div className="form-grid-2" style={{ marginBottom: 0 }}>
            <div><label className="form-label">Account Number</label><input className="form-input" value={accountNum} onChange={e => setAccountNum(e.target.value)} /></div>
            <div><label className="form-label">API Key</label><input className="form-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} /></div>
          </div>
        </div>
        <div style={{ padding: '12px 18px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Auto-sync', value: 'Monthly on 1st' },
            { label: 'Draft on approval', value: '✓ Enabled', green: true },
            { label: 'Client matching', value: '✓ By email', green: true },
          ].map(({ label, value, green }) => (
            <div key={label} style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: green ? 'var(--green)' : 'var(--text)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Client links */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Regular Booker → QuickFile Client Links</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{users.filter(u => u.qf_client_id).length}/{users.length} linked</span>
        </div>
        {users.length === 0 && !loading && <div className="empty"><div className="empty-title">No regular bookers yet</div></div>}
        {users.map(u => (
          <div key={u.id} className="sync-row">
            <div style={{ width: 30, height: 30, background: (u.color ?? '#7c3aed') + '22', color: u.color ?? '#7c3aed', fontSize: 11, fontWeight: 700, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
            </div>
            {u.qf_client_id
              ? <><span className="badge badge-qf">🔗 {u.qf_client_id}</span><span className="badge badge-approved" style={{ marginLeft: 4 }}>✓ Linked</span></>
              : <><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not linked</span><button className="btn btn-qf btn-sm" style={{ marginLeft: 8 }}>Match by email</button></>
            }
          </div>
        ))}
      </div>

      {/* Invoices */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Invoices</span>
          {unsynced.length > 0 && <span className="badge badge-pending">{unsynced.length} unsynced</span>}
        </div>
        <div className="inv-row" style={{ background: 'var(--surface2)', fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' }}>
          <span>Invoice</span><span>Description</span><span>Amount</span><span>Date</span><span>QF Status</span><span>Payment</span>
        </div>
        {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}
        {!loading && invoices.length === 0 && <div className="empty"><div className="empty-title">No invoices yet</div></div>}
        {invoices.map(inv => (
          <div key={inv.id} className="inv-row">
            <span style={{ fontWeight: 700, color: 'var(--accent-text)', fontSize: 12 }}>{inv.id.slice(0, 8).toUpperCase()}</span>
            <span style={{ fontSize: 12 }}>{inv.description}</span>
            <span style={{ fontWeight: 700 }}>£{inv.amount}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{format(new Date(inv.date), 'dd MMM yy')}</span>
            <span>{inv.qf_synced ? <span className="badge badge-qf">🔗 {inv.qf_ref ?? 'Synced'}</span> : <span className="badge badge-pending">Not synced</span>}</span>
            <span><span className={`badge ${inv.status === 'paid' ? 'badge-approved' : 'badge-pending'}`}>{inv.status === 'paid' ? '✓ Paid' : '⏳ Due'}</span></span>
          </div>
        ))}
      </div>

      {/* Sync log */}
      <div className="card">
        <div className="card-header"><span className="card-title">Sync Log</span></div>
        {syncLog.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 18px', borderBottom: i < syncLog.length - 1 ? '1px solid #f4f4f6' : 'none' }}>
            <span style={{ fontSize: 13 }}>{l.ok ? '✓' : '✗'}</span>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>{l.action}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{l.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
