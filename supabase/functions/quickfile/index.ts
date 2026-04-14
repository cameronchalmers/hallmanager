import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import md5 from 'https://esm.sh/md5@2.3.0'

const QF_BASE = 'https://api.quickfile.co.uk/1_2'
const ACC_NUM = Deno.env.get('QF_ACCOUNT_NUM') ?? ''
const APP_ID  = Deno.env.get('QF_APP_ID') ?? ''
const API_KEY = Deno.env.get('QF_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function submissionNum() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(36)).join('').toUpperCase().substring(0, 12)
}

function buildHeader() {
  const sub = submissionNum()
  return {
    MessageType: 'Request',
    SubmissionNumber: sub,
    Authentication: {
      AccNumber: ACC_NUM,
      MD5Value: md5(ACC_NUM + API_KEY + sub) as string,
      ApplicationID: APP_ID,
    },
  }
}

// Returns { body, raw } where body is the response Body for this service/action
async function qf(service: string, action: string, reqBody: Record<string, unknown>) {
  const url = `${QF_BASE}/${service}/${action}`
  const payload = { payload: { Header: buildHeader(), Body: reqBody } }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`QuickFile HTTP ${res.status}: ${text.slice(0, 300)}`)
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(text) } catch { throw new Error(`QuickFile non-JSON response: ${text.slice(0, 300)}`) }

  // Response top-level key is e.g. "Client_Search", "Invoice_Create"
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const key = `${cap(service)}_${cap(action)}`
  const envelope = parsed[key] as Record<string, unknown> | undefined
  if (!envelope) throw new Error(`Unexpected QF response (no ${key} key): ${JSON.stringify(parsed).slice(0, 300)}`)

  const msgType = (envelope.Header as Record<string, unknown>)?.MessageType
  if (msgType !== 'Response') {
    throw new Error(`QF error: ${JSON.stringify(envelope.Body ?? envelope).slice(0, 300)}`)
  }

  return envelope.Body as Record<string, unknown>
}

// Build split line items from a booking + site rate
function buildItemLines(booking: Record<string, unknown>, siteRate: number) {
  const lines: Record<string, unknown>[] = []
  const hours  = Number(booking.hours   ?? 0)
  const deposit = Number(booking.deposit ?? 0)
  const event  = String(booking.event   ?? 'Hall hire')

  if (hours > 0 && siteRate > 0) {
    lines.push({ ItemDescription: `${event} — ${hours}h @ £${siteRate}/hr`, UnitCost: siteRate, Qty: hours })
  }
  if (deposit > 0) {
    lines.push({ ItemDescription: 'Refundable deposit', UnitCost: deposit, Qty: 1 })
  }
  return lines
}

