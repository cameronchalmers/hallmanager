import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { ok: false as const, response: json({ error: 'Unauthorized' }, 401) }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return { ok: false as const, response: json({ error: 'Unauthorized' }, 401) }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return { ok: false as const, response: json({ error: 'Forbidden' }, 403) }
  }

  return { ok: true as const, serviceClient }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { user_id } = await req.json()
  if (!user_id) return json({ error: 'user_id required' }, 400)

  // Delete from public.users first (FK), then auth.users
  await auth.serviceClient.from('users').delete().eq('id', user_id)
  const { error } = await auth.serviceClient.auth.admin.deleteUser(user_id)

  if (error) {
    console.error('delete-user error:', error)
    return json({ error: error.message }, 500)
  }

  return json({ ok: true })
})
