import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppUser, Booking, Site } from '../lib/database.types'
import Modal from '../components/ui/Modal'

function RoleBadge({ role }: { role: string }) {
  const m: Record<string, [string, string]> = {
    admin: ['role-admin', 'Admin'],
    manager: ['role-manager', 'Manager'],
    viewer: ['role-viewer', 'Viewer'],
    regular: ['role-regular', 'Regular Booker'],
  }
  const [cls, lbl] = m[role] ?? ['role-viewer', role]
  return <span className={`badge ${cls}`}>{lbl}</span>
}

export default function Users() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [selUser, setSelUser] = useState<AppUser | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'manager' })
  const [saving, setSaving] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
  const [resetStatus, setResetStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [uRes, sRes, bRes] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('sites').select('*'),
      supabase.from('bookings').select('*'),
    ])
    setUsers((uRes.data ?? []) as unknown as AppUser[])
    setSites(sRes.data ?? [])
    setBookings(bRes.data ?? [])
    setLoading(false)
  }

  async function saveCustomRate(userId: string, siteId: string, rate: number) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    const custom_rates = { ...(user.custom_rates ?? {}), [siteId]: rate }
    await supabase.from('users').update({ custom_rates }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, custom_rates } : u))
    if (selUser?.id === userId) setSelUser(u => u ? { ...u, custom_rates } : null)
  }

  async function sendInvite(email: string, userId: string) {
    setInviteStatus(s => ({ ...s, [userId]: 'sending' }))
    const { error } = await supabase.functions.invoke('invite-user', { body: { email } })
    setInviteStatus(s => ({ ...s, [userId]: error ? 'error' : 'sent' }))
  }

  async function sendPasswordReset(email: string) {
    setResetStatus('sending')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setResetStatus(error ? 'error' : 'sent')
  }

  async function addUser() {
    setSaving(true)
    await supabase.from('users').insert({ ...newUser, site_ids: [], custom_rates: null })
    await fetchData()
    setShowAdd(false)
    setNewUser({ name: '', email: '', role: 'manager' })
    setSaving(false)
  }

  const filtered = tab === 'all' ? users : users.filter(u => u.role === tab)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 2, background: '#f4f4f6', padding: 3, borderRadius: 8 }}>
          {['all', 'admin', 'manager', 'regular'].map(t => (
            <button
              key={t}
              className="btn btn-sm"
              style={{ background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--text)' : 'var(--text-muted)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', border: 'none' }}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add User</button>
      </div>

      <div className="card">
        {loading && <div className="empty"><div className="empty-title">Loading…</div></div>}
        {filtered.map(u => {
          const ub = bookings.filter(b => b.user_id === u.id)
          return (
            <div key={u.id} className="users-row" style={{ cursor: 'pointer' }} onClick={() => { setSelUser(u); setResetStatus('idle') }}>
              <div style={{ width: 32, height: 32, background: (u.color ?? '#7c3aed') + '22', color: u.color ?? '#7c3aed', borderRadius: '50%', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <RoleBadge role={u.role} />
                {u.qf_client_id && <span className="badge badge-qf" style={{ fontSize: 10 }}>🔗 {u.qf_client_id}</span>}
                {u.role === 'regular' && <span className="badge badge-accent">{ub.length} bookings</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', minWidth: 110 }}>
                {u.site_ids?.length === sites.length ? 'All sites' : sites.filter(s => u.site_ids?.includes(s.id)).map(s => s.name.split(' ')[0]).join(', ') || 'No sites'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add user modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add User"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={addUser} disabled={saving || !newUser.name || !newUser.email}>
              {saving ? 'Adding…' : 'Add User'}
            </button>
          </>
        }
      >
        <div className="form-grid-2">
          <div><label className="form-label">Full Name</label><input className="form-input" value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} placeholder="Jane Smith" /></div>
          <div><label className="form-label">Email</label><input className="form-input" type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} placeholder="jane@example.com" /></div>
        </div>
        <div className="form-row">
          <label className="form-label">Role</label>
          <select className="form-input" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
            <option value="admin">Admin — full access to all sites</option>
            <option value="manager">Manager — manage assigned sites</option>
            <option value="regular">Regular Booker — portal access, extra slot requests</option>
          </select>
        </div>
        <div className="notice notice-accent" style={{ marginTop: 4 }}>
          After adding the user, open their profile and click <strong>Send Invite Email</strong> to let them set a password and access the portal.
        </div>
      </Modal>

      {/* User detail modal */}
      <Modal
        open={!!selUser}
        onClose={() => setSelUser(null)}
        title={selUser?.name ?? ''}
        sub={selUser?.email}
        wide
      >
        {selUser && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, fontSize: 15, background: (selUser.color ?? '#7c3aed') + '22', color: selUser.color ?? '#7c3aed', borderRadius: '50%', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selUser.name}</div>
                <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <RoleBadge role={selUser.role} />
                  {selUser.qf_client_id && <span className="badge badge-qf">🔗 {selUser.qf_client_id}</span>}
                </div>
              </div>
              {/* Auth actions */}
              <div style={{ display: 'flex', gap: 7, flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={inviteStatus[selUser.id] === 'sending'}
                  onClick={() => sendInvite(selUser.email, selUser.id)}
                >
                  {inviteStatus[selUser.id] === 'sending' ? 'Sending…'
                    : inviteStatus[selUser.id] === 'sent' ? '✓ Invite sent'
                    : inviteStatus[selUser.id] === 'error' ? '✗ Failed — retry'
                    : '✉ Send Invite Email'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={resetStatus === 'sending'}
                  onClick={() => sendPasswordReset(selUser.email)}
                >
                  {resetStatus === 'sending' ? 'Sending…'
                    : resetStatus === 'sent' ? '✓ Reset sent'
                    : resetStatus === 'error' ? '✗ Failed'
                    : 'Reset Password'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {sites.filter(s => selUser.site_ids?.includes(s.id)).map(s => (
                <span key={s.id} className="badge badge-accent">{s.emoji} {s.name}</span>
              ))}
              {(!selUser.site_ids || selUser.site_ids.length === 0) && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No sites assigned</span>
              )}
            </div>

            {selUser.role === 'regular' && (
              <>
                <div className="sec-label" style={{ marginBottom: 7 }}>Custom Rates per Site</div>
                <div className="card" style={{ marginBottom: 14 }}>
                  {sites.map((s, i) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < sites.length - 1 ? '1px solid #f4f4f6' : 'none', fontSize: 13 }}>
                      <span style={{ flex: 1 }}>{s.emoji} {s.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Standard £{s.rate}/hr</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)' }}>Custom:</span>
                        <input
                          className="form-input"
                          type="number"
                          defaultValue={selUser.custom_rates?.[s.id] ?? ''}
                          placeholder={String(s.rate)}
                          style={{ width: 65, padding: '4px 7px', fontSize: 12 }}
                          onBlur={e => { if (e.target.value) saveCustomRate(selUser.id, s.id, Number(e.target.value)) }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/hr</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sec-label" style={{ marginBottom: 7 }}>Linked Bookings</div>
                <div className="card">
                  {bookings.filter(b => b.user_id === selUser.id).length === 0 && (
                    <div className="empty" style={{ padding: 20 }}><div className="empty-title">No linked bookings</div></div>
                  )}
                  {bookings.filter(b => b.user_id === selUser.id).map(b => (
                    <div key={b.id} style={{ padding: '9px 14px', borderBottom: '1px solid #f4f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{b.event}</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: 1 }}>{b.date} · {b.start_time}–{b.end_time}</div>
                      </div>
                      <span className={`badge ${b.status === 'confirmed' ? 'badge-approved' : b.status === 'denied' ? 'badge-denied' : 'badge-pending'}`}>
                        {b.status === 'confirmed' ? '✓ Approved' : b.status === 'denied' ? '✗ Denied' : '⏳ Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
