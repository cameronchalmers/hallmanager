// Does Stripe agree with the bookings table?
//
// Written after a webhook endpoint spent four and a half months posting to
// `…supabase.com` instead of `…supabase.co`. The host did not resolve, so
// every delivery failed, and nothing anywhere said so: bookings simply stayed
// unpaid and somebody reconciled them by hand.
//
// So this deliberately does not check webhook configuration. Configuration is
// one of many ways to arrive at the same place — a 401 at the gateway, a
// rotated signing secret, a function that throws, an endpoint nobody created.
// It checks the outcome instead: Stripe says this booking was paid, and the
// booking does not. That question has the same answer whatever went wrong.
//
// It reports rather than repairs. A payment that did not land may be a
// deposit, a balance, a payment against a cancelled booking, or a booking
// deleted since — the webhook has careful rules for each, and a second,
// simpler copy of those rules running unattended is how money gets written
// wrong. A human fixing three a year with the facts in front of them is the
// better trade.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const DAYS = 30
const PAID = ['paid', 'deposit_paid', 'deposit_refunded']

interface Mismatch {
  site: string
  booking_id: string | null
  payment_intent: string
  amount: number
  paid_at: string
  booking_status: string | null
  stripe_payment_status: string | null
  note: string
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const since = Math.floor(Date.now() / 1000) - DAYS * 86400
  const mismatches: Mismatch[] = []
  const problems: string[] = []
  let checked = 0

  // Every site that can take money, each with whichever key it takes it on.
  const { data: sites } = await supabase
    .from('sites').select('id, name')
  const { data: creds } = await supabase
    .from('site_credentials').select('site_id, stripe_secret_key')

  const globalKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
  const keyed = new Map<string, string>()
  for (const c of creds ?? []) {
    if (c.stripe_secret_key) keyed.set(c.site_id, c.stripe_secret_key)
  }

  // One pass per distinct key, not per site: sites sharing the global key
  // share an account, and listing it once per site would be the same call
  // repeated and the same payments counted twice.
  const byKey = new Map<string, string[]>()
  for (const site of sites ?? []) {
    const key = keyed.get(site.id) ?? globalKey
    if (!key) continue
    byKey.set(key, [...(byKey.get(key) ?? []), site.id])
  }

  // Two different key strings can belong to one Stripe account — a site with
  // its own key on the same account the global key points at, which is exactly
  // how Wingrove is set up. Listing per key would then walk the same payments
  // twice and report every mismatch twice, so the account is what deduplicates.
  const seenAccounts = new Set<string>()

  for (const [key, siteIds] of byKey) {
    const stripe = new Stripe(key, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })
    let account = 'unknown'
    try {
      account = (await stripe.accounts.retrieve()).id
    } catch (err) {
      problems.push(`Could not reach Stripe for site(s) ${siteIds.join(', ')}: ${err}`)
      continue
    }
    if (seenAccounts.has(account)) continue
    seenAccounts.add(account)

    try {
      for await (const pi of stripe.paymentIntents.list({ created: { gte: since }, limit: 100 })) {
        if (pi.status !== 'succeeded') continue
        checked++

        const bookingId = pi.metadata?.booking_id ?? null
        if (!bookingId) {
          // A payment taken outside the booking flow. Worth seeing once, not
          // worth chasing — it has no booking to disagree with.
          continue
        }

        const { data: booking } = await supabase
          .from('bookings')
          .select('id, status, stripe_payment_status, site_id, sites(name)')
          .eq('id', bookingId).maybeSingle()

        if (!booking) {
          mismatches.push({
            site: account, booking_id: bookingId, payment_intent: pi.id,
            amount: pi.amount_received ?? pi.amount,
            paid_at: new Date(pi.created * 1000).toISOString(),
            booking_status: null, stripe_payment_status: null,
            note: 'Stripe took this payment for a booking that no longer exists.',
          })
          continue
        }

        if (!PAID.includes(booking.stripe_payment_status ?? '')) {
          mismatches.push({
            site: (booking.sites as { name?: string } | null)?.name ?? account,
            booking_id: booking.id, payment_intent: pi.id,
            amount: pi.amount_received ?? pi.amount,
            paid_at: new Date(pi.created * 1000).toISOString(),
            booking_status: booking.status,
            stripe_payment_status: booking.stripe_payment_status,
            note: 'Stripe says this was paid; the booking does not.',
          })
        }
      }
    } catch (err) {
      problems.push(`Listing payments failed for account ${account}: ${err}`)
    }
  }

  const ok = mismatches.length === 0 && problems.length === 0
  await supabase.from('job_runs').insert({
    job: 'reconcile-payments',
    ok,
    checked,
    detail: { mismatches, problems, days: DAYS },
  })

  // Silence when there is nothing wrong. A daily email saying "all fine" is
  // read for a fortnight and filtered forever after, and then the one that
  // matters is filtered too.
  if (!ok) await alert(mismatches, problems)

  return new Response(JSON.stringify({ ok, checked, mismatches, problems }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

async function alert(mismatches: Mismatch[], problems: string[]) {
  const key = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('ADMIN_EMAIL')
  if (!key || !to) return

  const rows = mismatches.map((m) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escape(m.site)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">£${(m.amount / 100).toFixed(2)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escape(m.paid_at.slice(0, 16).replace('T', ' '))}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escape(m.booking_status ?? '—')} / ${escape(m.stripe_payment_status ?? '—')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px">${escape(m.payment_intent)}</td>
    </tr>`).join('')

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#111">
      <h2 style="margin:0 0 4px">Payments Stripe has that HallManager does not</h2>
      <p style="margin:0 0 16px;color:#555">
        Checked the last ${DAYS} days. ${mismatches.length} payment(s) look settled in Stripe
        but the booking has not been marked paid. Each one is money received against a booking
        that still reads as unpaid.
      </p>
      ${mismatches.length ? `<table style="border-collapse:collapse;font-size:13px">
        <tr style="text-align:left;color:#555">
          <th style="padding:6px 10px">Site</th><th style="padding:6px 10px">Amount</th>
          <th style="padding:6px 10px">Paid</th><th style="padding:6px 10px">Booking / payment status</th>
          <th style="padding:6px 10px">Payment intent</th>
        </tr>${rows}
      </table>` : ''}
      ${problems.length ? `<p style="margin:16px 0 0;color:#a00">
        ${problems.map(escape).join('<br>')}</p>` : ''}
      <p style="margin:20px 0 0;color:#555;font-size:13px">
        Usually this means a webhook did not arrive. The delivery log for the site's endpoint
        in Stripe will say why, and resending the event there will settle the booking.
      </p>
    </div>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') ?? 'HallManager <onboarding@resend.dev>',
      to: [to],
      subject: `${mismatches.length} payment(s) not recorded against a booking`,
      html,
    }),
  })
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
