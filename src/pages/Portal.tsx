import { useEffect, useState } from 'react'
import { BookOpen, Clock, FileText, DollarSign, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Booking, ExtraSlot, Invoice, Site } from '../lib/database.types'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import { format } from 'date-fns'

type Tab = 'bookings' | 'slots' | 'invoices' | 'pricing'

export default function Portal() {
  const { user, profile } = useAuth()
  const { accent } = useTheme()
  const [tab, setTab] = useState<Tab>('bookings')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [slots, setSlots] = useState<ExtraSlot[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showRequest, setShowRequest] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slotForm, setSlotForm] = useState({
    site_id: '',
    date: '',
    start_time: '',
    end_time: '',
    hours: '',
    reason: '',
  })

  useEffect(() => { if (user) fetchData() }, [user])

  async function fetchData() {
    setLoading(true)
    const [bRes, sRes, iRes, sitesRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
      supabase.from('extra_slots').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
      supabase.from('invoices').select('*').eq('user_id', user!.id).order('date', { ascending: false }),
      supabase.from('sites').select('*'),
    ])
    setBookings(bRes.data ?? [])
    setSlots(sRes.data ?? [])
    setInvoices(iRes.data ?? [])
    setSites(sitesRes.data ?? [])
    setLoading(false)
  }

  async function submitSlotRequest() {
    if (!user || !profile) return
    setSaving(true)
    const site = sites.find(s => s.id === slotForm.site_id)
    const rate = (profile.custom_rates as Record<string, number>)?.[slotForm.site_id] ?? site?.rate ?? 0
    const hours = parseFloat(slotForm.hours)
    await supabase.from('extra_slots').insert({
      user_id: user.id,
      name: profile.name,
      site_id: slotForm.site_id,
      date: slotForm.date,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time,
      hours,
      reason: slotForm.reason,
      status: 'pending',
      rate,
      total: rate * hours,
    })
    await fetchData()
    setShowRequest(false)
    setSlotForm({ site_id: '', date: '', start_time: '', end_time: '', hours: '', reason: '' })
    setSaving(false)
  }

  const mySites = sites.filter(s => (profile?.site_ids ?? []).includes(s.id))
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length
  const totalSpend = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'bookings', label: 'My Bookings', icon: BookOpen },
    { key: 'slots', label: 'Extra Slots', icon: Clock },
    { key: 'invoices', label: 'Invoices', icon: FileText },
    { key: 'pricing', label: 'My Pricing', icon: DollarSign },
  ]

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="p-6" style={{ background: `linear-gradient(135deg, ${accent}15, ${accent}05)` }}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {profile?.name?.split(' ')[0] ?? 'there'} 👋</h1>
            <p className="text-sm text-gray-500 mt-1">Your booker portal — manage your sessions and requests</p>
          </div>
          <Button onClick={() => setShowRequest(true)}>
            <Plus size={15} />
            Request Extra Slot
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {[
            { label: 'Total Bookings', value: bookings.length },
            { label: 'Confirmed', value: confirmedBookings },
            { label: 'Extra Slots', value: slots.length },
            { label: 'Total Spend', value: `£${totalSpend.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={tab === key ? { color: accent, borderColor: accent } : undefined}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <>
          {tab === 'bookings' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Event', 'Date', 'Time', 'Hours', 'Total', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bookings.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No bookings found</td></tr>
                    )}
                    {bookings.map(b => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{b.event}</td>
                        <td className="px-4 py-3 text-gray-600">{format(new Date(b.date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3 text-gray-600">{b.start_time}–{b.end_time}</td>
                        <td className="px-4 py-3 text-gray-600">{b.hours}h</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">£{b.total}</td>
                        <td className="px-4 py-3"><Badge status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'slots' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Date', 'Time', 'Hours', 'Reason', 'Total', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {slots.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No extra slot requests</td></tr>
                    )}
                    {slots.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">{format(new Date(s.date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3 text-gray-600">{s.start_time}–{s.end_time}</td>
                        <td className="px-4 py-3 text-gray-600">{s.hours}h</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{s.reason}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">£{s.total}</td>
                        <td className="px-4 py-3"><Badge status={s.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'invoices' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Description', 'Date', 'Amount', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoices.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No invoices</td></tr>
                    )}
                    {invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{inv.description}</td>
                        <td className="px-4 py-3 text-gray-600">{format(new Date(inv.date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">£{inv.amount}</td>
                        <td className="px-4 py-3"><Badge status={inv.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'pricing' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mySites.map(s => {
                const customRate = (profile?.custom_rates as Record<string, number>)?.[s.id]
                return (
                  <Card key={s.id} className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{s.emoji}</span>
                      <h3 className="font-semibold text-gray-900">{s.name}</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Standard rate</span>
                        <span className="font-medium text-gray-700">£{s.rate}/hr</span>
                      </div>
                      {customRate && (
                        <div className="flex justify-between">
                          <span className="text-purple-600">Your rate</span>
                          <span className="font-semibold" style={{ color: accent }}>£{customRate}/hr</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-500">Deposit</span>
                        <span className="font-medium text-gray-700">£{s.deposit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Capacity</span>
                        <span className="font-medium text-gray-700">{s.capacity} people</span>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Request Extra Slot Modal */}
      <Modal open={showRequest} onClose={() => setShowRequest(false)} title="Request Extra Slot" size="md">
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Site</label>
            <select
              value={slotForm.site_id}
              onChange={e => setSlotForm(f => ({ ...f, site_id: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
            >
              <option value="">Select site...</option>
              {mySites.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
            </select>
          </div>
          <Input label="Date" type="date" value={slotForm.date} onChange={e => setSlotForm(f => ({ ...f, date: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start time" type="time" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} />
            <Input label="End time" type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
          <Input label="Hours" type="number" min="0.5" step="0.5" value={slotForm.hours} onChange={e => setSlotForm(f => ({ ...f, hours: e.target.value }))} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Reason</label>
            <textarea
              rows={3}
              value={slotForm.reason}
              onChange={e => setSlotForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Why do you need this extra slot?"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={submitSlotRequest} loading={saving} disabled={!slotForm.site_id || !slotForm.date}>
              Submit Request
            </Button>
            <Button variant="secondary" onClick={() => setShowRequest(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
