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

async function getCallerProfile(req: Request) {
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
  const { data: profile } = await serviceClient.from('users').select('role, site_ids').eq('id', user.id).single()
  if (!profile || !['admin', 'site_admin'].includes(profile.role)) {
    return { ok: false as const, response: json({ error: 'Forbidden' }, 403) }
  }

  return { ok: true as const, serviceClient, caller: profile as { role: string; site_ids: string[] } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const auth = await getCallerProfile(req)
    if (!auth.ok) return auth.response

    const body = await req.json()
    const user_id: string = body.user_id
    const updates = body.updates

    if (!user_id || !updates) return json({ ok: false, error: 'user_id and updates required' })

    const { caller, serviceClient } = auth

    // Fetch the target user to check their current role
    const { data: target } = await serviceClient.from('users').select('role, site_ids').eq('id', user_id).single()

    if (caller.role === 'site_admin') {
      // site_admins can only manage managers
      if (target && target.role !== 'manager' && !(updates.role === 'manager')) {
        return json({ ok: false, error: 'Site admins can only manage managers' }, 403)
      }
      // site_admins can only assign the manager role (not promote to site_admin or admin)
      if (updates.role && updates.role !== 'manager') {
        return json({ ok: false, error: 'Site admins can only assign the manager role' }, 403)
      }
    } else if (caller.role !== 'admin') {
      // Shouldn't reach here due to getCallerProfile check, but be safe
      return json({ ok: false, error: 'Forbidden' }, 403)
    }

    const { error } = await serviceClient.from('users').update(updates).eq('id', user_id)
    if (error) return json({ ok: false, error: error.message })

    return json({ ok: true })
  } catch (e) {
    console.error('update-user error:', e)
    return json({ ok: false, error: 'Internal server error' }, 500)
  }
})
