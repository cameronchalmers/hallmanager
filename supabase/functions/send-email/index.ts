import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  bookingSubmitted,
  bookingApproved,
  bookingDenied,
  bookingCancelled,
  extraSlotApproved,
  extraSlotDenied,
  bookingSubmittedAdmin,
  type BookingData,
  type ExtraSlotData,
} from './templates.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'HallManager <onboarding@resend.dev>'
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error: ${err}`)
  }
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { type, id, data: inlineData, template } = await req.json() as { type: string; id?: string; data?: BookingData; template?: string }

    // ── Booking emails ────────────────────────────────────────────────────────

    if (['booking_submitted', 'booking_approved', 'booking_denied', 'booking_cancelled'].includes(type)) {
      let b: BookingData

      if (type === 'booking_submitted' && inlineData) {
        // Public form passes data directly (anon can't SELECT back their own insert)
        b = {
          ...inlineData,
          date: new Date(inlineData.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        }
      } else {
        // Admin actions pass an id; look up the booking with service role
        const { data: booking, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', id)
          .single()

        if (error || !booking) throw new Error(`Booking not found: ${id}`)

        const { data: site } = await supabase
          .from('sites')
          .select('name')
          .eq('id', booking.site_id)
          .single()

        b = {
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
          notes: booking.notes,
          payment_url: booking.stripe_payment_url ?? null,
        }
      }

      if (type === 'booking_submitted') {
        const bookerEmail = bookingSubmitted(b)
        await sendEmail(b.email, bookerEmail.subject, bookerEmail.html)
        if (ADMIN_EMAIL) {
          const adminEmail = bookingSubmittedAdmin(b)
          await sendEmail(ADMIN_EMAIL, adminEmail.subject, adminEmail.html)
        }
      } else if (type === 'booking_approved') {
        const email = bookingApproved(b)
        await sendEmail(b.email, email.subject, email.html)
      } else if (type === 'booking_cancelled') {
        const email = bookingCancelled(b)
        await sendEmail(b.email, email.subject, email.html)
      } else {
        const email = bookingDenied(b)
        await sendEmail(b.email, email.subject, email.html)
      }
    }

    // ── Extra slot emails ─────────────────────────────────────────────────────

    else if (['slot_approved', 'slot_denied'].includes(type)) {
      const { data: slot, error } = await supabase
        .from('extra_slots')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !slot) throw new Error(`Extra slot not found: ${id}`)

      const { data: slotSite } = await supabase
        .from('sites')
        .select('name')
        .eq('id', slot.site_id)
        .single()

      const { data: slotUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', slot.user_id)
        .single()

      const to = slotUser?.email ?? ''
      if (!to) throw new Error('No email found for user')

      const s: ExtraSlotData = {
        name: slot.name,
        email: to,
        site_name: slotSite?.name ?? 'Unknown venue',
        date: new Date(slot.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        start_time: slot.start_time,
        end_time: slot.end_time,
        hours: slot.hours,
        reason: slot.reason,
        total: slot.total,
      }

      const email = type === 'slot_approved' ? extraSlotApproved(s) : extraSlotDenied(s)
      await sendEmail(to, email.subject, email.html)
    }

    // ── Test emails (send dummy version to admin) ─────────────────────────────

    else if (type === 'test') {
      if (!ADMIN_EMAIL) throw new Error('ADMIN_EMAIL not configured')

      const dummyBooking: BookingData = {
        name: 'Jane Smith',
        email: ADMIN_EMAIL,
        event: 'Community Yoga',
        date: 'Wednesday, 30 July 2025',
        start_time: '09:00',
        end_time: '11:00',
        hours: 2,
        site_name: 'The Old Town Hall',
        deposit: 50,
        total: 130,
        notes: 'Please ensure the mats are set out in advance.',
        payment_url: null,
      }

      const dummySlot: ExtraSlotData = {
        name: 'Jane Smith',
        email: ADMIN_EMAIL,
        site_name: 'The Old Town Hall',
        date: 'Wednesday, 30 July 2025',
        start_time: '09:00',
        end_time: '11:00',
        hours: 2,
        reason: 'We have a visiting instructor and need an extra session this week.',
        total: 80,
      }

      let email: { subject: string; html: string }
      if (template === 'booking_submitted')       email = bookingSubmitted(dummyBooking)
      else if (template === 'booking_submitted_admin') email = bookingSubmittedAdmin(dummyBooking)
      else if (template === 'booking_approved')   email = bookingApproved(dummyBooking)
      else if (template === 'booking_denied')     email = bookingDenied(dummyBooking)
      else if (template === 'booking_cancelled')  email = bookingCancelled(dummyBooking)
      else if (template === 'slot_approved')      email = extraSlotApproved(dummySlot)
      else if (template === 'slot_denied')        email = extraSlotDenied(dummySlot)
      else throw new Error(`Unknown template: ${template}`)

      await sendEmail(ADMIN_EMAIL, `[TEST] ${email.subject}`, email.html)
    }

    else {
      throw new Error(`Unknown email type: ${type}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
