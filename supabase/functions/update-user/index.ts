import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await req.json()
    const user_id: string = body.user_id
    const updates = body.updates

    if (!user_id || !updates) return json({ ok: false, error: 'user_id and updates required' })

    console.log('update-user', user_id, JSON.stringify(updates))

    const { error } = await supabase.from('users').update(updates).eq('id', user_id)

    if (error) {
      console.error('db error', JSON.stringify(error))
      return json({ ok: false, error: error.message })
    }

    return json({ ok: true })
  } catch (e) {
    console.error('caught', String(e))
    return json({ ok: false, error: String(e) })
  }
})
