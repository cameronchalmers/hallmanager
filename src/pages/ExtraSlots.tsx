import { useEffect, useState } from 'react'
import { Check, X, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ExtraSlot } from '../lib/database.types'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { format } from 'date-fns'

export default function ExtraSlots() {
  const [slots, setSlots] = useState<ExtraSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { fetchSlots() }, [])

  async function fetchSlots() {
    setLoading(true)
    const { data } = await supabase.from('extra_slots').select('*').order('created_at', { ascending: false })
    setSlots(data ?? [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: 'approved' | 'denied') {
    await supabase.from('extra_slots').update({ status }).eq('id', id)
    setSlots(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  const filtered = slots.filter(s => {
    const matchSearch = !search || [s.name, s.reason].some(f => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Extra Slot Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">One-off additional booking requests from regular bookers</p>
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, reason..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-200"
          >
            {['all', 'pending', 'approved', 'denied'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Requester', 'Date', 'Time', 'Hours', 'Rate', 'Total', 'Reason', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No requests found</td></tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{format(new Date(s.date), 'dd MMM yy')}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.start_time}–{s.end_time}</td>
                  <td className="px-4 py-3 text-gray-600">{s.hours}h</td>
                  <td className="px-4 py-3 text-gray-600">£{s.rate}/h</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">£{s.total}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{s.reason}</td>
                  <td className="px-4 py-3"><Badge status={s.status} /></td>
                  <td className="px-4 py-3">
                    {s.status === 'pending' && (
                      <div className="flex gap-1.5">
                        <button onClick={() => updateStatus(s.id, 'approved')} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors" title="Approve">
                          <Check size={13} />
                        </button>
                        <button onClick={() => updateStatus(s.id, 'denied')} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Deny">
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
