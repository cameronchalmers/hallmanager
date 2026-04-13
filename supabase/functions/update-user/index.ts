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

  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const body = await req.json()
    const user_id: string = body.user_id
    const updates = body.updates

    if (!user_id || !updates) return json({ ok: false, error: 'user_id and updates required' })

    // Prevent escalation: only admins can set role to admin/manager
    if (updates.role && updates.role !== 'regular') {
      const authHeader = req.headers.get('Authorization')!
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: { user } } = await userClient.auth.getUser()
      const { data: caller } = await auth.serviceClient.from('users').select('role').eq('id', user!.id).single()
      if (!caller || caller.role !== 'admin') {
        return json({ ok: false, error: 'Only admins can change roles' }, 403)
      }
    }

    const { error } = await auth.serviceClient.from('users').update(updates).eq('id', user_id)
    if (error) return json({ ok: false, error: error.message })

    return json({ ok: true })
  } catch (e) {
    console.error('update-user error:', e)
    return json({ ok: false, error: 'Internal server error' }, 500)
  }
})
