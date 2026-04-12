import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  bookingSubmitted,
  bookingApproved,
  bookingDenied,
  extraSlotApproved,
  extraSlotDenied,
  type BookingData,
  type ExtraSlotData,
} from './templates.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = 'HallManager <no-reply@hallmanager.co.uk>'

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

    const { type, id } = await req.json() as { type: string; id: string }

    let email: { subject: string; html: string }
    let to: string

    // ── Booking emails ────────────────────────────────────────────────────────

    if (['booking_submitted', 'booking_approved', 'booking_denied'].includes(type)) {
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('*, sites(name)')
        .eq('id', id)
        .single()

      if (error || !booking) throw new Error(`Booking not found: ${id}`)

      const b: BookingData = {
        name: booking.name,
        email: booking.email,
        event: booking.event,
        date: new Date(booking.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        start_time: booking.start_time,
        end_time: booking.end_time,
        hours: booking.hours,
        site_name: booking.sites?.name ?? 'Unknown venue',
        deposit: booking.deposit,
        total: booking.total,
        notes: booking.notes,
      }

      to = booking.email

      if (type === 'booking_submitted') email = bookingSubmitted(b)
      else if (type === 'booking_approved') email = bookingApproved(b)
      else email = bookingDenied(b)
    }

    // ── Extra slot emails ─────────────────────────────────────────────────────

    else if (['slot_approved', 'slot_denied'].includes(type)) {
      const { data: slot, error } = await supabase
        .from('extra_slots')
        .select('*, sites(name), users(email)')
        .eq('id', id)
        .single()

      if (error || !slot) throw new Error(`Extra slot not found: ${id}`)

      const s: ExtraSlotData = {
        name: slot.name,
        email: slot.users?.email ?? '',
        site_name: slot.sites?.name ?? 'Unknown venue',
        date: new Date(slot.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        start_time: slot.start_time,
        end_time: slot.end_time,
        hours: slot.hours,
        reason: slot.reason,
        total: slot.total,
      }

      to = slot.users?.email ?? ''
      if (!to) throw new Error('No email found for user')

      if (type === 'slot_approved') email = extraSlotApproved(s)
      else email = extraSlotDenied(s)
    }

    else {
      throw new Error(`Unknown email type: ${type}`)
    }

    await sendEmail(to!, email!.subject, email!.html)

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
