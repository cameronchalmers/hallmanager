import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getGoogleAccessToken,
  createCalendarEvent,
  deleteCalendarEvent,
} from '../_shared/google-calendar.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Auth — admin/manager only
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const { action, booking_id } = await req.json() as { action: 'create' | 'delete'; booking_id: string }

    // Load credentials
    const serviceAccountKeyRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    if (!serviceAccountKeyRaw) {
      return new Response(JSON.stringify({ error: 'Google Calendar not configured' }), { status: 503, headers: corsHeaders })
    }

    // Fetch booking to get site_id
    const { data: bookingForSite } = await supabase
      .from('bookings').select('site_id').eq('id', booking_id).single()
    const { data: siteCreds } = await supabase
      .from('site_credentials').select('google_calendar_id').eq('site_id', bookingForSite?.site_id ?? '').single()
    const calendarId = siteCreds?.google_calendar_id
    if (!calendarId) {
      return new Response(JSON.stringify({ error: 'Google Calendar ID not set for this site' }), { status: 503, headers: corsHeaders })
    }

    const accessToken = await getGoogleAccessToken(JSON.parse(serviceAccountKeyRaw))

    if (action === 'create') {
      const { data: booking, error: bookingErr } = await supabase
        .from('bookings')
        .select('*, sites(name)')
        .eq('id', booking_id)
        .single()
      if (bookingErr || !booking) {
        return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404, headers: corsHeaders })
      }

      const eventId = await createCalendarEvent(accessToken, calendarId, {
        name: booking.name,
        event: booking.event,
        date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        site_name: (booking.sites as { name: string } | null)?.name ?? 'Unknown venue',
        notes: booking.notes,
      })

      await supabase.from('bookings').update({ google_calendar_event_id: eventId }).eq('id', booking_id)
      return new Response(JSON.stringify({ ok: true, event_id: eventId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      const { data: booking } = await supabase
        .from('bookings')
        .select('google_calendar_event_id')
        .eq('id', booking_id)
        .single()

      const eventId = (booking as { google_calendar_event_id?: string } | null)?.google_calendar_event_id
      if (eventId) {
        await deleteCalendarEvent(accessToken, calendarId, eventId)
        await supabase.from('bookings').update({ google_calendar_event_id: null }).eq('id', booking_id)
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })
  } catch (err) {
    console.error('manage-calendar-event error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
