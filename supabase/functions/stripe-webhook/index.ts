import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 })
  }

  const body = await req.text()

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const bookingId = session.metadata?.booking_id
  if (!bookingId) {
    console.error('No booking_id in session metadata')
    return new Response('No booking_id', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Fetch the booking
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('*, sites(name)')
    .eq('id', bookingId)
    .single()

  if (bookingErr || !booking) {
    console.error('Booking not found:', bookingId, bookingErr)
    return new Response('Booking not found', { status: 404 })
  }

  // Mark booking as confirmed and paid
  await supabase.from('bookings').update({
    status: 'confirmed',
    stripe_payment_status: 'paid',
  }).eq('id', bookingId)

  console.log(`Booking ${bookingId} confirmed`)
  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
