import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'
import { corsHeaders, isHostAllowed, requestHost } from '../_shared/origin.ts'
import {
  boundedInt,
  boundedText,
  boundedUuidArray,
  clientKey,
  isUuid,
  LIMITS,
  rateLimit,
  readJsonBody,
} from '../_shared/guard.ts'
import { verifySessionToken } from '../_shared/session-token.ts'

// The widget sends apikey alongside Authorization on this endpoint.
const ALLOW_HEADERS = 'Content-Type, apikey, Authorization'

const EVENT_TYPES = new Set([
  'widget_opened',
  'widget_closed',
  'case_type_selected',
  'question_answered',
  'zero_results_shown',
  'call_office_clicked',
  'start_over_clicked',
  'results_shown',
  'help_me_choose_clicked',
  'profile_viewed',
  'booking_clicked',
  'booking_options_opened',
  'call_clicked',
  'call_options_opened',
  'widget_error',
  'health_check_ping',
])

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
 * This endpoint is called by anonymous visitors on a customer's site and
 * writes with the service role key, so every request is gated before it
 * reaches the database:
 *
 *   1. rate limited per caller
 *   2. body size- and shape-checked
 *   3. a short-lived HMAC token bound to widget_id + session_id is verified
 *   4. widget_id resolved to a real widget, and the caller's origin checked
 *      against that org's allowed_domains
 *   5. every persisted field bounded in length
 *
 * Writes here feed the booking-fairness ranking, so unbounded click reporting
 * is not just noisy analytics — it lets a third party influence which provider
 * a patient is shown first.
 */
