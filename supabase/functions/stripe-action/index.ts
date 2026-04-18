import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://hallmanager.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify caller is an authenticated admin/manager
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Check role
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const { action, booking_id, amount: customAmount } = await req.json()

    // ── Create payment link ───────────────────────────────────────────────────

    if (action === 'create_payment') {
      const { data: booking } = await supabase.from('bookings').select('*').eq('id', booking_id).single()
      if (!booking) throw new Error('Booking not found')

      const { data: site } = await supabase.from('sites').select('name').eq('id', booking.site_id).single()

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
        cancel_url: `${SITE_URL}`,
        metadata: { booking_id },
      })

      await supabase.from('bookings').update({
        stripe_session_id: session.id,
        stripe_payment_url: session.url,
        stripe_payment_status: 'unpaid',
      }).eq('id', booking_id)

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Refund deposit ────────────────────────────────────────────────────────

    if (action === 'refund_deposit') {
      const { data: booking } = await supabase.from('bookings').select('*').eq('id', booking_id).single()
      if (!booking?.stripe_session_id) throw new Error('No Stripe session found for this booking')
      if (booking.stripe_payment_status === 'deposit_refunded') {
        return new Response(JSON.stringify({ error: 'Deposit already refunded' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id)
      const paymentIntentId = session.payment_intent as string
      if (!paymentIntentId) throw new Error('Payment has not been completed yet')

      const refundAmount = customAmount ?? booking.deposit
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: refundAmount,
        reason: 'requested_by_customer',
      })

      await supabase.from('bookings').update({ stripe_payment_status: 'deposit_refunded', refunded_amount: refundAmount }).eq('id', booking_id)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (err) {
    console.error('stripe-action error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
