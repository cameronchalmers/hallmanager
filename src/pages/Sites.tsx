import { useEffect, useState } from 'react'
import { Plus, Edit2, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Site } from '../lib/database.types'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import { useTheme } from '../context/ThemeContext'

const EMOJI_OPTIONS = ['🏛️', '🎭', '🏫', '⛪', '🏢', '🎪', '🏟️', '🏗️', '🎵', '🌿']

const DEFAULT_FORM = {
  name: '',
  address: '',
  capacity: 0,
  rate: 0,
  deposit: 0,
  emoji: '🏛️',
}

export default function Sites() {
  const { accent } = useTheme()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchSites() }, [])

  async function fetchSites() {
    setLoading(true)
    const { data } = await supabase.from('sites').select('*')
    setSites(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setShowModal(true)
  }

  function openEdit(site: Site) {
    setEditing(site)
    setForm({ name: site.name, address: site.address, capacity: site.capacity, rate: site.rate, deposit: site.deposit, emoji: site.emoji })
    setShowModal(true)
  }

  async function saveSite() {
    setSaving(true)
    if (editing) {
      await supabase.from('sites').update(form).eq('id', editing.id)
      setSites(prev => prev.map(s => s.id === editing.id ? { ...s, ...form } : s))
    } else {
      const { data } = await supabase.from('sites').insert(form).select().single()
      if (data) setSites(prev => [...prev, data])
    }
    setShowModal(false)
    setSaving(false)
  }

  const f = (key: keyof typeof form) => ({
    value: form[key] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [key]: key === 'capacity' || key === 'rate' || key === 'deposit' ? Number(e.target.value) : e.target.value }))
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites & Venues</h1>
          <p className="text-sm text-gray-500 mt-0.5">{sites.length} venues in your portfolio</p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={15} />
          Add Site
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sites.map(site => (
            <Card key={site.id} className="overflow-hidden group">
              <div className="h-16 flex items-center justify-center text-4xl" style={{ background: `linear-gradient(135deg, ${accent}20, ${accent}08)` }}>
                {site.emoji}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">{site.name}</h3>
                    <div className="flex items-center gap-1.5 text-gray-500 text-xs mt-1">
                      <MapPin size={11} />
                      <span>{site.address}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => openEdit(site)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-3 bg-gray-50 rounded-xl">
                    <p className="text-sm font-bold text-gray-900">£{site.rate}</p>
                    <p className="text-xs text-gray-500 mt-0.5">per hour</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-xl">
                    <p className="text-sm font-bold text-gray-900">£{site.deposit}</p>
                    <p className="text-xs text-gray-500 mt-0.5">deposit</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-xl">
                    <p className="text-sm font-bold text-gray-900">{site.capacity}</p>
                    <p className="text-xs text-gray-500 mt-0.5">capacity</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* Add site card */}
          <button
            onClick={openAdd}
            className="rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 p-8 text-gray-400 hover:border-purple-300 hover:text-purple-600 transition-all min-h-48"
          >
            <Plus size={24} />
            <span className="text-sm font-medium">Add new site</span>
          </button>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? `Edit ${editing.name}` : 'Add New Site'}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Emoji</p>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => setForm(f => ({ ...f, emoji: e }))}
                  className={`w-10 h-10 text-xl rounded-xl border-2 transition-all ${form.emoji === e ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <Input label="Site name" placeholder="e.g. The Grand Hall" {...f('name')} />
          <Input label="Address" placeholder="123 Example St, City" {...f('address')} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Capacity" type="number" min="1" {...f('capacity')} />
            <Input label="Rate (£/hr)" type="number" min="0" {...f('rate')} />
            <Input label="Deposit (£)" type="number" min="0" {...f('deposit')} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveSite} loading={saving} disabled={!form.name}>{editing ? 'Save Changes' : 'Add Site'}</Button>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
