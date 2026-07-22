import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'
import { getGoogleAccessToken, createCalendarEvent } from '../_shared/google-calendar.ts'
import { bookingConfirmed } from '../send-email/templates.ts'

const GLOBAL_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

serve(async (req) => {
  const url = new URL(req.url)
  const siteId = url.searchParams.get('site_id')

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 })
  }

  const body = await req.text()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolve per-site Stripe key and webhook secret
  let stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
  let webhookSecret = GLOBAL_WEBHOOK_SECRET
  if (siteId) {
    const { data: siteCreds } = await supabase
      .from('site_credentials')
      .select('stripe_secret_key, stripe_webhook_secret')
      .eq('site_id', siteId)
      .single()
    if (siteCreds?.stripe_secret_key) stripeKey = siteCreds.stripe_secret_key
    // A site-scoped endpoint must use that site's own signing secret — falling
    // back to the global secret would make verification fail silently.
    if (!siteCreds?.stripe_webhook_secret) {
      console.error('No webhook secret configured for site_id:', siteId)
      return new Response('Webhook secret not configured for this site', { status: 400 })
    }
    webhookSecret = siteCreds.stripe_webhook_secret
  }

  if (!stripeKey) {
    console.error('No Stripe key configured for site_id:', siteId)
    return new Response('Stripe not configured', { status: 400 })
  }

  if (!webhookSecret) {
    console.error('No webhook secret configured for site_id:', siteId)
    return new Response('Webhook secret not configured', { status: 400 })
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

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

  // Stripe retries deliveries — don't re-confirm (and re-email) a booking
  if (booking.status === 'confirmed') {
    console.log(`Booking ${bookingId} already confirmed — skipping`)
    return
  }

  // A payment can land on a booking that was cancelled/denied after the pay
  // page was opened. Don't silently confirm it — flag it for manual review.
  if (booking.status !== 'approved') {
    console.error(
      `PAYMENT RECEIVED FOR NON-APPROVED BOOKING — needs manual review. ` +
      `booking=${bookingId} status=${booking.status} payment_intent=${paymentIntentId}`,
    )
    await supabase
      .from('bookings')
      .update({ stripe_payment_status: 'paid', ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}) })
      .eq('id', bookingId)
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

  // Send confirmation email — fire-and-forget
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('RESEND_FROM') ?? 'HallManager <onboarding@resend.dev>'
    if (resendKey) {
      const { data: site } = await supabase.from('sites').select('name, whatsapp_number, site_type').eq('id', booking.site_id).single()
      const fmtD = (ds: string) => new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const isVehicle = site?.site_type === 'vehicle'
      const hireDays = booking.end_date
        ? Math.round((new Date(booking.end_date).getTime() - new Date(booking.date).getTime()) / 86400000) + 1
        : 1
      const email = bookingConfirmed({
        name: booking.name,
        email: booking.email,
        event: booking.event,
        date: booking.end_date && booking.end_date !== booking.date ? `${fmtD(booking.date)} – ${fmtD(booking.end_date)}` : fmtD(booking.date),
        start_time: booking.start_time,
        end_time: booking.end_time,
        time_display: isVehicle ? (booking.package_label ?? 'Vehicle hire') : null,
        duration_display: isVehicle ? `${hireDays} day${hireDays !== 1 ? 's' : ''}` : null,
        hours: booking.hours,
        site_name: site?.name ?? (booking.sites as { name: string } | null)?.name ?? 'Unknown venue',
        deposit: booking.deposit,
        total: booking.total,
        notes: booking.notes,
        whatsapp_number: site?.whatsapp_number ?? null,
      })
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: booking.email, subject: email.subject, html: email.html }),
      })
    }
  } catch (emailErr) {
    console.error('Failed to send confirmation email:', emailErr)
  }

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
            end_date: booking.end_date,
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