function invoiceBody(clientId: string, date: string, lines: Record<string, unknown>[], creditNote?: Record<string, unknown>) {
  return {
    InvoiceData: {
      InvoiceType: 'INVOICE',
      ClientID: clientId,
      CountryISO: 'GB',
      Currency: 'GBP',
      SingleInvoiceData: { IssueDate: date },
      ItemLines: lines,
      ...(creditNote ? { CreditNote: creditNote } : {}),
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Verify caller is an authenticated admin/manager
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ ok: false, error: 'Unauthorized' }, 401)

  if (!ACC_NUM || !APP_ID || !API_KEY) {
    return json({ ok: false, error: 'QuickFile credentials not configured. Set QF_ACCOUNT_NUM, QF_APP_ID and QF_API_KEY as Supabase secrets.' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Check admin/manager role
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return json({ ok: false, error: 'Forbidden' }, 403)
  }

  try {
    const body = await req.json()
    const { action, user_id, invoice_id, booking_id, qf_client_id } = body

    // ── Test connection ──────────────────────────────────────────────────────
    if (action === 'test') {
      await qf('client', 'search', {
        SearchParameters: { ReturnCount: 1, Offset: 0, OrderResultsBy: 'CreatedDate', OrderDirection: 'DESC' },
      })
      // qf() throws on error, so reaching here means success
      return json({ ok: true })
    }

    // ── Find QF client by email ──────────────────────────────────────────────
    if (action === 'find_client') {
      const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single()
      if (!user) return json({ ok: false, error: 'User not found' })
      const body = await qf('client', 'search', {
        SearchParameters: { Email: user.email, ReturnCount: 5, Offset: 0, OrderResultsBy: 'CreatedDate', OrderDirection: 'DESC' },
      })
      // Body.Record is a single object or array
      const raw = (body as any)?.Record ?? []
      const clients = Array.isArray(raw) ? raw : (raw ? [raw] : [])
      return json({ ok: true, clients })
    }

    // ── Link existing QF client to user ──────────────────────────────────────
    if (action === 'link_client') {
      await supabase.from('users').update({ qf_client_id }).eq('id', user_id)
      return json({ ok: true })
    }

    // ── Create QF client for a user ──────────────────────────────────────────
    if (action === 'create_client') {
      const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single()
      if (!user) return json({ ok: false, error: 'User not found' })
      const nameParts = (user.name as string).split(' ')
      const body = await qf('client', 'create', {
        ClientData: {
          CompanyName: user.group_name ?? user.name,
          DefaultContact: {
            FirstName: nameParts[0] ?? user.name,
            Surname:   nameParts.slice(1).join(' ') || '-',
            Email:     user.email,
          },
        },
      })
      const clientId = (body as any)?.ClientID
      if (!clientId) return json({ ok: false, error: 'Failed to create client — no ClientID in response' })
      await supabase.from('users').update({ qf_client_id: String(clientId) }).eq('id', user_id)
      return json({ ok: true, qf_client_id: String(clientId) })
    }

    // ── Sync a single paid invoice ───────────────────────────────────────────
    if (action === 'sync_invoice') {
      const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoice_id).single()
      if (!inv) return json({ ok: false, error: 'Invoice not found' })
      if (inv.status !== 'paid') return json({ ok: false, error: 'Invoice is not paid yet — only paid invoices are sent to QuickFile.' })

      let clientId: string | null = null
      if (inv.user_id) {
        const { data: user } = await supabase.from('users').select('qf_client_id').eq('id', inv.user_id).single()
        clientId = user?.qf_client_id ?? null
      }
      if (!clientId) return json({ ok: false, error: 'No QuickFile client linked. Link the booker first.' })

      let lines: Record<string, unknown>[] = []
      if (inv.booking_id) {
        const { data: booking } = await supabase.from('bookings').select('*').eq('id', inv.booking_id).single()
        if (booking) {
          const { data: site } = await supabase.from('sites').select('rate').eq('id', booking.site_id).single()
          lines = buildItemLines(booking, site?.rate ?? 0)
        }
      }
      if (lines.length === 0) lines = [{ ItemDescription: inv.description, UnitCost: inv.amount, Qty: 1 }]

      const respBody = await qf('invoice', 'create', invoiceBody(clientId, inv.date, lines))
      const qfRef = (respBody as any)?.InvoiceID ?? (respBody as any)?.InvoiceNumber
      if (!qfRef) return json({ ok: false, error: `Unexpected QF invoice response: ${JSON.stringify(respBody).slice(0, 200)}` })

      await supabase.from('invoices').update({ qf_synced: true, qf_ref: String(qfRef) }).eq('id', invoice_id)
      return json({ ok: true, qf_ref: String(qfRef) })
    }

    // ── Sync all unsynced PAID invoices ──────────────────────────────────────
    if (action === 'sync_all') {
      const { data: invoices } = await supabase
        .from('invoices').select('*').eq('qf_synced', false).eq('status', 'paid')

      if (!invoices?.length) return json({ ok: true, synced: 0, skipped: 0, errors: [] })

      let synced = 0, skipped = 0
      const errors: string[] = []

      for (const inv of invoices) {
        let clientId: string | null = null
        if (inv.user_id) {
          const { data: user } = await supabase.from('users').select('qf_client_id').eq('id', inv.user_id).single()
          clientId = user?.qf_client_id ?? null
        }
        if (!clientId) { skipped++; continue }

        let lines: Record<string, unknown>[] = []
        if (inv.booking_id) {
          const { data: booking } = await supabase.from('bookings').select('*').eq('id', inv.booking_id).single()
          if (booking) {
            const { data: site } = await supabase.from('sites').select('rate').eq('id', booking.site_id).single()
            lines = buildItemLines(booking, site?.rate ?? 0)
          }
        }
        if (lines.length === 0) lines = [{ ItemDescription: inv.description, UnitCost: inv.amount, Qty: 1 }]

        try {
          const respBody = await qf('invoice', 'create', invoiceBody(clientId, inv.date, lines))
          const qfRef = (respBody as any)?.InvoiceID ?? (respBody as any)?.InvoiceNumber
          if (qfRef) {
            await supabase.from('invoices').update({ qf_synced: true, qf_ref: String(qfRef) }).eq('id', inv.id)
            synced++
          } else {
            errors.push(`Invoice ${inv.id.slice(0, 8)}: no InvoiceID in QF response`)
          }
        } catch (e) {
          errors.push(`Invoice ${inv.id.slice(0, 8)}: ${String(e)}`)
        }
      }

      return json({ ok: true, synced, skipped, errors })
    }

    // ── Credit note when deposit is refunded ─────────────────────────────────
    if (action === 'refund_deposit') {
      const { data: booking } = await supabase.from('bookings').select('*').eq('id', booking_id).single()
      if (!booking) return json({ ok: false, error: 'Booking not found' })
      if (!booking.deposit || booking.deposit <= 0) return json({ ok: true, skipped: true })

      let clientId: string | null = null
      if (booking.user_id) {
        const { data: user } = await supabase.from('users').select('qf_client_id').eq('id', booking.user_id).single()
        clientId = user?.qf_client_id ?? null
      }
      if (!clientId) return json({ ok: true, skipped: true, reason: 'No QF client linked' })

      const { data: inv } = await supabase
        .from('invoices').select('qf_ref').eq('booking_id', booking_id).eq('qf_synced', true).maybeSingle()

      const desc = inv?.qf_ref
        ? `Deposit refund (ref QF #${inv.qf_ref}) — ${booking.event}`
        : `Deposit refund — ${booking.event}`

      const creditNote: Record<string, unknown> = { CreditNoteType: 'REFUND' }
      if (inv?.qf_ref) creditNote.ParentInvoiceId = inv.qf_ref

      const today = new Date().toISOString().split('T')[0]
      const lines = [{ ItemDescription: desc, UnitCost: booking.deposit, Qty: 1 }]
      const respBody = await qf('invoice', 'create', invoiceBody(clientId, today, lines, creditNote))

      const creditRef = (respBody as any)?.InvoiceID ?? (respBody as any)?.InvoiceNumber
      if (!creditRef) return json({ ok: false, error: `QF did not return a credit note ID: ${JSON.stringify(respBody).slice(0, 200)}` })

      return json({ ok: true, credit_ref: String(creditRef) })
    }

    // ── Pull invoices from QF into Supabase ──────────────────────────────────
    if (action === 'pull_invoices') {
      const { data: user } = await supabase.from('users').select('qf_client_id').eq('id', user_id).single()
      if (!user?.qf_client_id) return json({ ok: false, error: 'No QuickFile client linked for this user' })

      const clientId = user.qf_client_id

      // Fetch existing qf_refs so we don't duplicate
      const { data: existing } = await supabase.from('invoices').select('qf_ref').eq('user_id', user_id)
      const existingRefs = new Set((existing ?? []).map((i: any) => String(i.qf_ref)))

      // Search QF for invoices — filter by ClientID from results (API doesn't support it as a search param)
      let body: Record<string, unknown>
      try {
        body = await qf('invoice', 'search', {
          SearchParameters: {
            InvoiceNumber: '',
            ReturnCount: 100,
            Offset: 0,
          },
        })
      } catch (e) {
        return json({ ok: false, error: String(e) })
      }

      const raw = (body as any)?.InvoiceResult?.InvoiceResultSet ?? []
      const all = Array.isArray(raw) ? raw : (raw ? [raw] : [])
      // Filter to only this client's invoices
      const invoices = all.filter((inv: any) => String(inv.ClientID) === String(clientId))

      let imported = 0
      let skipped = 0

      for (const inv of invoices) {
        const qfRef = String(inv.InvoiceID ?? inv.InvoiceNumber ?? '')
        if (!qfRef || existingRefs.has(qfRef)) { skipped++; continue }

        // Map QF status to our status
        const qfStatus = String(inv.InvoiceStatus ?? '').toLowerCase()
        const status = qfStatus === 'paid' ? 'paid'
          : qfStatus === 'overdue' ? 'overdue'
          : qfStatus === 'sent' ? 'sent'
          : 'draft'

        const amount = parseFloat(inv.GrossAmount ?? inv.TotalAmount ?? '0') || 0
        const date = inv.InvoiceDate
          ? String(inv.InvoiceDate).split('T')[0]
          : new Date().toISOString().split('T')[0]
        const description = inv.NominalDescription ?? inv.InvoiceNumber ?? `Invoice ${qfRef}`

        await supabase.from('invoices').insert({
          user_id,
          description,
          amount,
          status,
          date,
          qf_ref: qfRef,
          qf_synced: true,
        })
        imported++
      }

      return json({ ok: true, imported, skipped })
    }

    return json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('quickfile error:', err)
    return json({ ok: false, error: 'Internal server error' }, 500)
  }
})
