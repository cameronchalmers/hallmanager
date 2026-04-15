import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Invoice, AppUser } from '../lib/database.types'
import { formatPence } from '../lib/money'
import { format } from 'date-fns'

interface SyncEntry { time: string; action: string; ok: boolean }

type ConnStatus = 'checking' | 'connected' | 'error' | 'unconfigured'


export default function QuickFile() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [connStatus, setConnStatus] = useState<ConnStatus>('checking')
  const [connError, setConnError] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<SyncEntry[]>([])
  const [linkingUser, setLinkingUser] = useState<string | null>(null)
  const [findResults, setFindResults] = useState<Record<string, { clients: any[]; open: boolean }>>({})
  const [pullingUser, setPullingUser] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
    testConnection()
  }, [])

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

  async function testConnection() {
    setConnStatus('checking')
    setConnError('')
    const { data, error } = await supabase.functions.invoke('quickfile', { body: { action: 'test' } })
    if (error || !data?.ok) {
      const msg = data?.error ?? error?.message ?? 'Unknown error'
      setConnError(msg)
      setConnStatus(msg.includes('not configured') ? 'unconfigured' : 'error')
    } else {
      setConnStatus('connected')
      setConnError('')
    }
  }

  function addLog(action: string, ok: boolean) {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    setSyncLog(l => [{ time, action, ok }, ...l.slice(0, 19)])
  }

  async function doSync() {
    setSyncing(true)
    const { data, error } = await supabase.functions.invoke('quickfile', { body: { action: 'sync_all' } })
    if (error || !data?.ok) {
      addLog(`Sync failed: ${data?.error ?? error?.message}`, false)
    } else {
      const { synced, skipped, errors } = data
      if (synced > 0) addLog(`Synced ${synced} invoice(s) to QuickFile`, true)
      if (skipped > 0) addLog(`Skipped ${skipped} invoice(s) — no QF client linked`, false)
      errors?.forEach((e: string) => addLog(e, false))
      if (synced > 0) await fetchData()
    }
    setSyncing(false)
  }

  async function findClient(userId: string) {
    setLinkingUser(userId)
    const { data, error } = await supabase.functions.invoke('quickfile', { body: { action: 'find_client', user_id: userId } })
    if (error || !data?.ok) {
      addLog(`Client search failed: ${data?.error ?? error?.message}`, false)
      setLinkingUser(null)
      return
    }
    setFindResults(prev => ({ ...prev, [userId]: { clients: data.clients ?? [], open: true } }))
    setLinkingUser(null)
  }

  async function linkClient(userId: string, qfClientId: string, qfClientName: string) {
    const { data, error } = await supabase.functions.invoke('quickfile', {
      body: { action: 'link_client', user_id: userId, qf_client_id: qfClientId },
    })
    if (error || !data?.ok) {
      addLog(`Failed to link client: ${data?.error ?? error?.message}`, false)
      return
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, qf_client_id: qfClientId } : u))
    setFindResults(prev => ({ ...prev, [userId]: { ...prev[userId], open: false } }))
    addLog(`Linked ${qfClientName} to QF client #${qfClientId}`, true)
  }

  async function createClient(userId: string) {
    setLinkingUser(userId)
    const { data, error } = await supabase.functions.invoke('quickfile', { body: { action: 'create_client', user_id: userId } })
    if (error || !data?.ok) {
      addLog(`Failed to create QF client: ${data?.error ?? error?.message}`, false)
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, qf_client_id: data.qf_client_id } : u))
      const u = users.find(u => u.id === userId)
      addLog(`Created QF client for ${u?.group_name ?? u?.name} (ID: ${data.qf_client_id})`, true)
    }
    setFindResults(prev => ({ ...prev, [userId]: { ...prev[userId], open: false } }))
    setLinkingUser(null)
  }

  async function pullInvoices(userId: string) {
    setPullingUser(userId)
    const u = users.find(u => u.id === userId)
    const { data, error } = await supabase.functions.invoke('quickfile', { body: { action: 'pull_invoices', user_id: userId } })
    if (error || !data?.ok) {
      addLog(`Failed to pull invoices for ${u?.group_name ?? u?.name}: ${data?.error ?? error?.message}`, false)
    } else {
      addLog(`Pulled ${data.imported} invoice(s) for ${u?.group_name ?? u?.name} (${data.skipped} already existed)`, true)
      await fetchData()
    }
    setPullingUser(null)
  }

  const unsynced = invoices.filter(i => !i.qf_synced)

  const connColor = { checking: '#9ca3af', connected: '#4ade80', error: '#f87171', unconfigured: '#fbbf24' }[connStatus]
  const connLabel = { checking: 'Checking…', connected: 'Connected', error: 'Connection error', unconfigured: 'Not configured' }[connStatus]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
    <div>
      {/* Status card */}
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div className="qf-header">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px' }}>QuickFile</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Accounting integration</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: connColor, display: 'inline-block' }} />
              {connLabel}
            </span>
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
              onClick={testConnection}
            >
              Test
            </button>
            {connStatus === 'connected' && unsynced.length > 0 && (
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={doSync}
                disabled={syncing}
              >
                {syncing ? 'Syncing…' : `Sync now (${unsynced.length} pending)`}
              </button>
            )}
          </div>
        </div>

        {connStatus === 'error' && connError && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div className="notice notice-warn" style={{ marginBottom: 0 }}>
              <span>⚠️</span>
              <div>
                <strong>Could not connect to QuickFile</strong>
                <div style={{ fontSize: 12, marginTop: 4, fontFamily: 'monospace' }}>{connError}</div>
                <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>
                  Make sure you've run:<br />
                  <code style={{ fontSize: 11 }}>npx supabase secrets set QF_ACCOUNT_NUM=... QF_APP_ID=... QF_API_KEY=...</code><br />
                  <code style={{ fontSize: 11 }}>npx supabase functions deploy quickfile --no-verify-jwt</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {connStatus === 'unconfigured' && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div className="notice notice-warn" style={{ marginBottom: 0 }}>
              <span>⚙️</span>
              <div>
                <strong>Credentials not set</strong>
                <div style={{ fontSize: 12, marginTop: 4 }}>Run these commands in your terminal to connect QuickFile:</div>
                <pre style={{ fontSize: 11, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', marginTop: 8, overflowX: 'auto' }}>{`npx supabase secrets set QF_ACCOUNT_NUM=your_account_number
npx supabase secrets set QF_APP_ID=your_application_id
npx supabase secrets set QF_API_KEY=your_api_key

npx supabase functions deploy quickfile --no-verify-jwt`}</pre>
              </div>
            </div>
          </div>
        )}

        {connStatus === 'connected' && (
          <div style={{ padding: '12px 18px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Unsynced paid invoices', value: unsynced.filter(i => i.status === 'paid').length === 0 ? '✓ All synced' : `${unsynced.filter(i => i.status === 'paid').length} pending`, green: unsynced.filter(i => i.status === 'paid').length === 0 },
              { label: 'Awaiting payment', value: unsynced.filter(i => i.status !== 'paid').length },
              { label: 'Clients linked', value: `${users.filter(u => u.qf_client_id).length}/${users.length}` },
            ].map(({ label, value, green }) => (
              <div key={label} style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: green ? 'var(--green)' : 'var(--text)' }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Client links */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Regular Booker → QuickFile Client</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{users.filter(u => u.qf_client_id).length}/{users.length} linked</span>
        </div>
        {users.length === 0 && !loading && <div className="empty"><div className="empty-title">No regular bookers yet</div></div>}
        {users.map(u => {
          const results = findResults[u.id]
          return (
            <div key={u.id}>
              <div className="sync-row">
                <div style={{ width: 30, height: 30, background: (u.color ?? '#7c3aed') + '22', color: u.color ?? '#7c3aed', fontSize: 11, fontWeight: 700, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.group_name ?? u.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                </div>
                {u.qf_client_id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="badge badge-qf">🔗 #{u.qf_client_id}</span>
                    <span className="badge badge-approved">✓ Linked</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pullingUser === u.id || connStatus !== 'connected'}
                      onClick={() => pullInvoices(u.id)}
                    >
                      {pullingUser === u.id ? 'Pulling…' : '↓ Pull invoices'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={linkingUser === u.id || connStatus !== 'connected'}
                      onClick={() => findClient(u.id)}
                    >
                      {linkingUser === u.id ? 'Searching…' : 'Find in QF'}
                    </button>
                    <button
                      className="btn btn-qf btn-sm"
                      disabled={linkingUser === u.id || connStatus !== 'connected'}
                      onClick={() => createClient(u.id)}
                    >
                      Create in QF
                    </button>
                  </div>
                )}
              </div>

              {/* Search results dropdown */}
              {results?.open && (
                <div style={{ margin: '0 18px 10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {results.clients.length === 0 ? (
                    <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                      No matching clients found in QuickFile.
                      <button className="btn btn-qf btn-sm" style={{ marginLeft: 10 }} onClick={() => createClient(u.id)}>Create new client</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select matching client</div>
                      {results.clients.map((c: any) => (
                        <div key={c.ClientID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.CompanyName}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>QF #{c.ClientID}</div>
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => linkClient(u.id, String(c.ClientID), c.CompanyName)}>Link</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Invoices */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Invoices</span>
          {unsynced.length > 0 && <span className="badge badge-pending">{unsynced.length} unsynced</span>}
        </div>
        <div className="inv-row" style={{ background: 'var(--surface2)', fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', gridTemplateColumns: '1fr 1.4fr 1fr 0.8fr 0.8fr 1fr 90px' }}>
          <span>Invoice</span><span>Description</span><span>Group</span><span>Amount</span><span>Date</span><span>QF Status</span><span>Payment</span>
        </div>
        {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}
        {!loading && invoices.length === 0 && <div className="empty"><div className="empty-title">No invoices yet</div></div>}
        {invoices.map(inv => {
          const invUser = users.find(u => u.id === inv.user_id)
          return (
          <div key={inv.id} className="inv-row" style={{ gridTemplateColumns: '1fr 1.4fr 1fr 0.8fr 0.8fr 1fr 90px' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-text)', fontSize: 12 }}>{inv.id.slice(0, 8).toUpperCase()}</span>
            <span style={{ fontSize: 12 }}>{inv.description}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{invUser ? (invUser.group_name ?? invUser.name) : '—'}</span>
            <span style={{ fontWeight: 700 }}>{formatPence(inv.amount)}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{format(new Date(inv.date), 'dd MMM yy')}</span>
            <span>{inv.qf_synced ? <span className="badge badge-qf">🔗 {inv.qf_ref ?? 'Synced'}</span> : <span className="badge badge-pending">Not synced</span>}</span>
            <span><span className={`badge ${inv.status === 'paid' ? 'badge-approved' : 'badge-pending'}`}>{inv.status === 'paid' ? '✓ Paid' : '⏳ Due'}</span></span>
          </div>
          )
        })}
      </div>

    </div>

    {/* Right column: Sync log */}
    <div className="card" style={{ position: 'sticky', top: 16 }}>
      <div className="card-header"><span className="card-title">Sync Log</span></div>
      {syncLog.length === 0 ? (
        <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--text-muted)' }}>No activity yet this session</div>
      ) : syncLog.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 18px', borderBottom: i < syncLog.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <span style={{ fontSize: 13, flexShrink: 0, color: l.ok ? 'var(--green)' : '#ef4444' }}>{l.ok ? '✓' : '✗'}</span>
          <div>
            <div style={{ fontSize: 12 }}>{l.action}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{l.time}</div>
          </div>
        </div>
      ))}
    </div>
    </div>
  )
}
