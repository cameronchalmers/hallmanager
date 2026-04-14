import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'HallManager <noreply@hallmanager.co.uk>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function esc(t: string) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function reminderEmail(name: string, event: string, date: string, time: string, siteName: string, address: string): string {
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
      <div style="padding:32px 32px 0;border-bottom:3px solid #7c3aed;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#7c3aed;letter-spacing:0.5px;text-transform:uppercase;">Reminder — Tomorrow</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Your booking is tomorrow!</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(name)}, just a friendly reminder about your upcoming booking.</p>
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
            <td style="padding:10px 14px;color:#6b7280;font-weight:500;">Time</td>
            <td style="padding:10px 14px;color:#111827;font-weight:600;">${esc(time)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#6b7280;font-weight:500;">Venue</td>
            <td style="padding:10px 14px;color:#111827;font-weight:600;">${esc(siteName)}</td>
          </tr>
          ${address ? `<tr style="background:#f9fafb;">
            <td style="padding:10px 14px;color:#6b7280;font-weight:500;">Address</td>
            <td style="padding:10px 14px;color:#111827;font-weight:600;">${esc(address)}</td>
          </tr>` : ''}
        </table>
        <div style="margin-top:24px;padding:16px;background:#f5f3ff;border-radius:10px;border:1px solid #ddd6fe;">
          <p style="margin:0;font-size:14px;color:#5b21b6;">We look forward to welcoming you. If you need to make any changes, please contact us as soon as possible.</p>
        </div>
        <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">This is an automated reminder — please do not reply to this email.</p>
      </div>
    </div>
    <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;">
      <p style="margin:0;">HallManager · This email was sent automatically.</p>
    </div>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Called by pg_cron with service role key — verify it
  const authHeader = req.headers.get('Authorization')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  // Tomorrow's date in YYYY-MM-DD (UTC — pg_cron runs in UTC, booking dates are stored as dates)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*, sites(name, address)')
    .eq('type', 'oneoff')
    .in('status', ['confirmed', 'approved'])
    .eq('date', tomorrowStr)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!bookings?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  const errors: string[] = []

  for (const booking of bookings) {
    try {
      const date = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      const time = `${booking.start_time} – ${booking.end_time}`
      const siteName = (booking.sites as { name: string; address: string } | null)?.name ?? 'Unknown venue'
      const address = (booking.sites as { name: string; address: string } | null)?.address ?? ''

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: booking.email,
          subject: `Reminder: your booking is tomorrow — ${booking.event}`,
          html: reminderEmail(booking.name, booking.event, date, time, siteName, address),
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        errors.push(`Email for ${booking.id}: ${err}`)
      } else {
        sent++
      }
    } catch (e) {
      errors.push(`Email for ${booking.id}: ${String(e)}`)
    }
  }

  console.log(`send-reminder: sent ${sent}, errors: ${errors.length}`)
  return new Response(JSON.stringify({ ok: true, sent, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
