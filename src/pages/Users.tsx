import { useEffect, useState } from 'react'
import { Edit2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AppUser, Site } from '../lib/database.types'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'

type Role = 'admin' | 'manager' | 'regular'

const ROLES: Role[] = ['admin', 'manager', 'regular']
const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-purple-50 text-purple-700 border-purple-200',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  regular: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function Users() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<AppUser>>({})

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [userRes, siteRes] = await Promise.all([
      supabase.from('users').select('*').order('role'),
      supabase.from('sites').select('*'),
    ])
    setUsers((userRes.data ?? []) as unknown as AppUser[])
    setSites(siteRes.data ?? [])
    setLoading(false)
  }

  function openEdit(u: AppUser) {
    setEditing(u)
    setForm({ ...u })
  }

  async function saveUser() {
    if (!editing) return
    setSaving(true)
    const { custom_rates, site_ids, role, name, email, color } = form
    await supabase.from('users').update({ custom_rates, site_ids, role, name, email, color }).eq('id', editing.id)
    setUsers(prev => prev.map(u => u.id === editing.id ? { ...u, ...form } as AppUser : u))
    setEditing(null)
    setSaving(false)
  }

  const byRole = (role: Role) => users.filter(u => u.role === role)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users & Access</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} users across all roles</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        ROLES.map(role => (
          <Card key={role}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <h2 className="font-semibold text-gray-900 capitalize">{role}s</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role]}`}>
                {byRole(role).length}
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {byRole(role).length === 0 && (
                <p className="px-5 py-6 text-sm text-gray-400">No {role}s yet</p>
              )}
              {byRole(role).map(u => (
                <div key={u.id} className="px-5 py-4 flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                    style={{ backgroundColor: u.color ?? '#7c3aed' }}
                  >
                    {u.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                  {role === 'regular' && u.site_ids && u.site_ids.length > 0 && (
                    <div className="hidden md:flex gap-1.5">
                      {u.site_ids.slice(0, 3).map(sId => {
                        const site = sites.find(s => s.id === sId)
                        return site ? (
                          <span key={sId} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                            {site.emoji} {site.name}
                          </span>
                        ) : null
                      })}
                      {u.site_ids.length > 3 && <span className="text-xs text-gray-400">+{u.site_ids.length - 3}</span>}
                    </div>
                  )}
                  {u.custom_rates && Object.keys(u.custom_rates).length > 0 && (
                    <span className="hidden md:inline text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Custom rates</span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                    <Edit2 size={13} />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit User — ${editing?.name}`} size="lg">
        {editing && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input label="Email" type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Role</label>
                <select
                  value={form.role ?? 'regular'}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <Input label="Accent colour" type="color" value={form.color ?? '#7c3aed'} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Linked Sites</p>
              <div className="flex flex-wrap gap-2">
                {sites.map(s => {
                  const linked = (form.site_ids ?? []).includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => setForm(f => ({
                        ...f,
                        site_ids: linked
                          ? (f.site_ids ?? []).filter(id => id !== s.id)
                          : [...(f.site_ids ?? []), s.id]
                      }))}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                        linked ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {s.emoji} {s.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Custom Rates (£/hr per site)</p>
              <div className="space-y-2">
                {sites.map(s => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 flex-1">{s.emoji} {s.name} <span className="text-gray-400">(default £{s.rate}/h)</span></span>
                    <input
                      type="number"
                      placeholder={String(s.rate)}
                      value={(form.custom_rates as Record<string, number>)?.[s.id] ?? ''}
                      onChange={e => setForm(f => ({
                        ...f,
                        custom_rates: {
                          ...(f.custom_rates as Record<string, number> ?? {}),
                          [s.id]: Number(e.target.value)
                        }
                      }))}
                      className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={saveUser} loading={saving}>Save Changes</Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
