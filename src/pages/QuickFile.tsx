import { useEffect, useState } from 'react'
import { FileText, RefreshCw, ExternalLink, CheckCircle, XCircle, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Invoice, AppUser } from '../lib/database.types'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { format } from 'date-fns'

export default function QuickFile() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [invRes, userRes] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*').not('qf_client_id', 'is', null),
    ])
    setInvoices(invRes.data ?? [])
    setUsers((userRes.data ?? []) as unknown as AppUser[])
    setLoading(false)
  }

  async function syncInvoice(id: string) {
    setSyncing(id)
    // Simulate sync — in production, call your QuickFile API integration
    await new Promise(r => setTimeout(r, 1200))
    await supabase.from('invoices').update({ qf_synced: true }).eq('id', id)
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, qf_synced: true } : inv))
    setSyncing(null)
  }

  const syncedCount = invoices.filter(i => i.qf_synced).length
  const totalAmount = invoices.reduce((sum, i) => sum + i.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QuickFile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Invoice sync and client management</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Invoices', value: invoices.length, icon: FileText, color: 'bg-purple-50 text-purple-600' },
          { label: 'Synced', value: syncedCount, icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Not Synced', value: invoices.length - syncedCount, icon: XCircle, color: 'bg-amber-50 text-amber-600' },
          { label: 'Total Value', value: `£${totalAmount.toLocaleString()}`, icon: Link2, color: 'bg-blue-50 text-blue-600' },
        ].map(({ label, value, icon: Icon, color }) => (
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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Invoices */}
        <Card className="lg:col-span-2">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Invoices</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Description', 'Amount', 'Date', 'Status', 'QF Ref', 'Synced', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                )}
                {!loading && invoices.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No invoices yet</td></tr>
                )}
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium max-w-xs truncate">{inv.description}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">£{inv.amount}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{format(new Date(inv.date), 'dd MMM yy')}</td>
                    <td className="px-4 py-3"><Badge status={inv.status} /></td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{inv.qf_ref ?? '—'}</td>
                    <td className="px-4 py-3">
                      {inv.qf_synced
                        ? <CheckCircle size={15} className="text-emerald-500" />
                        : <XCircle size={15} className="text-gray-300" />}
                    </td>
                    <td className="px-4 py-3">
                      {!inv.qf_synced && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={syncing === inv.id}
                          onClick={() => syncInvoice(inv.id)}
                        >
                          <RefreshCw size={12} />
                          Sync
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Client Links */}
        <Card>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">QF Client Links</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {users.length === 0 && !loading && (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No linked clients</p>
            )}
            {users.map(u => (
              <div key={u.id} className="px-5 py-3.5 flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: u.color ?? '#7c3aed' }}
                >
                  {u.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                  <p className="text-xs text-gray-500 font-mono">#{u.qf_client_id}</p>
                </div>
                <a
                  href={`https://app.quickfile.co.uk/clients/${u.qf_client_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
