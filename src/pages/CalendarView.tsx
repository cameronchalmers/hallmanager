import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameDay, addMonths, subMonths, getDay } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Booking } from '../lib/database.types'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { useTheme } from '../context/ThemeContext'

export default function CalendarView() {
  const { accent } = useTheme()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => { fetchMonth() }, [currentDate])

  async function fetchMonth() {
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('status', 'confirmed')
      .gte('date', start)
      .lte('date', end)
    setBookings(data ?? [])
  }

  const days = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) })
  const startPad = getDay(startOfMonth(currentDate)) // 0=Sun
  const paddedStart = startPad === 0 ? 6 : startPad - 1 // Mon-first

  const bookingsForDate = (date: Date) => bookings.filter(b => isSameDay(new Date(b.date), date))
  const selectedBookings = selectedDate ? bookingsForDate(selectedDate) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-0.5">Confirmed bookings at a glance</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{format(currentDate, 'MMMM yyyy')}</h2>
            <div className="flex gap-1">
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Today
              </button>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: paddedStart }).map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}
              {days.map(day => {
                const dayBookings = bookingsForDate(day)
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const todayDay = isToday(day)

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-start pt-2 text-sm transition-all hover:bg-gray-50 ${
                      isSelected ? 'ring-2 ring-offset-1 ring-purple-500' : ''
                    }`}
                  >
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium ${
                      todayDay ? 'text-white' : 'text-gray-700'
                    }`} style={todayDay ? { backgroundColor: accent } : undefined}>
                      {format(day, 'd')}
                    </span>
                    {dayBookings.length > 0 && (
                      <div className="flex gap-0.5 mt-1">
                        {dayBookings.slice(0, 3).map((_, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                        ))}
                        {dayBookings.length > 3 && <span className="text-xs" style={{ color: accent }}>+</span>}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        {/* Sidebar */}
        <Card>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              {selectedDate ? format(selectedDate, 'EEEE, d MMMM') : 'Select a date'}
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {!selectedDate && (
              <p className="text-sm text-gray-400 text-center py-8">Click a date to see its bookings</p>
            )}
            {selectedDate && selectedBookings.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No confirmed bookings on this date</p>
            )}
            {selectedBookings.map(b => (
              <div key={b.id} className="rounded-xl border border-gray-100 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{b.name}</p>
                  <Badge status="confirmed" />
                </div>
                <p className="text-xs text-gray-600 font-medium">{b.event}</p>
                <p className="text-xs text-gray-500">{b.start_time} – {b.end_time} · {b.hours}h</p>
                <p className="text-xs font-semibold text-gray-700">£{b.total}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
