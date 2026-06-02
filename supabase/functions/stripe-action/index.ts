import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check=true'
import { depositRefunded } from '../send-email/templates.ts'

// No global Stripe key — credentials must be configured per site in site_credentials
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    // Check role
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'site_admin', 'manager'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const { action, booking_id, amount: customAmount } = await req.json()

    // ── Create payment link ───────────────────────────────────────────────────

    // ── Refund deposit ────────────────────────────────────────────────────────

    if (action === 'refund_deposit') {
      const { data: booking } = await supabase.from('bookings').select('*').eq('id', booking_id).single()
      if (!booking) throw new Error('Booking not found')

      const { data: refundCreds } = await supabase.from('site_credentials').select('stripe_secret_key').eq('site_id', booking.site_id).single()
      if (!refundCreds?.stripe_secret_key) throw new Error('Stripe is not configured for this site')

      const stripe = new Stripe(refundCreds.stripe_secret_key, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
      })

      if (booking.stripe_payment_status === 'deposit_refunded') {
        return new Response(JSON.stringify({ error: 'Deposit already refunded' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // New flow: payment_intent_id stored directly
      // Legacy flow: look it up via checkout session
      let paymentIntentId: string | null = booking.stripe_payment_intent_id ?? null
      if (!paymentIntentId && booking.stripe_session_id) {
        const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id)
        paymentIntentId = session.payment_intent as string
      }
      if (!paymentIntentId) throw new Error('Payment has not been completed yet')

      const refundAmount = customAmount ?? booking.deposit
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: refundAmount,
        reason: 'requested_by_customer',
      })

      await supabase.from('bookings').update({ stripe_payment_status: 'deposit_refunded', refunded_amount: refundAmount }).eq('id', booking_id)

      // Send refund confirmation email — fire-and-forget, don't fail the refund if this errors
      try {
        const resendKey = Deno.env.get('RESEND_API_KEY')
        const from = Deno.env.get('RESEND_FROM') ?? 'HallManager <onboarding@resend.dev>'
        if (resendKey) {
          const { data: site } = await supabase.from('sites').select('name, whatsapp_number').eq('id', booking.site_id).single()
          const email = depositRefunded({
            name: booking.name,
            email: booking.email,
            event: booking.event,
            date: new Date(booking.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
            start_time: booking.start_time,
            end_time: booking.end_time,
            hours: booking.hours,
            site_name: site?.name ?? 'Unknown venue',
            deposit: booking.deposit,
            total: booking.total,
            refunded_amount: refundAmount,
            whatsapp_number: site?.whatsapp_number ?? null,
          })
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: booking.email, subject: email.subject, html: email.html }),
          })
        }
      } catch (emailErr) {
        console.error('Failed to send refund email:', emailErr)
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    console.error('stripe-action error:', err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
