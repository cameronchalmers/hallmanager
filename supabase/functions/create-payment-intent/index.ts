import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

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
      .select('*, sites(name)')
      .eq('id', booking_id)
      .single()

    if (bookingErr || !booking) return json({ error: 'Booking not found' }, 404)

    if (booking.status === 'confirmed') {
      return json({ error: 'already_paid' }, 409)
    }

    if (booking.status !== 'approved') {
      return json({ error: 'Booking is not awaiting payment' }, 400)
    }

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

    const site = booking.sites as { name: string } | null

    const paymentIntent = await stripe.paymentIntents.create({
      amount: booking.total,
      currency: 'gbp',
      receipt_email: booking.email,
      description: `${booking.event} at ${site?.name ?? 'venue'} — ${booking.date}`,
      metadata: { booking_id },
    })

    await supabase
      .from('bookings')
      .update({ stripe_payment_intent_id: paymentIntent.id, stripe_payment_status: 'unpaid' })
      .eq('id', booking_id)

    return json({
      client_secret: paymentIntent.client_secret,
      publishable_key: siteCreds.stripe_publishable_key,
      booking: {
        name: booking.name,
        event: booking.event,
        date: new Date(booking.date + 'T12:00:00').toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        }),
        start_time: booking.start_time,
        end_time: booking.end_time,
        site_name: site?.name ?? 'Unknown venue',
        total: booking.total,
        deposit: booking.deposit,
      },
    })
  } catch (err) {
    console.error('create-payment-intent error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