serve(async (req) => {
  const cors = corsHeaders(req, ALLOW_HEADERS, false)
  let responseCors = cors
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...responseCors, 'Content-Type': 'application/json', ...extra },
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

    const sessionId = body.session_id
    if (!isUuid(sessionId)) return json({ error: 'Invalid session_id' }, 400)

    const sessionSecret = Deno.env.get('WIDGET_SESSION_SECRET')
    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error('WIDGET_SESSION_SECRET must contain at least 32 characters')
    }
    if (!(await verifySessionToken(sessionSecret, body.session_token, widgetId, sessionId))) {
      return json({ error: 'Invalid or expired session token' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY'))!,
    )

    // Resolve the widget once, and take org_id from the widget rather than the
    // request body — a caller must not be able to attribute traffic to an org
    // by asserting its id.
    const { data: widget, error: widgetError } = await supabase
      .from('widgets')
      .select('org_id,status,published_snapshot')
      .eq('id', widgetId)
      .maybeSingle()

    if (widgetError) throw new Error(widgetError.message)
    if (!widget || widget.status !== 'live') return json({ error: 'Widget not found' }, 404)
    const orgId = (widget.org_id as string) ?? null

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('allowed_domains')
      .eq('id', orgId)
      .maybeSingle()

    if (orgError) throw new Error(orgError.message)
    const locked = Array.isArray(org?.allowed_domains) && org.allowed_domains.length > 0
    responseCors = corsHeaders(req, ALLOW_HEADERS, locked)
    if (!isHostAllowed(requestHost(req), org?.allowed_domains)) {
      return json({ error: 'Domain not authorized' }, 403)
    }

    const snapshot = (widget.published_snapshot ?? {}) as Record<string, unknown>
    const scope = (key: string): string[] | null => {
      const value = snapshot[key]
      return Array.isArray(value) && value.length > 0
        ? value.filter(isUuid)
        : null
    }
    const providerScope = scope('scoped_provider_ids')
    const caseTypeScope = scope('scoped_case_type_ids')
    const questionScope = scope('scoped_question_ids')

    const validateEntityIds = async (
      table: 'providers' | 'case_types' | 'questions',
      ids: string[],
      scopedIds: string[] | null,
    ): Promise<boolean> => {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) return true
      if (uniqueIds.some((id) => !isUuid(id))) return false
      if (scopedIds && uniqueIds.some((id) => !scopedIds.includes(id))) return false

      let query = supabase
        .from(table)
        .select('id')
        .eq('org_id', orgId)
        .in('id', uniqueIds)
      query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return (data ?? []).length === uniqueIds.length
    }

    /** Most recent session row for this widget+session pair, or null. */
    const currentSession = async (columns: string) => {
      const { data, error } = await supabase
        .from('widget_sessions')
        .select(columns)
        .eq('widget_id', widgetId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as Record<string, unknown> | null
    }

    if (body.type === 'click') {
      if (!isUuid(body.provider_id)) return json({ error: 'Invalid provider_id' }, 400)
      if (!(await validateEntityIds('providers', [body.provider_id], providerScope))) {
        return json({ error: 'Provider is not available for this widget' }, 400)
      }
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

      const { error } = await supabase
        .from('widget_sessions')
        .update({ providers_clicked: next, clicks_detail: clicksDetail })
        .eq('id', row.id)
      if (error) throw new Error(error.message)

      return json({ ok: true })
    }

    if (body.type === 'scroll') {
      const depth = boundedScrollDepth(body.scroll_depth)
      if (depth === null) return json({ error: 'Invalid scroll_depth' }, 400)
      const row = await currentSession('id')
      if (row) {
        const { error } = await supabase.from('widget_sessions').update({ scroll_depth: depth }).eq('id', row.id)
        if (error) throw new Error(error.message)
      }
      return json({ ok: true })
    }

    if (body.type === 'event') {
      const eventType = boundedText(body.event_type, 100)
      if (!eventType || !EVENT_TYPES.has(eventType)) return json({ error: 'Invalid event_type' }, 400)

      if (body.question_id !== null && body.question_id !== undefined) {
        if (!isUuid(body.question_id)) return json({ error: 'Invalid question_id' }, 400)
        if (!(await validateEntityIds('questions', [body.question_id], questionScope))) {
          return json({ error: 'Question is not available for this widget' }, 400)
        }
      }

      // Store only controlled operational codes. Question/answer display text
      // is configuration data that the analytics UI can resolve by id and must
      // not be duplicated into the event stream.
      let answerCode: string | null = null
      if (eventType === 'case_type_selected') {
        const submittedCaseTypeId = isUuid(body.answer_code) ? body.answer_code : null
        if (!submittedCaseTypeId || !(await validateEntityIds('case_types', [submittedCaseTypeId], caseTypeScope))) {
          return json({ error: 'Invalid case type code' }, 400)
        }
        answerCode = submittedCaseTypeId
      } else if (eventType === 'results_shown') {
        answerCode = body.answer_code === 'browse_all' ? 'browse_all' : 'matched'
      }

      const { error } = await supabase.from('widget_session_events').insert({
        session_id: sessionId,
        widget_id: widgetId,
        org_id: orgId,
        event_type: eventType,
        step_index: boundedInt(body.step_index, 0, 1_000),
        question_id: isUuid(body.question_id) ? body.question_id : null,
        question_text: null,
        answer_text: answerCode,
      })

      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    if (body.type !== 'session') {
      return json({ error: 'Invalid tracking type' }, 400)
    }

    const caseTypeId = isUuid(body.case_type_id) ? body.case_type_id : null
    if (caseTypeId && !(await validateEntityIds('case_types', [caseTypeId], caseTypeScope))) {
      return json({ error: 'Case type is not available for this widget' }, 400)
    }

    const providersClicked = boundedUuidArray(body.providers_clicked)
    const providersShown = boundedUuidArray(body.providers_shown)
    const resultsPositions = Array.isArray(body.results_positions)
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
      : []
    const submittedProviderIds = [
      ...providersClicked,
      ...providersShown,
      ...resultsPositions.map((entry) => entry.provider_id as string),
    ]
    if (!(await validateEntityIds('providers', submittedProviderIds, providerScope))) {
      return json({ error: 'Submitted providers are not available for this widget' }, 400)
    }

    const payload = {
      widget_id: widgetId,
      org_id: orgId,
      session_id: sessionId,
      case_type_id: caseTypeId,
      // Matching occurs in the browser. Persisting the full clinical answer
      // vector is unnecessary for operation and expands the privacy boundary.
      answers: {},
      results_count: boundedInt(body.results_count, 0, 10_000) ?? 0,
      zero_results: body.zero_results === true,
      providers_clicked: providersClicked,
      providers_shown: providersShown,
      // Reshaped rather than stored as sent, so a forged payload can't smuggle
      // arbitrary objects into the analytics jsonb.
      results_positions: resultsPositions,
      scroll_depth: boundedScrollDepth(body.scroll_depth),
    }

    // Scope the upsert lookup by widget too, so a session id can only ever
    // touch the row it belongs to.
    const existing = await currentSession('id')
    if (existing) {
      const { error } = await supabase.from('widget_sessions').update(payload).eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('widget_sessions').insert(payload)
      if (error) throw new Error(error.message)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('track-session failed', e)
    return json({ error: 'Internal error' }, 500)
  }
})
