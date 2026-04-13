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
    return new Response(JSON.stringify({ error: 'user_id and updates required' }), { status: 400, headers: corsHeaders })
  }

  const { error } = await supabase.from('users').update(updates).eq('id', user_id)

  if (error) {
    console.error('update-user error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
})
