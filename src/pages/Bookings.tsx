import { useEffect, useState } from 'react'
import { Check, X, Search, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Booking, Site } from '../lib/database.types'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { format } from 'date-fns'

type BookingWithSite = Booking & { sites?: Site }

export default function Bookings() {
  const [bookings, setBookings] = useState<BookingWithSite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<BookingWithSite | null>(null)

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    setLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('*, sites(*)')
      .order('date', { ascending: false })
    setBookings((data ?? []) as BookingWithSite[])
    setLoading(false)
  }

  async function updateStatus(id: string, status: Booking['status']) {
    await supabase.from('bookings').update({ status }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
  }

  const filtered = bookings.filter(b => {
    const matchSearch = !search || [b.name, b.email, b.event, b.phone].some(f => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || b.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-sm text-gray-500 mt-0.5">{bookings.length} total bookings</p>
        </div>
      </div>

      <Card>
        {/* Filters */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, email, event..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-200"
            >
              {['all', 'pending', 'confirmed', 'denied', 'cancelled'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Name', 'Event', 'Date', 'Time', 'Site', 'Hours', 'Total', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No bookings found</td></tr>
              )}
              {filtered.map(b => (
                <tr
                  key={b.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelected(b)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{b.name}</p>
                    <p className="text-xs text-gray-400">{b.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.event}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{format(new Date(b.date), 'dd MMM yy')}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.start_time}–{b.end_time}</td>
                  <td className="px-4 py-3 text-gray-600">{b.sites?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.hours}h</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">£{b.total}</td>
                  <td className="px-4 py-3"><Badge status={b.status} /></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5">
                      {b.status === 'pending' && (
                        <>
                          <button onClick={() => updateStatus(b.id, 'confirmed')} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors" title="Approve">
                            <Check size={13} />
                          </button>
                          <button onClick={() => updateStatus(b.id, 'denied')} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Deny">
                            <X size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Booking Detail" size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Name', value: selected.name },
                { label: 'Email', value: selected.email },
                { label: 'Phone', value: selected.phone },
                { label: 'Type', value: selected.type },
                { label: 'Event', value: selected.event },
                { label: 'Date', value: format(new Date(selected.date), 'dd MMMM yyyy') },
                { label: 'Time', value: `${selected.start_time} – ${selected.end_time}` },
                { label: 'Hours', value: `${selected.hours}h` },
                { label: 'Site', value: selected.sites?.name ?? selected.site_id },
                { label: 'Deposit', value: `£${selected.deposit}` },
                { label: 'Total', value: `£${selected.total}` },
                { label: 'Recurrence', value: selected.recurrence ?? 'None' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                  <p className="text-sm text-gray-900 mt-1 font-medium">{value}</p>
                </div>
              ))}
            </div>

            {selected.notes && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selected.notes}</p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Badge status={selected.status} />
              {selected.status === 'pending' && (
                <>
                  <Button variant="success" size="sm" onClick={() => updateStatus(selected.id, 'confirmed')}>
                    <Check size={14} /> Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => updateStatus(selected.id, 'denied')}>
                    <X size={14} /> Deny
                  </Button>
                </>
              )}
              {selected.status === 'confirmed' && (
                <Button variant="secondary" size="sm" onClick={() => updateStatus(selected.id, 'cancelled')}>
                  Cancel Booking
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
