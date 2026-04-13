import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { user_id, updates } = await req.json()
  if (!user_id || !updates) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id and updates required' }), { headers: corsHeaders })
  }

  // site_ids is a Postgres array — PostgREST needs it sent as a plain array (no special casting needed,
  // but we make sure nulls are stripped and it's a real array)
  const payload: Record<string, unknown> = { ...updates }
  if ('site_ids' in payload && !Array.isArray(payload.site_ids)) {
    payload.site_ids = []
  }

  console.log('update-user payload:', JSON.stringify(payload))

  const { error } = await supabase.from('users').update(payload).eq('id', user_id)

  if (error) {
    console.error('update-user error:', JSON.stringify(error))
    // Always return 200 so the client can read the error body
    return new Response(JSON.stringify({ ok: false, error: error.message, details: error.details, hint: error.hint }), { headers: corsHeaders })
  }

  return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
})
