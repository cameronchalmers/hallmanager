import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'
import { getGoogleAccessToken, createCalendarEvent } from '../_shared/google-calendar.ts'

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Payment Element flow
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const bookingId = paymentIntent.metadata?.booking_id
    if (!bookingId) {
      console.error('No booking_id in payment intent metadata')
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }
    await confirmBooking(supabase, bookingId, paymentIntent.id)
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  // Legacy Checkout Session flow (kept for backward compatibility)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const bookingId = session.metadata?.booking_id
    if (!bookingId) {
      console.error('No booking_id in session metadata')
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }
    await confirmBooking(supabase, bookingId, null)
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})

// deno-lint-ignore no-explicit-any
async function confirmBooking(supabase: any, bookingId: string, paymentIntentId: string | null) {
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('*, sites(name)')
    .eq('id', bookingId)
    .single()

  if (bookingErr || !booking) {
    console.error('Booking not found:', bookingId, bookingErr)
    return
  }

  const updateData: Record<string, unknown> = {
    status: 'confirmed',
    stripe_payment_status: 'paid',
  }
  if (paymentIntentId) updateData.stripe_payment_intent_id = paymentIntentId

  const { error: updateErr } = await supabase.from('bookings').update(updateData).eq('id', bookingId)
  if (updateErr) {
    console.error('Failed to confirm booking:', bookingId, JSON.stringify(updateErr))
    return
  }
  console.log(`Booking ${bookingId} confirmed`)

  if (booking.type === 'oneoff') {
    try {
      const serviceAccountKeyRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
      if (serviceAccountKeyRaw) {
        const { data: siteCreds } = await supabase
          .from('site_credentials')
          .select('google_calendar_id')
          .eq('site_id', booking.site_id)
          .single()
        const calendarId = siteCreds?.google_calendar_id as string | undefined
        if (calendarId) {
          const accessToken = await getGoogleAccessToken(JSON.parse(serviceAccountKeyRaw))
          const eventId = await createCalendarEvent(accessToken, calendarId, {
            name: booking.name,
            event: booking.event,
            date: booking.date,
            start_time: booking.start_time,
            end_time: booking.end_time,
            site_name: (booking.sites as { name: string } | null)?.name ?? 'Unknown venue',
            notes: booking.notes,
          })
          await supabase.from('bookings').update({ google_calendar_event_id: eventId }).eq('id', bookingId)
          console.log(`Calendar event created: ${eventId}`)
        }
      }
    } catch (calErr) {
      console.error('Calendar event creation failed (non-fatal):', calErr)
    }
  }
}
