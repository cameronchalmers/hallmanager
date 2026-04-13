import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'HallManager <noreply@hallmanager.co.uk>'
const CANCEL_DAYS = 14

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function cancelEmail(name: string, event: string, date: string, siteName: string): string {
  function esc(t: string) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap" rel="stylesheet" />
</head>
<body style="font-family:'Figtree',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fc;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;background:#7c3aed;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:white;font-weight:700;font-size:18px;line-height:1;">H</span>
        </div>
        <span style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.3px;">HallManager</span>
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="padding:32px 32px 0;border-bottom:3px solid #6b7280;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;letter-spacing:0.5px;text-transform:uppercase;">Booking Cancelled</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Your booking has been cancelled</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(name)}, unfortunately your booking was cancelled because payment was not received within ${CANCEL_DAYS} days of approval.</p>
      </div>
      <div style="padding:24px 32px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="background:#f9fafb;">
            <td style="padding:10px 14px;color:#6b7280;font-weight:500;width:40%;">Event</td>
            <td style="padding:10px 14px;color:#111827;font-weight:600;">${esc(event)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#6b7280;font-weight:500;">Date</td>
            <td style="padding:10px 14px;color:#111827;font-weight:600;">${esc(date)}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:10px 14px;color:#6b7280;font-weight:500;">Venue</td>
            <td style="padding:10px 14px;color:#111827;font-weight:600;">${esc(siteName)}</td>
          </tr>
        </table>
        <div style="margin-top:24px;padding:16px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;">
          <p style="margin:0;font-size:14px;color:#991b1b;">If you'd still like to book, please submit a new request and ensure payment is made promptly once approved.</p>
        </div>
        <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">If you believe this was a mistake, please contact us.</p>
      </div>
    </div>
    <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;">
      <p style="margin:0;">HallManager · This email was sent automatically — please do not reply.</p>
    </div>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // This function is called by pg_cron using the service role key — verify it
  const authHeader = req.headers.get('Authorization')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
  )

  // Find approved bookings where approved_at is older than CANCEL_DAYS
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - CANCEL_DAYS)

  const { data: overdue, error } = await supabase
    .from('bookings')
    .select('*, sites(name)')
    .eq('status', 'approved')
    .lt('approved_at', cutoff.toISOString())

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!overdue?.length) {
    return new Response(JSON.stringify({ ok: true, cancelled: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let cancelled = 0
  const errors: string[] = []

  for (const booking of overdue) {
    // Cancel the booking
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)

    if (updateErr) {
      errors.push(`${booking.id}: ${updateErr.message}`)
      continue
    }

    // Send cancellation email
    try {
      const date = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      const siteName = (booking.sites as { name: string } | null)?.name ?? 'Unknown venue'

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: booking.email,
          subject: `Booking cancelled — ${booking.event}`,
          html: cancelEmail(booking.name, booking.event, date, siteName),
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        errors.push(`Email for ${booking.id}: ${err}`)
      }
    } catch (e) {
      errors.push(`Email for ${booking.id}: ${String(e)}`)
    }

    cancelled++
  }

  return new Response(JSON.stringify({ ok: true, cancelled, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
