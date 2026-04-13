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
  return Math.random().toString(36).substring(2, 14).toUpperCase()
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

async function qf(service: string, action: string, body: Record<string, unknown>) {
  const res = await fetch(`${QF_BASE}/${service}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { header: buildHeader(), body } }),
  })
  if (!res.ok) throw new Error(`QuickFile HTTP ${res.status}`)
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!ACC_NUM || !APP_ID || !API_KEY) {
    return json({ ok: false, error: 'QuickFile credentials not configured. Set QF_ACCOUNT_NUM, QF_APP_ID and QF_API_KEY as Supabase secrets.' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { action, user_id, invoice_id } = await req.json()

    // ── Test connection ────────────────────────────────────────────────────────
    if (action === 'test') {
      const data = await qf('client', 'search', {
        SearchParameters: {},
        ReturnCount: 1,
        Offset: 0,
        OrderResultsBy: 'CreatedDate',
        OrderDirection: 'DESC',
      })
      const ok = data?.payload?.header?.ReturnInfo?.StatusCode === 'SUCCESS'
      return json({ ok, raw: ok ? undefined : data })
    }

    // ── Find QF client by email ────────────────────────────────────────────────
    if (action === 'find_client') {
      const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single()
      if (!user) return json({ ok: false, error: 'User not found' })

      const data = await qf('client', 'search', {
        SearchParameters: { Email: user.email },
        ReturnCount: 5,
        Offset: 0,
      })
      const clients = data?.payload?.body?.Clients?.Client ?? []
      const list = Array.isArray(clients) ? clients : [clients]
      return json({ ok: true, clients: list })
    }

    // ── Link QF client ID to user ──────────────────────────────────────────────
    if (action === 'link_client') {
      const { qf_client_id } = await req.json().catch(() => ({}))
      await supabase.from('users').update({ qf_client_id }).eq('id', user_id)
      return json({ ok: true })
    }

    // ── Create QF client for a user ────────────────────────────────────────────
    if (action === 'create_client') {
      const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single()
      if (!user) return json({ ok: false, error: 'User not found' })

      const nameParts = (user.name as string).split(' ')
      const data = await qf('client', 'create', {
        ClientDetails: {
          CompanyName: user.group_name ?? user.name,
          DefaultContact: {
            FirstName: nameParts[0] ?? user.name,
            Surname: nameParts.slice(1).join(' ') || '-',
            Email: user.email,
          },
        },
      })
      const clientId = data?.payload?.body?.ClientID
      if (!clientId) return json({ ok: false, error: 'Failed to create client', raw: data })

      await supabase.from('users').update({ qf_client_id: String(clientId) }).eq('id', user_id)
      return json({ ok: true, qf_client_id: String(clientId) })
    }

    // ── Sync a single invoice ──────────────────────────────────────────────────
    if (action === 'sync_invoice') {
      const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoice_id).single()
      if (!inv) return json({ ok: false, error: 'Invoice not found' })

      let clientId: string | null = null
      if (inv.user_id) {
        const { data: user } = await supabase.from('users').select('qf_client_id').eq('id', inv.user_id).single()
        clientId = user?.qf_client_id ?? null
      }
      if (!clientId) return json({ ok: false, error: 'No QuickFile client linked to this invoice\'s user. Link the client first.' })

      const data = await qf('invoice', 'create', {
        InvoiceDetails: {
          ClientID: clientId,
          InvoiceType: 'INVOICE',
          InvoiceDate: inv.date,
          ItemLines: {
            ItemLine: [{
              ItemDescription: inv.description,
              UnitCost: inv.amount,
              Quantity: 1,
            }],
          },
        },
      })
      const qfRef = data?.payload?.body?.InvoiceID ?? data?.payload?.body?.InvoiceNumber
      if (!qfRef) return json({ ok: false, error: 'Failed to create invoice in QuickFile', raw: data })

      await supabase.from('invoices').update({ qf_synced: true, qf_ref: String(qfRef) }).eq('id', invoice_id)
      return json({ ok: true, qf_ref: String(qfRef) })
    }

    // ── Sync all unsynced invoices ─────────────────────────────────────────────
    if (action === 'sync_all') {
      const { data: invoices } = await supabase.from('invoices').select('*, users(qf_client_id)').eq('qf_synced', false)
      if (!invoices?.length) return json({ ok: true, synced: 0, skipped: 0, errors: [] })

      let synced = 0, skipped = 0
      const errors: string[] = []

      for (const inv of invoices) {
        const clientId = (inv as any).users?.qf_client_id ?? null
        if (!clientId) { skipped++; continue }

        try {
          const data = await qf('invoice', 'create', {
            InvoiceDetails: {
              ClientID: clientId,
              InvoiceType: 'INVOICE',
              InvoiceDate: inv.date,
              ItemLines: {
                ItemLine: [{
                  ItemDescription: inv.description,
                  UnitCost: inv.amount,
                  Quantity: 1,
                }],
              },
            },
          })
          const qfRef = data?.payload?.body?.InvoiceID ?? data?.payload?.body?.InvoiceNumber
          if (qfRef) {
            await supabase.from('invoices').update({ qf_synced: true, qf_ref: String(qfRef) }).eq('id', inv.id)
            synced++
          } else {
            errors.push(`Invoice ${inv.id.slice(0, 8)}: unexpected QF response`)
          }
        } catch (e) {
          errors.push(`Invoice ${inv.id.slice(0, 8)}: ${String(e)}`)
        }
      }

      return json({ ok: true, synced, skipped, errors })
    }

    return json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    return json({ ok: false, error: String(err) })
  }
})
