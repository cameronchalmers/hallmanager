import { useEffect, useState } from 'react'
import { BookOpen, Clock, DollarSign, Building2, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Booking, ExtraSlot, Site } from '../lib/database.types'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { format } from 'date-fns'

interface Stats {
  pendingBookings: number
  pendingSlots: number
  revenue: number
  activeSites: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ pendingBookings: 0, pendingSlots: 0, revenue: 0, activeSites: 0 })
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([])
  const [pendingSlots, setPendingSlots] = useState<ExtraSlot[]>([])
  const [upcoming, setUpcoming] = useState<(Booking & { site?: Site })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [bookingsRes, slotsRes, confirmedRes, sitesRes, revenueRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
      supabase.from('extra_slots').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
      supabase.from('bookings').select('*, sites(*)').eq('status', 'confirmed').gte('date', today).order('date').limit(5),
      supabase.from('sites').select('*'),
      supabase.from('bookings').select('total').eq('status', 'confirmed'),
    ])

    setPendingBookings(bookingsRes.data ?? [])
    setPendingSlots(slotsRes.data ?? [])
    setUpcoming((confirmedRes.data ?? []) as (Booking & { site?: Site })[])
    const revenue = (revenueRes.data ?? []).reduce((sum, b) => sum + (b.total ?? 0), 0)

    setStats({
      pendingBookings: bookingsRes.data?.length ?? 0,
      pendingSlots: slotsRes.data?.length ?? 0,
      revenue,
      activeSites: sitesRes.data?.length ?? 0,
    })
    setLoading(false)
  }

  async function updateBooking(id: string, status: 'confirmed' | 'denied') {
    await supabase.from('bookings').update({ status }).eq('id', id)
    setPendingBookings(prev => prev.filter(b => b.id !== id))
    setStats(s => ({ ...s, pendingBookings: s.pendingBookings - 1 }))
  }

  async function updateSlot(id: string, status: 'approved' | 'denied') {
    await supabase.from('extra_slots').update({ status }).eq('id', id)
    setPendingSlots(prev => prev.filter(s => s.id !== id))
    setStats(s => ({ ...s, pendingSlots: s.pendingSlots - 1 }))
  }

  const statCards = [
    { label: 'Pending Bookings', value: stats.pendingBookings, icon: BookOpen, color: 'bg-amber-50 text-amber-600' },
    { label: 'Slot Requests', value: stats.pendingSlots, icon: Clock, color: 'bg-blue-50 text-blue-600' },
    { label: 'Total Revenue', value: `£${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Active Sites', value: stats.activeSites, icon: Building2, color: 'bg-purple-50 text-purple-600' },
  ]

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your venue management</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Bookings */}
        <Card>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Pending Bookings</h2>
            <Badge status="pending" label={`${stats.pendingBookings} pending`} />
          </div>
          <div className="divide-y divide-gray-50">
            {pendingBookings.length === 0 && (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No pending bookings</p>
            )}
            {pendingBookings.map(b => (
              <div key={b.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.name}</p>
                  <p className="text-xs text-gray-500">{b.event} · {b.date}</p>
                </div>
                <span className="text-sm font-semibold text-gray-700">£{b.total}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => updateBooking(b.id, 'confirmed')}
                    className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                    title="Approve"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => updateBooking(b.id, 'denied')}
                    className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                    title="Deny"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Pending Extra Slots */}
        <Card>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Extra Slot Requests</h2>
            <Badge status="pending" label={`${stats.pendingSlots} pending`} />
          </div>
          <div className="divide-y divide-gray-50">
            {pendingSlots.length === 0 && (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No pending requests</p>
            )}
            {pendingSlots.map(s => (
              <div key={s.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.date} · {s.reason}</p>
                </div>
                <span className="text-sm font-semibold text-gray-700">£{s.total}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => updateSlot(s.id, 'approved')}
                    className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => updateSlot(s.id, 'denied')}
                    className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Upcoming confirmed */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Upcoming Confirmed Bookings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Name', 'Event', 'Date', 'Time', 'Site', 'Total', 'Status'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {upcoming.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-400">No upcoming bookings</td>
                </tr>
              )}
              {upcoming.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{b.name}</td>
                  <td className="px-5 py-3 text-gray-600">{b.event}</td>
                  <td className="px-5 py-3 text-gray-600">{format(new Date(b.date), 'dd MMM yyyy')}</td>
                  <td className="px-5 py-3 text-gray-600">{b.start_time} – {b.end_time}</td>
                  <td className="px-5 py-3 text-gray-600">{(b as Booking & { sites?: { name: string } }).sites?.name ?? b.site_id}</td>
                  <td className="px-5 py-3 font-semibold text-gray-900">£{b.total}</td>
                  <td className="px-5 py-3"><Badge status="confirmed" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
