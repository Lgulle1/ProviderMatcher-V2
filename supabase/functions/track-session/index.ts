import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (body.type === 'click' && body.provider_id && body.widget_id && body.session_id) {
      const { data: row } = await supabase
        .from('widget_sessions')
        .select('id, providers_clicked')
        .eq('widget_id', body.widget_id)
        .eq('session_id', body.session_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (row) {
        const prev = (row.providers_clicked ?? []) as string[]
        const next = prev.includes(body.provider_id) ? prev : [...prev, body.provider_id]
        await supabase.from('widget_sessions').update({ providers_clicked: next }).eq('id', row.id)
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (body.type === 'event') {
      let orgId = body.org_id ?? null
      if (!orgId && body.widget_id) {
        const { data: w } = await supabase.from('widgets').select('org_id').eq('id', body.widget_id).maybeSingle()
        orgId = w?.org_id ?? null
      }
      const { error } = await supabase.from('widget_session_events').insert({
        session_id: body.session_id,
        widget_id: body.widget_id,
        org_id: orgId,
        event_type: body.event_type,
        step_index: body.step_index ?? null,
        question_id: body.question_id ?? null,
        question_text: body.question_text ?? null,
        answer_text: body.answer_text ?? null,
      })

      if (error) {
        throw new Error(error.message)
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: widget } = await supabase
      .from('widgets')
      .select('org_id')
      .eq('id', body.widget_id)
      .maybeSingle()

    const sessionId = body.session_id || crypto.randomUUID()

    // Check if a row already exists for this session (e.g. after a restart in the same session)
    const { data: existing } = await supabase
      .from('widget_sessions')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle()

    const payload = {
      widget_id: body.widget_id,
      org_id: widget?.org_id ?? null,
      session_id: sessionId,
      case_type_id: body.case_type_id ?? null,
      answers: body.answers || {},
      results_count: body.results_count ?? 0,
      zero_results: body.zero_results === true,
      providers_clicked: body.providers_clicked || [],
      providers_shown: body.providers_shown || [],
    }

    if (existing) {
      await supabase.from('widget_sessions').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('widget_sessions').insert(payload)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
