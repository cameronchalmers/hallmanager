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

async function updateUser(userId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('update-user', {
    body: { user_id: userId, updates },
  })
  // Function always returns 200 now, so error only fires on network failure
  if (error) throw new Error(error.message ?? 'Save failed')
  if (data?.ok === false) throw new Error(data.error ?? 'Save failed')
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
  const [resetStatus, setResetStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [addError, setAddError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  function applyLocal(userId: string, patch: Partial<AppUser>) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u))
    setSelUser(u => u?.id === userId ? { ...u, ...patch } : u)
  }

  async function toggleSite(userId: string, siteId: string) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    const site_ids = user.site_ids?.includes(siteId)
      ? user.site_ids.filter(id => id !== siteId)
      : [...(user.site_ids ?? []), siteId]
    applyLocal(userId, { site_ids })
    try {
      await updateUser(userId, { site_ids })
      setSaveError(null)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
      applyLocal(userId, { site_ids: user.site_ids }) // revert
    }
  }

  async function saveRole(userId: string, role: string) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    applyLocal(userId, { role: role as AppUser['role'] })
    try {
      await updateUser(userId, { role })
      setSaveError(null)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
      applyLocal(userId, { role: user.role }) // revert
    }
  }

  async function saveGroupName(userId: string, group_name: string) {
    const val = group_name.trim() || null
    applyLocal(userId, { group_name: val })
    try {
      await updateUser(userId, { group_name: val })
      setSaveError(null)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function saveCustomRate(userId: string, siteId: string, rate: number) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    const custom_rates = { ...(user.custom_rates ?? {}), [siteId]: rate }
    applyLocal(userId, { custom_rates })
    try {
      await updateUser(userId, { custom_rates })
      setSaveError(null)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function sendInvite(email: string, userId: string) {
    setInviteStatus(s => ({ ...s, [userId]: 'sending' }))
    const { error } = await supabase.functions.invoke('invite-user', { body: { email } })
    setInviteStatus(s => ({ ...s, [userId]: error ? 'error' : 'sent' }))
  }

  async function sendPasswordReset(email: string, name: string) {
    setResetStatus('sending')
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email, name, reset: true },
    })
    setResetStatus(error ? 'error' : 'sent')
  }

  async function deleteUser(userId: string) {
    setDeleting(true)
    await supabase.functions.invoke('delete-user', { body: { user_id: userId } })
    setUsers(prev => prev.filter(u => u.id !== userId))
    setSelUser(null)
    setConfirmDelete(false)
    setDeleting(false)
  }

  async function addUser() {
    setSaving(true)
    setAddError(null)
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: newUser.email, name: newUser.name, role: newUser.role },
    })
    if (error || data?.error) {
      setAddError(data?.error ?? error?.message ?? 'Failed to add user')
      setSaving(false)
      return
    }
    await fetchData()
    setShowAdd(false)
    setNewUser({ name: '', email: '', role: 'manager' })
    setSaving(false)
  }

  const filtered = tab === 'all' ? users : users.filter(u => u.role === tab)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface2)', padding: 3, borderRadius: 8 }}>
          {['all', 'admin', 'manager', 'regular'].map(t => (
            <button
              key={t}
              className="btn btn-sm"
              style={{ background: tab === t ? 'var(--surface)' : 'transparent', color: tab === t ? 'var(--text)' : 'var(--text-muted)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', border: 'none' }}
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
            <div key={u.id} className="users-row" style={{ cursor: 'pointer' }} onClick={() => { setSelUser(u); setResetStatus('idle'); setSaveError(null); setConfirmDelete(false) }}>
              <div style={{ width: 32, height: 32, background: (u.color ?? '#7c3aed') + '22', color: u.color ?? '#7c3aed', borderRadius: '50%', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                {u.group_name && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-text)' }}>{u.group_name}</div>}
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
            <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setAddError(null) }}>Cancel</button>
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
        {addError && <div className="notice notice-warn" style={{ marginTop: 4 }}>✗ {addError}</div>}
        <div className="notice notice-accent" style={{ marginTop: 4 }}>
          An invite email will be sent immediately so they can set a password and access the portal.
        </div>
      </Modal>

      {/* User detail modal */}
      <Modal
        open={!!selUser}
        onClose={() => { setSelUser(null); setConfirmDelete(false); setSaveError(null) }}
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
                  onClick={() => sendPasswordReset(selUser.email, selUser.name)}
                >
                  {resetStatus === 'sending' ? 'Sending…'
                    : resetStatus === 'sent' ? '✓ Reset sent'
                    : resetStatus === 'error' ? '✗ Failed'
                    : 'Reset Password'}
                </button>
                {!confirmDelete
                  ? <button className="btn btn-sm" style={{ color: '#ef4444', border: '1px solid #ef4444', background: 'transparent' }} onClick={() => setConfirmDelete(true)}>Delete User</button>
                  : <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff', border: 'none' }} disabled={deleting} onClick={() => deleteUser(selUser.id)}>{deleting ? 'Deleting…' : 'Confirm Delete'}</button>
                }
              </div>
            </div>

            {confirmDelete && (
              <div className="notice notice-warn" style={{ marginBottom: 12 }}>
                This will permanently delete <strong>{selUser.name}</strong> and remove their login access. Their bookings will remain.{' '}
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', padding: 0, fontSize: 'inherit' }} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            )}

            {saveError && (
              <div className="notice notice-warn" style={{ marginBottom: 12 }}>✗ {saveError}</div>
            )}

            {/* Role */}
            <div style={{ marginBottom: 14 }}>
              <div className="sec-label" style={{ marginBottom: 6 }}>Role</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['admin', 'manager', 'regular'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => saveRole(selUser.id, r)}
                    style={{
                      padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${selUser.role === r ? 'var(--accent)' : 'var(--border)'}`,
                      background: selUser.role === r ? 'var(--accent-light)' : 'var(--surface2)',
                      color: selUser.role === r ? 'var(--accent-text)' : 'var(--text-muted)',
                    }}
                  >
                    {r === 'admin' ? 'Admin' : r === 'manager' ? 'Manager' : 'Regular Booker'}
                  </button>
                ))}
              </div>
            </div>

            {/* Group name — regular bookers only */}
            {selUser.role === 'regular' && (
              <div style={{ marginBottom: 14 }}>
                <div className="sec-label" style={{ marginBottom: 6 }}>Group Name <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(shown in portal instead of personal name)</span></div>
                <input
                  key={selUser.id}
                  className="form-input"
                  defaultValue={selUser.group_name ?? ''}
                  placeholder="e.g. Westside Yoga, Newcastle FC U12s…"
                  style={{ maxWidth: 320 }}
                  onBlur={e => saveGroupName(selUser.id, e.target.value)}
                />
              </div>
            )}

            {/* Sites */}
            <div style={{ marginBottom: 14 }}>
              <div className="sec-label" style={{ marginBottom: 6 }}>Sites</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sites.map(s => {
                  const assigned = selUser.site_ids?.includes(s.id)
                  return (
                    <button key={s.id} onClick={() => toggleSite(selUser.id, s.id)}
                      style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${assigned ? 'var(--accent)' : 'var(--border)'}`, background: assigned ? 'var(--accent-light)' : 'var(--surface2)', color: assigned ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                      {s.emoji} {s.name}
                    </button>
                  )
                })}
                {sites.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No sites exist yet</span>}
              </div>
            </div>

            {selUser.role === 'regular' && (
              <>
                <div className="sec-label" style={{ marginBottom: 7 }}>Custom Rates per Site</div>
                <div className="card" style={{ marginBottom: 14 }}>
                  {sites.map((s, i) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < sites.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                      <span style={{ flex: 1 }}>{s.emoji} {s.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Standard £{s.rate}/hr</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)' }}>Custom:</span>
                        <input
                          key={selUser.id + s.id}
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
                    <div key={b.id} style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{b.event}</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: 1 }}>{b.date} · {b.start_time}–{b.end_time}</div>
                      </div>
                      <span className={`badge ${
                        b.status === 'confirmed' ? 'badge-approved'
                        : b.status === 'approved' ? 'badge-pending'
                        : b.status === 'denied' ? 'badge-denied'
                        : b.status === 'cancelled' ? 'badge-denied'
                        : 'badge-pending'
                      }`}>
                        {b.status === 'confirmed' ? '✓ Confirmed'
                          : b.status === 'approved' ? '💳 Awaiting payment'
                          : b.status === 'denied' ? '✗ Denied'
                          : b.status === 'cancelled' ? 'Cancelled'
                          : '⏳ Pending'}
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
