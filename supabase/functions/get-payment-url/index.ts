import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://hallmanager.co.uk'

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
    const url = new URL(req.url)
    const booking_id = url.searchParams.get('booking_id')
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

    if (!['approved', 'confirmed'].includes(booking.status)) {
      return json({ error: 'This booking is not awaiting payment' }, 400)
    }

    if (booking.status === 'confirmed') {
      // Already paid — redirect to confirmation page
      return Response.redirect(`${SITE_URL}/booking-paid`, 302)
    }

    const { data: siteCreds } = await supabase
      .from('site_credentials')
      .select('stripe_secret_key')
      .eq('site_id', booking.site_id)
      .single()

    if (!siteCreds?.stripe_secret_key) {
      return json({ error: 'Online payment is not configured for this venue. Please contact the venue directly.' }, 503)
    }

    const stripe = new Stripe(siteCreds.stripe_secret_key, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const site = booking.sites as { name: string } | null

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: booking.event,
            description: `${booking.hours} hour${booking.hours !== 1 ? 's' : ''} at ${site?.name ?? 'venue'} · ${booking.date}`,
          },
          unit_amount: booking.total,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: booking.email,
      success_url: `${SITE_URL}/booking-paid`,
      cancel_url: `${SITE_URL}/pay/${booking_id}`,
      metadata: { booking_id },
    })

    await supabase.from('bookings').update({
      stripe_session_id: session.id,
      stripe_payment_url: session.url,
      stripe_payment_status: 'unpaid',
    }).eq('id', booking_id)

    return Response.redirect(session.url!, 302)
  } catch (err) {
    console.error('get-payment-url error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
