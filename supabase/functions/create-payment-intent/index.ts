import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'

// Package-priced sites take 25% upfront to confirm; the balance is due
// BALANCE_DUE_DAYS before the booking. Bookings made inside that window
// pay in full. Hourly (hall) sites always pay in full.
const DEPOSIT_FRACTION = 0.25
const BALANCE_DUE_DAYS = 14

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function daysUntil(dateStr: string): number {
  const today = new Date()
  const target = new Date(dateStr + 'T12:00:00')
  return Math.floor((target.getTime() - today.getTime()) / 86400000)
}

function balanceDueDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - BALANCE_DUE_DAYS)
  return d.toISOString().split('T')[0]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { booking_id } = await req.json() as { booking_id: string }
    if (!booking_id) return json({ error: 'booking_id required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('*, sites(name, pricing_mode, site_type)')
      .eq('id', booking_id)
      .single()

    if (bookingErr || !booking) return json({ error: 'Booking not found' }, 404)

    const site = booking.sites as { name: string; pricing_mode: string | null; site_type: string | null } | null
    const isSplitSite = site?.pricing_mode === 'packages' || site?.site_type === 'vehicle'

    const total = Math.round(Number(booking.total))
    const amountPaid = Math.round(Number(booking.amount_paid ?? 0))

    if (booking.stripe_payment_status === 'paid' || amountPaid >= total) {
      return json({ error: 'already_paid' }, 409)
    }

    // Which payment is this?
    //  - full:    hall booking, or a package booking made inside the balance window
    //  - deposit: first 25% payment on a package booking
    //  - balance: the remainder once the deposit is in
    let stage: 'full' | 'deposit' | 'balance'
    let amountDue: number
    if (!isSplitSite) {
      stage = 'full'
      amountDue = total
      if (booking.status !== 'approved') {
        return json({ error: booking.status === 'confirmed' ? 'already_paid' : 'Booking is not awaiting payment' }, booking.status === 'confirmed' ? 409 : 400)
      }
    } else if (amountPaid > 0) {
      stage = 'balance'
      amountDue = total - amountPaid
      if (booking.status !== 'confirmed' || booking.stripe_payment_status !== 'deposit_paid') {
        return json({ error: 'Booking is not awaiting payment' }, 400)
      }
    } else {
      if (booking.status !== 'approved') {
        return json({ error: booking.status === 'confirmed' ? 'already_paid' : 'Booking is not awaiting payment' }, booking.status === 'confirmed' ? 409 : 400)
      }
      if (daysUntil(booking.date) <= BALANCE_DUE_DAYS) {
        stage = 'full'
        amountDue = total
      } else {
        stage = 'deposit'
        amountDue = Math.round(total * DEPOSIT_FRACTION)
      }
    }

    if (amountDue <= 0) return json({ error: 'already_paid' }, 409)

    const { data: siteCreds } = await supabase
      .from('site_credentials')
      .select('stripe_secret_key, stripe_publishable_key')
      .eq('site_id', booking.site_id)
      .single()

    if (!siteCreds?.stripe_secret_key || !siteCreds?.stripe_publishable_key) {
      return json({ error: 'stripe_not_configured' }, 503)
    }

    const stripe = new Stripe(siteCreds.stripe_secret_key, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const bookingSummary = {
      name: booking.name,
      event: booking.event,
      date: new Date(booking.date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }),
      end_date: booking.end_date
        ? new Date(booking.end_date + 'T12:00:00').toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })
        : null,
      start_time: booking.start_time,
      end_time: booking.end_time,
      site_name: site?.name ?? 'Unknown venue',
      site_type: site?.site_type ?? 'hall',
      total,
      deposit: booking.deposit,
    }

    const stageInfo = {
      stage,
      amount_due: amountDue,
      amount_paid: amountPaid,
      total,
      balance_due_date: stage === 'deposit' ? balanceDueDate(booking.date) : null,
    }

    // Reuse a pending PaymentIntent only if it matches this stage's amount
    if (booking.stripe_payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id)
      if (existing.status !== 'succeeded' && existing.status !== 'canceled') {
        if (existing.amount === amountDue && existing.metadata?.payment_type === stage) {
          return json({
            client_secret: existing.client_secret,
            publishable_key: siteCreds.stripe_publishable_key,
            booking: bookingSummary,
            ...stageInfo,
          })
        }
        // Stale (wrong stage/amount) — cancel it and create a fresh one
        try { await stripe.paymentIntents.cancel(existing.id) } catch { /* already unusable */ }
      }
      if (existing.status === 'succeeded' && stage !== 'balance') {
        return json({ error: 'already_paid' }, 409)
      }
    }

    const stageLabel = stage === 'deposit' ? '25% deposit' : stage === 'balance' ? 'balance' : 'payment'
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountDue,
      currency: 'gbp',
      receipt_email: booking.email,
      description: `${booking.event} at ${site?.name ?? 'venue'} — ${booking.date} (${stageLabel})`,
      metadata: { booking_id, payment_type: stage },
    })

    await supabase
      .from('bookings')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        ...(amountPaid === 0 ? { stripe_payment_status: 'unpaid' } : {}),
      })
      .eq('id', booking_id)

    return json({
      client_secret: paymentIntent.client_secret,
      publishable_key: siteCreds.stripe_publishable_key,
      booking: bookingSummary,
      ...stageInfo,
    })
  } catch (err) {
    console.error('create-payment-intent error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
