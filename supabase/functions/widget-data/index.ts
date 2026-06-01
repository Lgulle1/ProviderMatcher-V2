import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = new URL(req.url)
    const widgetId = url.searchParams.get('id')
    if (!widgetId) {
      return new Response(JSON.stringify({ error: 'Missing widget id' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
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

    const [
      { data: org },
      { data: allProviders },
      { data: allOfferings },
      { data: caseTypes },
      { data: categories },
      { data: locations },
      { data: constraints },
      { data: allQuestions },
    ] = await Promise.all([
      supabase.from('organizations').select('fallback_phone,fallback_message,allowed_domains').eq('id', orgId).single(),
      supabase.from('providers').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('offerings').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('case_types').select('*').eq('org_id', orgId).eq('is_archived', false).order('name'),
      supabase.from('categories').select('*').eq('org_id', orgId).eq('is_archived', false).order('name'),
      supabase.from('locations').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('constraints').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('questions').select('*').eq('org_id', orgId).eq('is_archived', false).order('order_rank'),
    ])

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
      }),
      {
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
