import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isHostAllowed, requestHost } from '../_shared/origin.ts'
import {
  boundedAnswers,
  boundedInt,
  boundedText,
  boundedUuidArray,
  clientKey,
  isUuid,
  LIMITS,
  rateLimit,
  readJsonBody,
} from '../_shared/guard.ts'

// The widget sends apikey alongside Authorization on this endpoint.
const ALLOW_HEADERS = 'Content-Type, apikey, Authorization'

/**
 * The widget reports scroll depth as an engagement summary object, e.g.
 * {"max_position_seen":3,"time_in_results_ms":8500} — not a raw percentage.
 * Reshaped rather than stored as sent, so a forged payload can't smuggle
 * arbitrary fields into the analytics jsonb.
 */
function boundedScrollDepth(
  value: unknown,
): { max_position_seen: number; time_in_results_ms: number } | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const maxPositionSeen = boundedInt(v.max_position_seen, 0, 10_000)
  const timeInResultsMs = boundedInt(v.time_in_results_ms, 0, 24 * 60 * 60 * 1000)
  if (maxPositionSeen === null || timeInResultsMs === null) return null
  return { max_position_seen: maxPositionSeen, time_in_results_ms: timeInResultsMs }
}

/**
 * This endpoint is unauthenticated by necessity — it is called by anonymous
 * visitors on a customer's site — but it writes with the service role key, so
 * every request is gated before it reaches the database:
 *
 *   1. rate limited per caller
 *   2. body size- and shape-checked
 *   3. widget_id resolved to a real widget, and the caller's origin checked
 *      against that org's allowed_domains
 *   4. every persisted field bounded in length
 *
 * Writes here feed the booking-fairness ranking, so unbounded click reporting
 * is not just noisy analytics — it lets a third party influence which provider
 * a patient is shown first.
 */
serve(async (req) => {
  const cors = corsHeaders(req, ALLOW_HEADERS, false)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', ...extra },
    })

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    if (!rateLimit(`track:${clientKey(req)}`, 60, 60_000)) {
      return json({ error: 'Too many requests' }, 429, { 'Retry-After': '60' })
    }

    const body = await readJsonBody(req)
    if (!body) return json({ error: 'Invalid request body' }, 400)

    const widgetId = body.widget_id
    if (!isUuid(widgetId)) return json({ error: 'Invalid widget_id' }, 400)

    const sessionId = isUuid(body.session_id) ? body.session_id : crypto.randomUUID()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY'))!,
    )

    // Resolve the widget once, and take org_id from the widget rather than the
    // request body — a caller must not be able to attribute traffic to an org
    // by asserting its id.
    const { data: widget } = await supabase
      .from('widgets')
      .select('org_id')
      .eq('id', widgetId)
      .maybeSingle()

    if (!widget) return json({ error: 'Widget not found' }, 404)
    const orgId = (widget.org_id as string) ?? null

    const { data: org } = await supabase
      .from('organizations')
      .select('allowed_domains')
      .eq('id', orgId)
      .maybeSingle()

    if (!isHostAllowed(requestHost(req), org?.allowed_domains)) {
      return json({ error: 'Domain not authorized' }, 403)
    }

    /** Most recent session row for this widget+session pair, or null. */
    const currentSession = async (columns: string) => {
      const { data } = await supabase
        .from('widget_sessions')
        .select(columns)
        .eq('widget_id', widgetId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as Record<string, unknown> | null
    }

    if (body.type === 'click') {
      if (!isUuid(body.provider_id)) return json({ error: 'Invalid provider_id' }, 400)
      const row = await currentSession('id, providers_clicked, clicks_detail')
      if (!row) return json({ ok: true })

      const prev = (row.providers_clicked ?? []) as string[]
      const next = prev.includes(body.provider_id)
        ? prev
        : [...prev, body.provider_id].slice(0, LIMITS.arrayItems)

      // Cap history: a session that keeps clicking must not grow a row forever.
      const prevClicks = (row.clicks_detail ?? []) as unknown[]
      const clicksDetail = [
        ...prevClicks,
        {
          provider_id: body.provider_id,
          position_at_click: boundedInt(body.position_at_click, 0, 10_000),
          click_order: boundedInt(body.click_order, 0, 10_000),
          clicked_at: new Date().toISOString(),
        },
      ].slice(-LIMITS.clicksDetail)

      await supabase
        .from('widget_sessions')
        .update({ providers_clicked: next, clicks_detail: clicksDetail })
        .eq('id', row.id)

      return json({ ok: true })
    }

    if (body.type === 'scroll') {
      const depth = boundedScrollDepth(body.scroll_depth)
      if (depth === null) return json({ error: 'Invalid scroll_depth' }, 400)
      const row = await currentSession('id')
      if (row) {
        await supabase.from('widget_sessions').update({ scroll_depth: depth }).eq('id', row.id)
      }
      return json({ ok: true })
    }

    if (body.type === 'event') {
      const eventType = boundedText(body.event_type, 100)
      if (!eventType) return json({ error: 'Invalid event_type' }, 400)

      const { error } = await supabase.from('widget_session_events').insert({
        session_id: sessionId,
        widget_id: widgetId,
        org_id: orgId,
        event_type: eventType,
        step_index: boundedInt(body.step_index, 0, 1_000),
        question_id: isUuid(body.question_id) ? body.question_id : null,
        question_text: boundedText(body.question_text),
        answer_text: boundedText(body.answer_text),
      })

      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    const payload = {
      widget_id: widgetId,
      org_id: orgId,
      session_id: sessionId,
      case_type_id: isUuid(body.case_type_id) ? body.case_type_id : null,
      answers: boundedAnswers(body.answers),
      results_count: boundedInt(body.results_count, 0, 10_000) ?? 0,
      zero_results: body.zero_results === true,
      providers_clicked: boundedUuidArray(body.providers_clicked),
      providers_shown: boundedUuidArray(body.providers_shown),
      // Reshaped rather than stored as sent, so a forged payload can't smuggle
      // arbitrary objects into the analytics jsonb.
      results_positions: Array.isArray(body.results_positions)
        ? body.results_positions
            .slice(0, LIMITS.arrayItems)
            .map((entry) => {
              const e = (entry ?? {}) as Record<string, unknown>
              return {
                provider_id: isUuid(e.provider_id) ? e.provider_id : null,
                position: boundedInt(e.position, 0, 10_000),
              }
            })
            .filter((e) => e.provider_id !== null)
        : [],
      scroll_depth: boundedScrollDepth(body.scroll_depth),
    }

    // Scope the upsert lookup by widget too, so a session id can only ever
    // touch the row it belongs to.
    const existing = await currentSession('id')
    if (existing) {
      await supabase.from('widget_sessions').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('widget_sessions').insert(payload)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('track-session failed', e)
    return json({ error: 'Internal error' }, 500)
  }
})
