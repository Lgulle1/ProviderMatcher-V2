import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'
import { readJsonBody } from '../_shared/guard.ts'

const ALLOW_HEADERS = 'Content-Type, Authorization, apikey'

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin')
  if (!origin) return null
  const configured = (Deno.env.get('ADMIN_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return configured.includes(origin) ? origin : null
}

serve(async (req) => {
  const origin = allowedOrigin(req)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers })

  if (req.method === 'OPTIONS') return origin ? json({ ok: true }, 200) : json({ error: 'Origin denied' }, 403)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!origin) return json({ error: 'Origin denied' }, 403)

  const authorization = req.headers.get('authorization')
  const accessToken = authorization?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'Authentication required' }, 401)

  const body = await readJsonBody(req)
  if (!body) return json({ error: 'Invalid request body' }, 400)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const role = typeof body.role === 'string' ? body.role : 'viewer'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return json({ error: 'Valid email required' }, 400)
  }
  if (!name || name.length > 200 || !['viewer', 'editor', 'owner'].includes(role)) {
    return json({ error: 'Valid name and role required' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json({ error: 'Service is not configured' }, 500)
  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userResult, error: userError } = await service.auth.getUser(accessToken)
  if (userError || !userResult.user) return json({ error: 'Authentication required' }, 401)

  // Run every database operation as the caller so RLS remains authoritative
  // and audit triggers record auth.uid(). The service-role client is reserved
  // solely for the Auth Admin invitation operation below.
  const actorClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: actor, error: actorError } = await actorClient
    .from('users')
    .select('id,org_id,role')
    .eq('id', userResult.user.id)
    .single()
  if (actorError || !actor || actor.role !== 'owner') return json({ error: 'Owner role required' }, 403)

  const { data: existing } = await actorClient
    .from('organization_invitations')
    .select('id,status')
    .eq('email', email)
    .maybeSingle()
  if (existing) return json({ error: 'An invitation or account already exists for that email' }, 409)

  const { data: org, error: orgError } = await actorClient
    .from('organizations')
    .select('name')
    .eq('id', actor.org_id)
    .single()
  if (orgError || !org) return json({ error: 'Organization not found' }, 404)

  const redirectTo = Deno.env.get('ADMIN_INVITE_REDIRECT_URL')
  if (!redirectTo?.startsWith('https://')) return json({ error: 'Invite redirect is not configured' }, 500)

  const { data: invitation, error: recordError } = await actorClient
    .from('organization_invitations')
    .insert({ org_id: actor.org_id, email, role, invited_by: actor.id })
    .select('id')
    .single()
  if (recordError || !invitation) return json({ error: 'Unable to record invitation' }, 500)

  const { data: inviteResult, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name, organization_name: org.name },
    redirectTo,
  })
  if (inviteError || !inviteResult.user) {
    // Compensate so a failed email/Auth operation does not strand a pending
    // tenant invitation that can never be accepted.
    await actorClient.from('organization_invitations').delete().eq('id', invitation.id)
    return json({ error: 'Unable to send invitation' }, 400)
  }

  return json({ ok: true }, 200)
})
