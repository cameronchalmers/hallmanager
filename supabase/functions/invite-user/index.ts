import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ACCENT = '#7c3aed'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://hallmanager.co.uk'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'HallManager <noreply@hallmanager.co.uk>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function resetEmail(name: string, resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body style="font-family:'Figtree',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fc;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;background:${ACCENT};border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:white;font-weight:700;font-size:18px;line-height:1;">H</span>
        </div>
        <span style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.3px;">HallManager</span>
      </div>
    </div>
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">
      <div style="padding:32px 32px 0;border-bottom:3px solid ${ACCENT};">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${ACCENT};letter-spacing:0.5px;text-transform:uppercase;">Password Reset</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Reset your password</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${name}, click the button below to choose a new password for your HallManager account.</p>
      </div>
      <div style="padding:24px 32px;text-align:center;">
        <a href="${resetUrl}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Reset Password</a>
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This link expires in 24 hours. If you didn't request a password reset, you can ignore this email.</p>
      </div>
    </div>
    <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;">
      <p style="margin:0;">HallManager · <a href="${SITE_URL}" style="color:#9ca3af;">${SITE_URL.replace('https://', '')}</a></p>
    </div>
  </div>
</body>
</html>`
}

function inviteEmail(name: string, inviteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body style="font-family:'Figtree',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fc;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;background:${ACCENT};border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:white;font-weight:700;font-size:18px;line-height:1;">H</span>
        </div>
        <span style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.3px;">HallManager</span>
      </div>
    </div>
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">
      <div style="padding:32px 32px 0;border-bottom:3px solid ${ACCENT};">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${ACCENT};letter-spacing:0.5px;text-transform:uppercase;">You're invited</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Welcome to HallManager</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${name}, you've been invited to access the HallManager portal. Click below to set your password and get started.</p>
      </div>
      <div style="padding:24px 32px;text-align:center;">
        <a href="${inviteUrl}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Accept Invitation</a>
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This link expires in 24 hours. If you weren't expecting this, you can ignore it.</p>
      </div>
    </div>
    <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;">
      <p style="margin:0;">HallManager · <a href="${SITE_URL}" style="color:#9ca3af;">${SITE_URL.replace('https://', '')}</a></p>
    </div>
  </div>
</body>
</html>`
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { ok: false as const, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return { ok: false as const, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'manager'].includes(profile.role)) return { ok: false as const, response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

  return { ok: true as const }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const { email, name, role, reset } = await req.json()

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Password reset flow — always generate a recovery link
    if (reset) {
      const { data: recoveryData, error: recoveryError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${SITE_URL}/login` },
      })
      if (recoveryError || !recoveryData) {
        return new Response(JSON.stringify({ error: recoveryError?.message ?? 'Failed to generate link' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const resetUrl = recoveryData.properties.action_link
      const displayName = name ? name.split(' ')[0] : 'there'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: email,
          subject: 'Reset your HallManager password',
          html: resetEmail(displayName, resetUrl),
        }),
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Try invite link first; fall back to recovery link if user already exists in auth
    let linkData, isNewUser = true
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${SITE_URL}/login` },
    })

    if (inviteError) {
      // User likely already exists — generate a password reset link instead
      isNewUser = false
      const { data: recoveryData, error: recoveryError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${SITE_URL}/login` },
      })
      if (recoveryError || !recoveryData) {
        return new Response(JSON.stringify({ error: recoveryError?.message ?? 'Failed to generate link' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      linkData = recoveryData
    } else {
      linkData = inviteData
    }

    if (!linkData) {
      return new Response(JSON.stringify({ error: 'Failed to generate link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only create the public.users row for genuinely new users (name + role provided)
    if (isNewUser && name && role) {
      await supabase.from('users').upsert({
        id: linkData.user.id,
        email,
        name,
        role,
        site_ids: [],
      })
    }

    // Send our own branded email via Resend
    const inviteUrl = linkData.properties.action_link
    const displayName = name ? name.split(' ')[0] : 'there'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: 'You\'ve been invited to HallManager',
        html: inviteEmail(displayName, inviteUrl),
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      // Don't fail — user was created, just email failed
    }

    return new Response(JSON.stringify({ user: linkData.user }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('invite-user error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
