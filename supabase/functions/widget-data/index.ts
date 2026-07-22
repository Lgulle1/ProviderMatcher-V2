import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isHostAllowed, requestHost } from '../_shared/origin.ts'
import { clientKey, isUuid, rateLimit } from '../_shared/guard.ts'

// Keep in sync with the widget's fetch: it sends only Content-Type and
// Authorization, and adding to this list has previously broken preflight.
const ALLOW_HEADERS = 'Content-Type, Authorization'

serve(async (req) => {
  // Preflight leaks nothing, so answer it permissively; the domain list is
  // enforced on the actual GET, once we know which org the widget belongs to.
  const cors = corsHeaders(req, ALLOW_HEADERS, false)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (!rateLimit(`widget-data:${clientKey(req)}`, 120, 60_000)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' },
      })
    }

    const url = new URL(req.url)
    const widgetId = url.searchParams.get('id')
    if (!isUuid(widgetId)) {
      return new Response(JSON.stringify({ error: 'Missing widget id' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    )

    const { data: widget, error: widgetError } = await supabase
      .from('widgets')
      .select('*')
      .eq('id', widgetId)
      .eq('status', 'live')
      .single()

    if (widgetError || !widget) {
      return new Response(JSON.stringify({ error: 'Widget not found or not published' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const orgId = widget.org_id as string
    const snapshot = (widget.published_snapshot ?? {}) as Record<string, unknown>
    const scopedProviderIds = Array.isArray(snapshot.scoped_provider_ids) &&
        (snapshot.scoped_provider_ids as string[]).length
      ? (snapshot.scoped_provider_ids as string[])
      : null
    const scopedCaseTypeIds = Array.isArray(snapshot.scoped_case_type_ids) &&
        (snapshot.scoped_case_type_ids as string[]).length
      ? (snapshot.scoped_case_type_ids as string[])
      : null
    const scopedLocationIds = Array.isArray(snapshot.scoped_location_ids) &&
        (snapshot.scoped_location_ids as string[]).length
      ? (snapshot.scoped_location_ids as string[])
      : null
    const questionOrder = (widget.question_order ?? []) as string[]
    const scopedQuestionIds = Array.isArray(snapshot.scoped_question_ids) &&
        (snapshot.scoped_question_ids as string[]).length
      ? (snapshot.scoped_question_ids as string[])
      : null

    const orgQuery = Promise.resolve(
      supabase
        .from('organizations')
        .select('fallback_phone,fallback_message,allowed_domains,default_booking_mode,default_phone_mode,booking_fairness_scope,booking_fairness_window')
        .eq('id', orgId)
        .single()
    )

    const widgetSessionsQuery = orgQuery.then(({ data: org }) => {
      let query = supabase.from('widget_sessions').select('providers_clicked').eq('org_id', orgId)
      if (org?.booking_fairness_scope === 'widget') {
        query = query.eq('widget_id', widgetId)
      }
      const fairnessWindow = org?.booking_fairness_window
      if (fairnessWindow === '30d' || fairnessWindow === '7d') {
        const days = fairnessWindow === '30d' ? 30 : 7
        const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        query = query.gte('created_at', cutoffIso)
      }
      return query
    })

    const [
      { data: org },
      { data: allProviders },
      { data: allOfferings },
      { data: caseTypes },
      { data: categories },
      { data: locations },
      { data: constraints },
      { data: allQuestions },
      { data: widgetSessions },
    ] = await Promise.all([
      orgQuery,
      supabase.from('providers').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('offerings').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('case_types').select('*').eq('org_id', orgId).eq('is_archived', false).order('name'),
      supabase.from('categories').select('*').eq('org_id', orgId).eq('is_archived', false).order('name'),
      supabase.from('locations').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('constraints').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('questions').select('*').eq('org_id', orgId).eq('is_archived', false).order('order_rank'),
      widgetSessionsQuery,
    ])

    // Enforce the org's domain list here, not just in the widget. The
    // client-side check in widget.js runs after the payload has already been
    // delivered, so on its own it hides the UI without protecting the data.
    const host = requestHost(req)
    const locked = Array.isArray(org?.allowed_domains) && org.allowed_domains.length > 0
    if (!isHostAllowed(host, org?.allowed_domains)) {
      return new Response(JSON.stringify({ error: 'Domain not authorized' }), {
        status: 403,
        headers: { ...corsHeaders(req, ALLOW_HEADERS, true), 'Content-Type': 'application/json' },
      })
    }

    const providerBookingCounts: Record<string, number> = {}
    for (const row of widgetSessions ?? []) {
      const clicked = (row.providers_clicked ?? []) as string[]
      for (const providerId of clicked) {
        providerBookingCounts[providerId] = (providerBookingCounts[providerId] ?? 0) + 1
      }
    }

    const providers = scopedProviderIds
      ? (allProviders ?? []).filter((p) => scopedProviderIds.includes(p.id))
      : (allProviders ?? [])
    const filteredCaseTypes = scopedCaseTypeIds
      ? (caseTypes ?? []).filter((ct) => scopedCaseTypeIds.includes(ct.id))
      : (caseTypes ?? [])
    const filteredLocations = scopedLocationIds
      ? (locations ?? []).filter((l) => scopedLocationIds.includes(l.id))
      : (locations ?? [])
    const providerIds = providers.map((p) => p.id)
    const caseTypeIds = filteredCaseTypes.map((ct) => ct.id)
    const offerings = (allOfferings ?? []).filter(
      (o) => providerIds.includes(o.provider_id) && caseTypeIds.includes(o.case_type_id),
    )

    let questions = scopedQuestionIds
      ? (allQuestions ?? []).filter((q) => scopedQuestionIds.includes(q.id))
      : (allQuestions ?? [])

    if (questionOrder.length > 0) {
      const ordered: typeof questions = []
      for (const qId of questionOrder) {
        const found = questions.find((qq) => qq.id === qId)
        if (found) ordered.push(found)
      }
      const entryQ = questions.find((qq) => qq.question_type === 'entry')
      if (entryQ && !ordered.some((qq) => qq.question_type === 'entry')) {
        ordered.unshift(entryQ)
      }
      questions = ordered
    }

    const providerLocations = providerIds.length > 0
      ? ((await supabase.from('provider_locations').select('*').in('provider_id', providerIds)).data ?? [])
      : []

    return new Response(
      JSON.stringify({
        config: {
          widget_id: widgetId,
          org_id: orgId,
          primary_color: widget.primary_color,
          button_text: widget.button_text,
          greeting_text: widget.greeting_text,
          disclaimer_text: widget.disclaimer_text,
          fallback_message: widget.fallback_message || org?.fallback_message,
          fallback_phone: org?.fallback_phone,
          allowed_domains: org?.allowed_domains || [],
          embed_mode: widget.embed_mode,
          show_worth_the_drive: widget.show_worth_the_drive,
          default_booking_mode: org?.default_booking_mode || 'simple',
          default_phone_mode: org?.default_phone_mode || 'simple',
        },
        providers,
        offerings,
        caseTypes: filteredCaseTypes,
        categories: categories ?? [],
        locations: filteredLocations,
        constraints: constraints ?? [],
        questions,
        providerLocations,
        providerBookingCounts,
      }),
      {
        headers: {
          ...corsHeaders(req, ALLOW_HEADERS, locked),
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      },
    )
  } catch (e) {
    // Log the detail, return a generic message: this endpoint is public and
    // internal errors can name tables and columns.
    console.error('widget-data failed', e)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
