import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  bookingSubmitted,
  bookingApproved,
  bookingConfirmed,
  bookingDenied,
  bookingCancelled,
  depositRefunded,
  extraSlotApproved,
  extraSlotDenied,
  bookingSubmittedAdmin,
  bookingReview,
  type BookingData,
  type ExtraSlotData,
} from './templates.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'HallManager <onboarding@resend.dev>'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://hallmanager.co.uk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAdminEmailsForSite(supabase: any, siteId: string): Promise<string[]> {
  // Global admins get all sites; site_admins/managers only get their assigned sites
  const { data } = await supabase
    .from('users')
    .select('email, role, site_ids')
    .in('role', ['admin', 'site_admin', 'manager'])
  const users = (data ?? []) as { email: string; role: string; site_ids: string[] | null }[]
  return users
    .filter(u => u.role === 'admin' || (u.site_ids ?? []).includes(siteId))
    .map(u => u.email)
    .filter(Boolean)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAllAdminEmails(supabase: any): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('email')
    .in('role', ['admin', 'site_admin', 'manager'])
  return (data ?? []).map((u: { email: string }) => u.email).filter(Boolean)
}

function formatBookingDate(date: string, endDate?: string | null): string {
  const fmt = (ds: string) => new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return endDate && endDate !== date ? `${fmt(date)} – ${fmt(endDate)}` : fmt(date)
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
  const body = await res.json()
  if (!res.ok) {
    console.error(`Resend error sending to ${to}:`, JSON.stringify(body))
    throw new Error(`Resend error: ${JSON.stringify(body)}`)
  }
  console.log(`Email sent to ${to} — id: ${body.id}`)
  return body
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

    const { type, id, data: inlineData, template } = await req.json() as { type: string; id?: string; data?: Partial<BookingData>; template?: string }

    // Staff (admin/site_admin/manager) can send any email type. Unauthenticated
    // callers can only trigger 'booking_submitted', and even then the email is
    // built from a real, recently created pending booking row — never from
    // caller-supplied content.
    let isStaff = false
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (profile && ['admin', 'site_admin', 'manager'].includes(profile.role)) isStaff = true
      }
    }
    if (!isStaff && type !== 'booking_submitted') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // ── Booking emails ────────────────────────────────────────────────────────

    if (['booking_submitted', 'booking_approved', 'booking_confirmed', 'booking_denied', 'booking_cancelled'].includes(type)) {
      // deno-lint-ignore no-explicit-any
      let booking: any = null

      if (!isStaff) {
        // Public form submission — resolve the booking it just inserted. The
        // legacy client passes form data; use it only to locate the row.
        let q = supabase
          .from('bookings')
          .select('*')
          .eq('status', 'pending')
          .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
        if (id) {
          q = q.eq('id', id)
        } else if (inlineData?.site_id && inlineData?.email && inlineData?.date) {
          q = q.eq('site_id', inlineData.site_id).eq('email', inlineData.email).eq('date', inlineData.date)
        } else {
          throw new Error('booking id required')
        }
        const { data: rows, error } = await q
        if (error || !rows?.length) throw new Error('Booking not found')
        booking = rows[0]
      } else {
        // Staff actions pass an id; look up the booking with service role
        const { data: row, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', id)
          .single()
        if (error || !row) throw new Error(`Booking not found: ${id}`)
        booking = row
      }

      const { data: site } = await supabase
        .from('sites')
        .select('name, whatsapp_number, site_type, pricing_mode')
        .eq('id', booking.site_id)
        .single()

      const isVehicle = site?.site_type === 'vehicle'
      const isSplitSite = site?.pricing_mode === 'packages' || isVehicle
      const hireDays = booking.end_date
        ? Math.round((new Date(booking.end_date).getTime() - new Date(booking.date).getTime()) / 86400000) + 1
        : 1
      const b: BookingData = {
        name: booking.name,
        email: booking.email,
        event: booking.event,
        date: formatBookingDate(booking.date, booking.end_date),
        start_time: booking.start_time,
        end_time: booking.end_time,
        time_display: isVehicle ? (booking.package_label ?? 'Vehicle hire') : null,
        duration_display: isVehicle ? `${hireDays} day${hireDays !== 1 ? 's' : ''}` : null,
        hours: booking.hours,
        site_name: site?.name ?? 'Unknown venue',
        site_id: booking.site_id,
        deposit: booking.deposit,
        total: booking.total,
        notes: booking.notes,
        payment_url: `${SITE_URL}/pay/${booking.id}`,
        whatsapp_number: site?.whatsapp_number ?? null,
      }

      // Split-payment context for package sites: 25% now, balance 14 days before
      if (isSplitSite && ['booking_approved', 'booking_confirmed'].includes(type)) {
        const total = Math.round(Number(booking.total))
        const paid = Math.round(Number(booking.amount_paid ?? 0))
        const fp = (p: number) => `£${(p / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
        const balDue = new Date(booking.date + 'T12:00:00')
        balDue.setDate(balDue.getDate() - 14)
        const balDueStr = balDue.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const daysAway = Math.floor((new Date(booking.date + 'T12:00:00').getTime() - Date.now()) / 86400000)
        if (type === 'booking_approved') {
          if (paid > 0 && paid < total) {
            b.payment_note = `${fp(paid)} deposit already received. The remaining balance of ${fp(total - paid)} is due by ${balDueStr}.`
            b.pay_now_amount = total - paid
          } else if (daysAway > 14) {
            b.pay_now_amount = Math.round(total * 0.25)
            b.payment_note = `A ${fp(b.pay_now_amount)} deposit (25%) confirms your booking. The remaining ${fp(total - b.pay_now_amount)} is due by ${balDueStr} — we'll email you a payment link nearer the time.`
          } else {
            b.payment_note = `As your booking is less than 14 days away, full payment of ${fp(total)} is due to confirm.`
          }
        } else if (type === 'booking_confirmed') {
          if (paid > 0 && paid < total) {
            b.payment_note = `${fp(paid)} deposit received. The remaining balance of ${fp(total - paid)} is due by ${balDueStr}.`
          } else {
            b.payment_note = `Paid in full — nothing more to pay.`
          }
        }
      }

      if (type === 'booking_submitted') {
        const bookerEmail = bookingSubmitted(b)
        await sendEmail(b.email, bookerEmail.subject, bookerEmail.html)
        if (b.site_id) {
          const adminEmails = await getAdminEmailsForSite(supabase, b.site_id)
          if (adminEmails.length > 0) {
            const adminEmail = bookingSubmittedAdmin(b)
            await Promise.all(adminEmails.map(email => sendEmail(email, adminEmail.subject, adminEmail.html)))
          }
        }
      } else if (type === 'booking_approved') {
        const email = bookingApproved(b)
        await sendEmail(b.email, email.subject, email.html)
      } else if (type === 'booking_confirmed') {
        const email = bookingConfirmed(b)
        await sendEmail(b.email, email.subject, email.html)
      } else if (type === 'booking_cancelled') {
        const email = bookingCancelled(b)
        await sendEmail(b.email, email.subject, email.html)
      } else {
        const email = bookingDenied(b)
        await sendEmail(b.email, email.subject, email.html)
      }
    }

    // ── Deposit refunded ──────────────────────────────────────────────────────

    else if (type === 'deposit_refunded') {
      const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', id).single()
      if (error || !booking) throw new Error(`Booking not found: ${id}`)
      const { data: site } = await supabase.from('sites').select('name, whatsapp_number').eq('id', booking.site_id).single()
      const email = depositRefunded({
        name: booking.name,
        email: booking.email,
        event: booking.event,
        date: formatBookingDate(booking.date, booking.end_date),
        start_time: booking.start_time,
        end_time: booking.end_time,
        hours: booking.hours,
        site_name: site?.name ?? 'Unknown venue',
        deposit: booking.deposit,
        total: booking.total,
        refunded_amount: booking.refunded_amount ?? booking.deposit,
        whatsapp_number: site?.whatsapp_number ?? null,
      })
      await sendEmail(booking.email, email.subject, email.html)
    }

    // ── Review request ────────────────────────────────────────────────────────

    else if (type === 'booking_review') {
      const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', id).single()
      if (error || !booking) throw new Error(`Booking not found: ${id}`)
      const { data: site } = await supabase.from('sites').select('name, whatsapp_number, google_review_url').eq('id', booking.site_id).single()
      const siteName = site?.name ?? 'our venue'
      const email = bookingReview(booking.name, booking.event, siteName, site?.google_review_url ?? null, site?.whatsapp_number ?? null)
      await sendEmail(booking.email, email.subject, email.html)
      await supabase.from('bookings').update({ review_sent: true }).eq('id', id)
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
      const allAdmins = await getAllAdminEmails(supabase)
      if (allAdmins.length === 0) throw new Error('No admin or manager users found')

      const dummyBooking: BookingData = {
        name: 'Jane Smith',
        email: allAdmins[0],
        event: 'Community Yoga',
        date: 'Wednesday, 30 July 2025',
        start_time: '09:00',
        end_time: '11:00',
        hours: 2,
        site_name: 'The Old Town Hall',
        deposit: 5000,
        total: 13000,
        notes: 'Please ensure the mats are set out in advance.',
        payment_url: null,
      }

      const dummySlot: ExtraSlotData = {
        name: 'Jane Smith',
        email: allAdmins[0],
        site_name: 'The Old Town Hall',
        date: 'Wednesday, 30 July 2025',
        start_time: '09:00',
        end_time: '11:00',
        hours: 2,
        reason: 'We have a visiting instructor and need an extra session this week.',
        total: 8000,
      }

      let email: { subject: string; html: string }
      if (template === 'booking_submitted')       email = bookingSubmitted(dummyBooking)
      else if (template === 'booking_submitted_admin') email = bookingSubmittedAdmin(dummyBooking)
      else if (template === 'booking_approved')   email = bookingApproved(dummyBooking)
      else if (template === 'booking_denied')     email = bookingDenied(dummyBooking)
      else if (template === 'booking_cancelled')  email = bookingCancelled(dummyBooking)
      else if (template === 'slot_approved')      email = extraSlotApproved(dummySlot)
      else if (template === 'slot_denied')        email = extraSlotDenied(dummySlot)
      else if (template === 'booking_review')     email = bookingReview('Jane Smith', 'Community Yoga', 'The Old Town Hall')
      else if (template === 'booking_confirmed')   email = bookingConfirmed(dummyBooking)
      else if (template === 'deposit_refunded')   email = depositRefunded({ ...dummyBooking, refunded_amount: 5000 })
      else throw new Error(`Unknown template: ${template}`)

      await Promise.all(allAdmins.map(addr => sendEmail(addr, `[TEST] ${email.subject}`, email.html)))
    }

    else {
      throw new Error(`Unknown email type: ${type}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
