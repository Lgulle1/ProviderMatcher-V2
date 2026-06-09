import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  MousePointerClick,
  Users,
  TrendingUp,
  TrendingDown,
  Phone,
  BookOpen,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionEvent {
  id: string
  session_id: string
  widget_id: string
  org_id: string
  event_type: string
  step_index: number | null
  question_id: string | null
  question_text: string | null
  answer_text: string | null
  created_at: string
}

interface WidgetSession {
  id: string
  session_id: string
  widget_id: string | null
  org_id: string | null
  case_type_id: string | null
  answers: Record<string, unknown>
  results_count: number | null
  zero_results: boolean | null
  providers_clicked: string[]
  providers_shown: string[]
  created_at: string
}

interface WidgetRef { id: string; name: string; status: string }
interface CaseTypeRef { id: string; name: string }
interface ProviderRef { id: string; name: string }
interface QuestionRef { id: string; question_type: string }

interface AnalyticsData {
  events: SessionEvent[]
  sessions: WidgetSession[]
  widgets: WidgetRef[]
  caseTypes: CaseTypeRef[]
  providers: ProviderRef[]
  questions: QuestionRef[]
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAnalyticsData(orgId: string): Promise<AnalyticsData> {
  const [eventsRes, sessionsRes, widgetsRes, caseTypesRes, providersRes, questionsRes] = await Promise.all([
    supabase.from('widget_session_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('widget_sessions').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('widgets').select('id, name, status').eq('org_id', orgId).neq('status', 'archived'),
    supabase.from('case_types').select('id, name').eq('org_id', orgId),
    supabase.from('providers').select('id, name').eq('org_id', orgId),
    supabase.from('questions').select('id, question_type').eq('org_id', orgId).eq('is_archived', false),
  ])
  if (eventsRes.error) throw new Error(eventsRes.error.message)
  if (sessionsRes.error) throw new Error(sessionsRes.error.message)
  return {
    events: (eventsRes.data ?? []) as SessionEvent[],
    sessions: (sessionsRes.data ?? []) as WidgetSession[],
    widgets: (widgetsRes.data ?? []) as WidgetRef[],
    caseTypes: (caseTypesRes.data ?? []) as CaseTypeRef[],
    providers: (providersRes.data ?? []) as ProviderRef[],
    questions: (questionsRes.data ?? []) as QuestionRef[],
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

function LineChart({ counts, labels, total }: { counts: number[]; labels: string[]; total: number }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const width = 640
  const height = 140
  const padL = 0, padR = 0, padT = 12, padB = 0
  const w = width - padL - padR
  const h = height - padT - padB
  const max = Math.max(...counts, 1)

  const pts = counts.map((c, i) => ({
    x: padL + (counts.length > 1 ? (i / (counts.length - 1)) * w : w / 2),
    y: padT + h - (c / max) * h,
    c,
  }))

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = pts.length > 1
    ? `${pathD} L${pts[pts.length - 1].x},${padT + h} L${pts[0].x},${padT + h} Z`
    : ''

  // At most 7 x-axis labels, always first + last
  const labelIndices = new Set<number>()
  labelIndices.add(0)
  labelIndices.add(counts.length - 1)
  const slots = Math.min(5, counts.length - 2)
  for (let s = 1; s <= slots; s++) {
    labelIndices.add(Math.round(s * (counts.length - 1) / (slots + 1)))
  }

  // % position of each label index along the x axis (for HTML overlay)
  const labelItems = Array.from(labelIndices)
    .sort((a, b) => a - b)
    .map(i => ({ i, pct: counts.length > 1 ? (i / (counts.length - 1)) * 100 : 50 }))

  const hov = hovered !== null ? pts[hovered] : null
  // tooltip x as % for HTML positioning
  const hovPct = hovered !== null && counts.length > 1 ? (hovered / (counts.length - 1)) * 100 : null

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</span>
        <span className="text-sm text-slate-500">total opens</span>
      </div>

      {/* Chart + x-axis wrapper */}
      <div className="relative" onMouseLeave={() => setHovered(null)}>

        {/* SVG — line, area, dots, hit areas only (no text) */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ display: 'block', overflow: 'visible' }}
          aria-label="Sessions over time"
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>

          {areaD && <path d={areaD} fill="url(#lineGrad)" opacity={0.15} />}
          {pts.length > 1 && (
            <path d={pathD} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Hover guide line */}
          {hov && (
            <line x1={hov.x} y1={padT} x2={hov.x} y2={padT + h} stroke="#6366f1" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
          )}

          {/* Invisible hit strips */}
          {pts.map((p, i) => {
            const prev = pts[i - 1]
            const next = pts[i + 1]
            const left = prev ? (prev.x + p.x) / 2 : 0
            const right = next ? (p.x + next.x) / 2 : width
            return (
              <rect key={`hit-${i}`} x={left} y={padT} width={right - left} height={h}
                fill="transparent" onMouseEnter={() => setHovered(i)} />
            )
          })}

          {/* Dots */}
          {pts.map((p, i) => (
            <circle key={`dot-${i}`} cx={p.x} cy={p.y}
              r={hovered === i ? 5 : p.c > 0 ? 3 : 2}
              fill={p.c > 0 ? '#6366f1' : '#cbd5e1'}
              stroke={hovered === i ? '#fff' : 'none'}
              strokeWidth={2}
            />
          ))}
        </svg>

        {/* X-axis labels — HTML so they use app font sizing */}
        <div className="relative mt-1 h-4">
          {labelItems.map(({ i, pct }) => (
            <span
              key={i}
              className="absolute -translate-x-1/2 text-xs text-slate-400 first:translate-x-0 last:translate-x-[-100%]"
              style={{ left: `${pct}%` }}
            >
              {labels[i]}
            </span>
          ))}
        </div>

        {/* Tooltip — HTML overlay */}
        {hov !== null && hovered !== null && hovPct !== null && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-800 px-3 py-2 text-center shadow-lg"
            style={{ left: `${hovPct}%` }}
          >
            <p className="text-xs text-slate-400">{labels[hovered]}</p>
            <p className="text-sm font-semibold text-white">{hov.c.toLocaleString()} opens</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Funnel Chart ─────────────────────────────────────────────────────────────

type FunnelMode = 'combined' | 'booking' | 'call' | 'no-results'

interface FunnelStep {
  label: string
  count: number
  pct: number
  isCTA?: boolean
  isZeroResults?: boolean
}

function FunnelChart({ steps, mode, onModeChange }: {
  steps: FunnelStep[]
  mode: FunnelMode
  onModeChange: (m: FunnelMode) => void
}) {
  const max = steps[0]?.count ?? 1
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['combined', 'booking', 'call', 'no-results'] as FunnelMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? m === 'no-results' ? 'border-red-500 bg-red-500 text-white' : 'border-indigo-600 bg-indigo-600 text-white'
                : m === 'no-results' ? 'border-red-200 bg-white text-red-600 hover:border-red-400' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
            }`}
          >
            {m === 'combined' ? 'All CTAs' : m === 'booking' ? 'Book Only' : m === 'call' ? 'Call Only' : 'No Results'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className={`font-medium ${step.isZeroResults ? 'text-red-600' : step.isCTA ? 'text-indigo-700' : 'text-slate-700'}`}>{step.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums text-slate-900">{step.count.toLocaleString()}</span>
                <span className="w-10 text-right text-xs text-slate-500">{step.pct}%</span>
              </div>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-md bg-slate-100">
              <div
                className={`h-full rounded-md transition-all duration-500 ${
                  step.isZeroResults ? 'bg-red-400' : step.isCTA ? 'bg-indigo-600' : 'bg-indigo-400'
                }`}
                style={{ width: `${max > 0 ? (step.count / max) * 100 : 0}%` }}
              />
            </div>
            {i < steps.length - 1 && (() => {
              const dropped = steps[i].count - steps[i + 1].count
              const dropPct = steps[i].count > 0 ? Math.round((dropped / steps[i].count) * 100) : 0
              return dropped > 0 ? (
                <p className="mt-0.5 text-right text-xs text-red-400">
                  ↓ {dropped.toLocaleString()} dropped ({dropPct}%)
                </p>
              ) : null
            })()}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const orgId = useAuthStore(s => s.org?.id ?? '')
  const orgName = useAuthStore(s => s.org?.name ?? '')

  const [selectedWidgetId, setSelectedWidgetId] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<'7d' | '30d' | '90d' | 'custom'>('30d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [funnelMode, setFunnelMode] = useState<FunnelMode>('combined')
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const [showAllSessions, setShowAllSessions] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-v2', orgId],
    queryFn: () => fetchAnalyticsData(orgId),
    enabled: Boolean(orgId),
  })

  // ── Date bounds
  const { dateStart, dateEnd } = useMemo(() => {
    const now = new Date()
    if (datePreset === 'custom') {
      const s = customStart ? new Date(customStart) : null
      const e = customEnd ? new Date(customEnd) : null
      if (s) s.setHours(0, 0, 0, 0)
      if (e) e.setHours(23, 59, 59, 999)
      return { dateStart: s, dateEnd: e }
    }
    const days = datePreset === '7d' ? 6 : datePreset === '90d' ? 89 : 29
    const s = new Date(now)
    s.setDate(now.getDate() - days)
    s.setHours(0, 0, 0, 0)
    return { dateStart: s, dateEnd: null as Date | null }
  }, [datePreset, customStart, customEnd])

  // ── Filtered events & sessions
  const filteredEvents = useMemo(() => {
    let evs = data?.events ?? []
    if (selectedWidgetId !== 'all') evs = evs.filter(e => e.widget_id === selectedWidgetId)
    if (dateStart) evs = evs.filter(e => new Date(e.created_at) >= dateStart)
    if (dateEnd) evs = evs.filter(e => new Date(e.created_at) <= dateEnd)
    return evs
  }, [data?.events, selectedWidgetId, dateStart, dateEnd])

  const filteredSessions = useMemo(() => {
    let sess = data?.sessions ?? []
    if (selectedWidgetId !== 'all') sess = sess.filter(s => s.widget_id === selectedWidgetId)
    if (dateStart) sess = sess.filter(s => new Date(s.created_at) >= dateStart)
    if (dateEnd) sess = sess.filter(s => new Date(s.created_at) <= dateEnd)
    return sess
  }, [data?.sessions, selectedWidgetId, dateStart, dateEnd])

  // ── Lookup maps
  const caseTypeNameById = useMemo(() => {
    const m = new Map<string, string>()
    data?.caseTypes.forEach(ct => m.set(ct.id, ct.name))
    return m
  }, [data?.caseTypes])

  const providerNameById = useMemo(() => {
    const m = new Map<string, string>()
    data?.providers.forEach(p => m.set(p.id, p.name))
    return m
  }, [data?.providers])

  // Deduplicated sessions — newest row wins when duplicate session_ids exist
  const dedupedSessions = useMemo(() => {
    const seen = new Map<string, WidgetSession>()
    filteredSessions.forEach(s => { if (!seen.has(s.session_id)) seen.set(s.session_id, s) })
    return Array.from(seen.values())
  }, [filteredSessions])

  // ── Executive summary
  const summary = useMemo(() => {
    const opens = new Set(filteredEvents.filter(e => e.event_type === 'widget_opened').map(e => e.session_id)).size
    const results = new Set(filteredEvents.filter(e => e.event_type === 'results_shown').map(e => e.session_id)).size
    const bookingIds = new Set(filteredEvents.filter(e => e.event_type === 'booking_clicked').map(e => e.session_id))
    // Calls = regular call clicks + calls from the no-results screen
    const callIds = new Set([
      ...filteredEvents.filter(e => e.event_type === 'call_clicked').map(e => e.session_id),
      ...filteredEvents.filter(e => e.event_type === 'call_office_clicked').map(e => e.session_id),
    ])
    const ctas = new Set([...bookingIds, ...callIds]).size
    const zeroResults = dedupedSessions.filter(s => s.zero_results === true).length
    return {
      opens, results,
      bookings: bookingIds.size,
      calls: callIds.size,
      ctas,
      zeroResults,
      conversionRate: opens > 0 ? Math.round((ctas / opens) * 100) : 0,
    }
  }, [filteredEvents, filteredSessions])

  // ── No Results Pipeline (must be before funnelSteps)
  const noResultsPipeline = useMemo(() => {
    // Scope every step to sessions that actually hit no results. start_over_clicked
    // now also fires from the results screen, so counting it globally would wrongly
    // pull results-screen restarts into this funnel.
    const zeroResultSessionIds = new Set(dedupedSessions.filter(s => s.zero_results === true).map(s => s.session_id))
    const total = zeroResultSessionIds.size
    const called = new Set(filteredEvents.filter(e => e.event_type === 'call_office_clicked' && zeroResultSessionIds.has(e.session_id)).map(e => e.session_id)).size
    const restartedSessionIds = new Set(filteredEvents.filter(e => e.event_type === 'start_over_clicked' && zeroResultSessionIds.has(e.session_id)).map(e => e.session_id))
    const restarted = restartedSessionIds.size
    const recoveredIds = new Set(filteredEvents.filter(e =>
      (e.event_type === 'booking_clicked' || e.event_type === 'call_clicked') && restartedSessionIds.has(e.session_id)
    ).map(e => e.session_id))
    const recovered = recoveredIds.size
    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
    return { total, called, restarted, recovered, pct }
  }, [filteredEvents, dedupedSessions])

  // ── Funnel steps
  const funnelSteps = useMemo((): FunnelStep[] => {
    // No Results mode — show the no-results pipeline as its own funnel
    if (funnelMode === 'no-results') {
      const total = noResultsPipeline.total
      const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
      return [
        { label: 'Got No Results', count: total, pct: 100, isZeroResults: true },
        { label: 'Called the Office', count: noResultsPipeline.called, pct: pct(noResultsPipeline.called) },
        { label: 'Started Over', count: noResultsPipeline.restarted, pct: pct(noResultsPipeline.restarted) },
        { label: 'Recovered (restarted → converted)', count: noResultsPipeline.recovered, pct: pct(noResultsPipeline.recovered), isCTA: true },
      ]
    }
    // Use total unique sessions across ALL events as the baseline — fixes the 129% bug
    // where question events outnumber widget_opened events due to timing/back navigation
    const base = new Set(filteredEvents.map(e => e.session_id)).size
    const pct = (n: number) => base > 0 ? Math.round((n / base) * 100) : 0
    const countEvent = (type: string) =>
      new Set(filteredEvents.filter(e => e.event_type === type).map(e => e.session_id)).size
    // Deduplicate back-button re-answers: only count unique session_ids per step
    const countStep = (idx: number) =>
      new Set(filteredEvents.filter(e => e.event_type === 'question_answered' && e.step_index === idx).map(e => e.session_id)).size

    const stepMap = new Map<number, string>()
    filteredEvents
      .filter(e => e.event_type === 'question_answered' && e.step_index != null)
      .forEach(e => { if (!stepMap.has(e.step_index!)) stepMap.set(e.step_index!, e.question_text ?? `Step ${e.step_index! + 1}`) })
    const questionSteps = Array.from(stepMap.entries()).sort((a, b) => a[0] - b[0])

    const openCount = countEvent('widget_opened')
    const caseTypeCount = countEvent('case_type_selected')
    const steps: FunnelStep[] = [{ label: 'Widget Opened', count: openCount, pct: pct(openCount) }]
    if (caseTypeCount > 0) {
      steps.push({ label: 'Case Type Selected', count: caseTypeCount, pct: pct(caseTypeCount) })
    }

    questionSteps.forEach(([idx, text]) => {
      const count = countStep(idx)
      steps.push({ label: text, count, pct: pct(count) })
    })

    const resultsCount = countEvent('results_shown')
    steps.push({ label: 'Results Shown', count: resultsCount, pct: pct(resultsCount) })

    if (funnelMode === 'combined') {
      const bookIds = new Set(filteredEvents.filter(e => e.event_type === 'booking_clicked').map(e => e.session_id))
      const callIds = new Set(filteredEvents.filter(e => e.event_type === 'call_clicked').map(e => e.session_id))
      const count = new Set([...bookIds, ...callIds]).size
      steps.push({ label: 'Booked or Called', count, pct: pct(count), isCTA: true })
    } else if (funnelMode === 'booking') {
      const count = countEvent('booking_clicked')
      steps.push({ label: 'Booking Clicked', count, pct: pct(count), isCTA: true })
    } else {
      const count = countEvent('call_clicked')
      steps.push({ label: 'Call Clicked', count, pct: pct(count), isCTA: true })
    }

    return steps
  }, [filteredEvents, filteredSessions, funnelMode, noResultsPipeline])

  // ── Sessions over time
  const sessionsOverTime = useMemo(() => {
    const dayCount = datePreset === '7d' ? 7 : datePreset === '90d' ? 90 : 30
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days: { key: string; label: string }[] = []
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      days.push({ key: dayKey(d), label: formatDayLabel(d) })
    }
    const byDay = new Map(days.map(d => [d.key, new Set<string>()]))
    filteredEvents
      .filter(e => e.event_type === 'widget_opened')
      .forEach(e => {
        const d = new Date(e.created_at); d.setHours(0, 0, 0, 0)
        byDay.get(dayKey(d))?.add(e.session_id)
      })
    return {
      labels: days.map(d => d.label),
      counts: days.map(d => byDay.get(d.key)?.size ?? 0),
    }
  }, [filteredEvents, datePreset])

  // ── Sessions by case type
  const sessionsByCaseType = useMemo(() => {
    const total = dedupedSessions.length
    const counts = new Map<string, number>()
    dedupedSessions.forEach(s => {
      const id = s.case_type_id ?? '__none__'
      counts.set(id, (counts.get(id) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([id, count]) => ({
        id, count,
        name: id === '__none__' ? '—' : caseTypeNameById.get(id) ?? 'Unknown',
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [dedupedSessions, caseTypeNameById])

  // ── Providers by impressions + clicks (all providers, including never-shown)
  const providersByClicks = useMemo(() => {
    const shown = new Map<string, number>()
    const clicks = new Map<string, number>()
    data?.providers.forEach(p => { shown.set(p.id, 0); clicks.set(p.id, 0) })
    dedupedSessions.forEach(s => {
      (s.providers_shown ?? []).forEach(pid => shown.set(pid, (shown.get(pid) ?? 0) + 1))
      ;(s.providers_clicked ?? []).forEach(pid => clicks.set(pid, (clicks.get(pid) ?? 0) + 1))
    })
    return Array.from(shown.keys())
      .map(id => {
        const s = shown.get(id) ?? 0
        const c = clicks.get(id) ?? 0
        return {
          id,
          shown: s,
          clicks: c,
          ctr: s > 0 ? c / s : null,
          name: providerNameById.get(id) ?? 'Unknown',
        }
      })
      .sort((a, b) => b.shown - a.shown || b.clicks - a.clicks)
  }, [dedupedSessions, data?.providers, providerNameById])

  // ── Per-provider impression context — when a provider was shown, what was the typical session?
  const providerImpressionStats = useMemo(() => {
    const eventsBySession = new Map<string, SessionEvent[]>()
    filteredEvents.forEach(e => {
      if (!eventsBySession.has(e.session_id)) eventsBySession.set(e.session_id, [])
      eventsBySession.get(e.session_id)!.push(e)
    })

    // Location: pinned to question_type='location' (structural). Age: still substring-matched.
    const locationQuestionIds = new Set(
      (data?.questions ?? []).filter(q => q.question_type === 'location').map(q => q.id),
    )

    const ageBucket = (raw: string): string => {
      const n = Number(raw)
      if (!Number.isFinite(n)) return raw
      if (n < 13) return 'Under 13'
      if (n < 20) return 'Teen'
      const decade = Math.floor(n / 10) * 10
      return `${decade}s`
    }

    type Slice = { caseType: string | null; location: string | null; age: string | null }
    const sessionSlice = new Map<string, Slice>()
    dedupedSessions.forEach(s => {
      const evs = eventsBySession.get(s.session_id) ?? []
      let location: string | null = null
      let age: string | null = null
      evs.forEach(e => {
        if (!e.answer_text) return
        if (!location && e.question_id && locationQuestionIds.has(e.question_id)) {
          location = e.answer_text
        }
        if (!age && e.question_text) {
          const q = e.question_text.toLowerCase()
          if (q.includes('old') || q.includes('age')) age = ageBucket(e.answer_text)
        }
      })
      const caseType = s.case_type_id ? caseTypeNameById.get(s.case_type_id) ?? null : null
      sessionSlice.set(s.session_id, { caseType, location, age })
    })

    // 2) Per-provider aggregation: walk every session that showed each provider
    type Counts = Map<string, number>
    const perProvider = new Map<string, { shown: number; cases: Counts; locs: Counts; ages: Counts }>()
    data?.providers.forEach(p => perProvider.set(p.id, { shown: 0, cases: new Map(), locs: new Map(), ages: new Map() }))
    const bump = (m: Counts, key: string | null) => {
      if (!key) return
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    dedupedSessions.forEach(s => {
      const slice = sessionSlice.get(s.session_id)
      if (!slice) return
      ;(s.providers_shown ?? []).forEach(pid => {
        const rec = perProvider.get(pid)
        if (!rec) return
        rec.shown += 1
        bump(rec.cases, slice.caseType)
        bump(rec.locs, slice.location)
        bump(rec.ages, slice.age)
      })
    })

    const top = (m: Counts): string | null => {
      let best: string | null = null
      let bestN = 0
      m.forEach((n, k) => { if (n > bestN) { best = k; bestN = n } })
      return best
    }

    return Array.from(perProvider.entries())
      .map(([id, r]) => ({
        id,
        name: providerNameById.get(id) ?? 'Unknown',
        shown: r.shown,
        topCase: top(r.cases),
        topLocation: top(r.locs),
        topAge: top(r.ages),
      }))
      .sort((a, b) => b.shown - a.shown)
  }, [dedupedSessions, filteredEvents, data?.providers, data?.questions, caseTypeNameById, providerNameById])

  // ── Session log — one row per session; restarts shown as labeled attempts when expanded
  const sessionLog = useMemo(() => {
    const map = new Map<string, { events: SessionEvent[]; session?: WidgetSession }>()
    filteredEvents.forEach(e => {
      if (!map.has(e.session_id)) map.set(e.session_id, { events: [] })
      map.get(e.session_id)!.events.push(e)
    })
    filteredSessions.forEach(s => {
      if (map.has(s.session_id)) {
        if (!map.get(s.session_id)!.session) map.get(s.session_id)!.session = s
      } else {
        map.set(s.session_id, { events: [], session: s })
      }
    })

    function buildRunData(runEvents: SessionEvent[], runIndex: number) {
      const endsWithRestart = runEvents.some(e => e.event_type === 'start_over_clicked')
      const caseTypeEvent = runEvents.find(e => e.event_type === 'case_type_selected')
      const stepEvents = runEvents.filter(e => e.event_type === 'question_answered' && e.step_index != null)
      // Per-attempt outcome comes straight from the events the widget emits.
      const zeroResults = runEvents.some(e => e.event_type === 'zero_results_shown')
      const booked = runEvents.some(e => e.event_type === 'booking_clicked')
      const called = runEvents.some(e => e.event_type === 'call_clicked' || e.event_type === 'call_office_clicked')

      const eventOrder = ['widget_opened', 'case_type_selected', 'question_answered', 'results_shown', 'zero_results_shown', 'booking_clicked', 'call_clicked']
      const lastMeaningful = [...runEvents].reverse().find(e => eventOrder.includes(e.event_type))
      let dropOffPoint: string
      if (endsWithRestart) {
        dropOffPoint = 'Restarted'
      } else if (lastMeaningful?.event_type === 'booking_clicked' || lastMeaningful?.event_type === 'call_clicked') {
        dropOffPoint = 'Converted'
      } else if (lastMeaningful?.event_type === 'zero_results_shown') {
        dropOffPoint = 'No Results'
      } else if (lastMeaningful?.event_type === 'results_shown') {
        dropOffPoint = 'Saw Results — No CTA'
      } else if (lastMeaningful?.event_type === 'question_answered') {
        dropOffPoint = `Dropped at: ${lastMeaningful.question_text ?? 'question'}`
      } else if (lastMeaningful?.event_type === 'case_type_selected') {
        dropOffPoint = 'Dropped after case type'
      } else if (lastMeaningful?.event_type === 'widget_opened') {
        dropOffPoint = 'Opened — no interaction'
      } else {
        dropOffPoint = 'Unknown'
      }

      let wentBack = false
      for (let i = 1; i < stepEvents.length; i++) {
        if ((stepEvents[i].step_index ?? 0) < (stepEvents[i - 1].step_index ?? 0)) { wentBack = true; break }
      }

      const stepMap = new Map<number, SessionEvent>()
      stepEvents.forEach(e => stepMap.set(e.step_index!, e))
      const caseTypeSyntheticEvent: SessionEvent | null = caseTypeEvent
        ? { ...caseTypeEvent, question_text: 'Case Type', answer_text: caseTypeEvent.question_text }
        : null
      const questionFlow = [
        ...(caseTypeSyntheticEvent ? [caseTypeSyntheticEvent] : []),
        ...Array.from(stepMap.entries()).sort((a, b) => a[0] - b[0]).map(([, e]) => e),
      ]

      return { runIndex, endsWithRestart, booked, called, zeroResults, wentBack, dropOffPoint, questionFlow }
    }

    return Array.from(map.entries())
      .map(([sessionId, d]) => {
        const sortedEvents = [...d.events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        // Split into runs at start_over_clicked
        const rawRuns: SessionEvent[][] = []
        let cur: SessionEvent[] = []
        for (const e of sortedEvents) {
          cur.push(e)
          if (e.event_type === 'start_over_clicked') { rawRuns.push(cur); cur = [] }
        }
        rawRuns.push(cur)
        const runs = rawRuns.filter(r => r.length > 0)
        const totalRuns = runs.length
        const restarted = totalRuns > 1

        const runData = runs.map((r, i) => buildRunData(r, i))

        // Legacy fallback: sessions recorded before the widget emitted per-attempt
        // zero_results_shown events only have a session-level flag. Attribute it to
        // the attempt whose time window contains the session record's created_at.
        const hasZeroEvent = sortedEvents.some(e => e.event_type === 'zero_results_shown')
        if (!hasZeroEvent && d.session?.zero_results === true && d.session.created_at) {
          const t = new Date(d.session.created_at).getTime()
          let idx = runs.findIndex(r => {
            const start = new Date(r[0].created_at).getTime()
            const end = new Date(r[r.length - 1].created_at).getTime()
            return t >= start - 2000 && t <= end + 5000
          })
          if (idx === -1) idx = totalRuns - 1
          runData[idx].zeroResults = true
          if (!runData[idx].endsWithRestart) runData[idx].dropOffPoint = 'No Results'
        }

        const lastRun = runData[totalRuns - 1]

        const openedAt = sortedEvents.find(e => e.event_type === 'widget_opened')?.created_at
          ?? sortedEvents[0]?.created_at ?? d.session?.created_at ?? ''
        const caseTypeEvent = sortedEvents.find(e => e.event_type === 'case_type_selected')
        const caseTypeName = d.session?.case_type_id
          ? (caseTypeNameById.get(d.session.case_type_id) ?? 'Unknown')
          : (caseTypeEvent?.question_text ?? '—')

        const booked = sortedEvents.some(e => e.event_type === 'booking_clicked')
        const called = sortedEvents.some(e => e.event_type === 'call_clicked' || e.event_type === 'call_office_clicked')
        const calledFromNoResults = sortedEvents.some(e => e.event_type === 'call_office_clicked')
        const browseAll = sortedEvents.some(e => e.event_type === 'results_shown' && e.answer_text === 'browse_all')
        const helpMeChoose = sortedEvents.some(e => e.event_type === 'help_me_choose_clicked')
        const profileViewed = sortedEvents.some(e => e.event_type === 'profile_viewed')

        return {
          sessionId,
          openedAt,
          caseTypeName,
          booked,
          called,
          bookedOrCalled: booked || called,
          zeroResults: lastRun.zeroResults,
          wentBack: runData.some(r => r.wentBack),
          restarted,
          totalRuns,
          calledFromNoResults,
          browseAll,
          helpMeChoose,
          profileViewed,
          dropOffPoint: lastRun.dropOffPoint,
          runs: runData,
          providersClicked: d.session?.providers_clicked ?? [],
          resultsCount: d.session?.results_count ?? null,
        }
      })
      .filter(s => s.openedAt)
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
      .slice(0, 100)
  }, [filteredEvents, filteredSessions, caseTypeNameById])

  if (!orgId || isLoading) return <p className="p-8 text-sm text-slate-500">Loading analytics…</p>
  if (error) return <p className="p-8 text-sm text-red-600">{error instanceof Error ? error.message : 'Error loading analytics.'}</p>

  const visibleSessions = showAllSessions ? sessionLog : sessionLog.slice(0, 10)

  return (
    <div>
      {/* Header + Filters in one row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-0.5 text-sm text-slate-500">{orgName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedWidgetId}
            onChange={e => setSelectedWidgetId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Widgets</option>
            {(data?.widgets ?? []).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} type="button" onClick={() => setDatePreset(p)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  datePreset === p ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
                }`}
              >
                {p === '7d' ? '7d' : p === '30d' ? '30d' : '90d'}
              </button>
            ))}
            <button type="button" onClick={() => setDatePreset('custom')}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                datePreset === 'custom' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
              }`}
            >
              Custom
            </button>
          </div>
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <span className="text-sm text-slate-400">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards — compact */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {/* Opens */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
            <BarChart3 className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{summary.opens.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Opens</p>
        </div>
        {/* Results */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
            <Users className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{summary.results.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Results Shown</p>
        </div>
        {/* Bookings */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
            <BookOpen className="h-3.5 w-3.5 text-blue-600" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{summary.bookings.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Bookings</p>
        </div>
        {/* Calls */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
            <Phone className="h-3.5 w-3.5 text-amber-600" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{summary.calls.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Calls</p>
        </div>
        {/* CTAs */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
            <MousePointerClick className="h-3.5 w-3.5 text-violet-600" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{summary.ctas.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Total CTAs</p>
        </div>
        {/* Conversion */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50">
            <TrendingUp className="h-3.5 w-3.5 text-rose-600" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{summary.conversionRate}%</p>
          <p className="mt-0.5 text-xs text-slate-500">Conversion</p>
        </div>
        {/* No Results */}
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold text-red-700">{summary.zeroResults.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-red-500">No Results</p>
        </div>
      </div>

      {/* Funnel — full width */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Funnel</h2>
          <p className="mt-0.5 text-xs text-slate-500">Select a view to see where users drop off</p>
        </div>
        <div className="px-6 py-5">
          {summary.opens === 0 && noResultsPipeline.total === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No funnel data yet.</p>
          ) : (
            <FunnelChart steps={funnelSteps} mode={funnelMode} onModeChange={setFunnelMode} />
          )}
        </div>
      </section>

      {/* Sessions Over Time — full width */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Sessions Over Time</h2>
        </div>
        <div className="px-6 py-4">
          <LineChart counts={sessionsOverTime.counts} labels={sessionsOverTime.labels} total={summary.opens} />
        </div>
      </section>

      {/* Case Type + Providers — side by side (compact tables, makes sense together) */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Sessions by Case Type</h2>
          </div>
          {sessionsByCaseType.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">No data yet.</p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              {sessionsByCaseType.map(row => (
                <div key={row.id} className="border-b border-slate-100 px-6 py-3 last:border-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{row.name}</span>
                    <span className="text-xs text-slate-500">{row.count} · {row.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-400" style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Top Providers</h2>
          </div>
          {providersByClicks.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">No clicks yet.</p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              {providersByClicks.map((row, i) => (
                <div key={row.id} className="flex items-center justify-between border-b border-slate-100 px-6 py-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">{i + 1}</span>
                    <span className="text-sm font-medium text-slate-800">{row.name}</span>
                  </div>
                  <span className="text-sm tabular-nums text-slate-500">{row.clicks} clicks</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Provider Impressions — when each provider was shown, what was the typical session? */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Provider Impressions</h2>
          <p className="mt-0.5 text-xs text-slate-500">How often each provider appeared in results, and the typical session context.</p>
        </div>
        {providerImpressionStats.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">No data yet.</p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Provider</th>
                  <th className="px-6 py-3 font-medium tabular-nums">Shown</th>
                  <th className="px-6 py-3 font-medium">Top Case Type</th>
                  <th className="px-6 py-3 font-medium">Top Location</th>
                  <th className="px-6 py-3 font-medium">Top Age</th>
                </tr>
              </thead>
              <tbody>
                {providerImpressionStats.map(row => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-6 py-3 tabular-nums text-slate-700">{row.shown}</td>
                    <td className="px-6 py-3 text-slate-700">{row.topCase ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-700">{row.topLocation ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-700">{row.topAge ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Session Log — full width, collapsed by default */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Session Log</h2>
            <p className="mt-0.5 text-xs text-slate-500">{sessionLog.length} sessions</p>
          </div>
        </div>
        {sessionLog.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">No sessions recorded yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <th className="w-8 px-4 py-3" aria-hidden />
                    <th className="px-4 py-3">Date / Time</th>
                    <th className="px-4 py-3">Case Type</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Drop-off</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSessions.map(s => {
                    const expanded = expandedRowKey === s.sessionId
                    const ctaLabel = s.booked && s.called ? 'Booked + Called'
                      : s.booked ? 'Booked'
                      : s.called ? 'Called'
                      : s.zeroResults ? 'No Results'
                      : '—'
                    const ctaColor = s.bookedOrCalled ? 'font-semibold text-emerald-700'
                      : s.zeroResults ? 'font-medium text-red-500'
                      : 'text-slate-400'
                    return (
                      <Fragment key={s.sessionId}>
                        <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                          onClick={() => setExpandedRowKey(expanded ? null : s.sessionId)}>
                          <td className="px-4 py-3 text-slate-400">
                            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatDateTime(s.openedAt)}
                            {s.restarted && (
                              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">↺ {s.totalRuns} attempts</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{s.caseTypeName}</td>
                          <td className={`px-4 py-3 ${ctaColor}`}>{ctaLabel}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{s.dropOffPoint}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-slate-100 bg-slate-50/50">
                            <td colSpan={5} className="px-6 py-4">
                              <div className="mb-3 flex flex-wrap gap-2">
                                {s.wentBack && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">↩ Went Back</span>}
                                {s.resultsCount != null && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{s.resultsCount} result{s.resultsCount !== 1 ? 's' : ''} shown</span>}
                                {s.helpMeChoose && <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">Used "Help Me Choose"</span>}
                                {s.profileViewed && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">Viewed Profile</span>}
                                {s.calledFromNoResults && <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">Called from No Results</span>}
                                {s.bookedOrCalled && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Converted</span>}
                              </div>
                              {s.restarted ? (
                                <div className="space-y-4">
                                  {s.runs.map((run, ri) => (
                                    <div key={ri} className="rounded-lg border border-slate-200 bg-white p-4">
                                      <div className="mb-2 flex items-center gap-2">
                                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                          Attempt {ri + 1}
                                        </span>
                                        {run.zeroResults && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">No Results</span>}
                                        <span className="text-xs text-slate-400">{run.dropOffPoint}</span>
                                      </div>
                                      {run.questionFlow.length === 0 ? (
                                        <p className="text-sm text-slate-500">No questions answered.</p>
                                      ) : (
                                        <ol className="space-y-1.5">
                                          {run.questionFlow.map((e, i) => (
                                            <li key={e.id} className="flex items-start gap-2 text-sm">
                                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">{i + 1}</span>
                                              <span className="text-slate-700">
                                                {e.question_text ?? `Step ${i + 1}`}
                                                {e.answer_text && (
                                                  <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{e.answer_text}</span>
                                                )}
                                              </span>
                                            </li>
                                          ))}
                                        </ol>
                                      )}
                                    </div>
                                  ))}
                                  {s.providersClicked.length > 0 && (
                                    <div>
                                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Providers Clicked</h3>
                                      <ul className="space-y-1">
                                        {s.providersClicked.map((pid, i) => (
                                          <li key={i} className="text-sm text-slate-700">{providerNameById.get(pid) ?? 'Unknown'}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="grid gap-6 md:grid-cols-2">
                                  <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Question Flow</h3>
                                    {s.runs[0]?.questionFlow.length === 0 ? (
                                      <p className="text-sm text-slate-500">No questions answered.</p>
                                    ) : (
                                      <ol className="space-y-2">
                                        {s.runs[0]?.questionFlow.map((e, i) => (
                                          <li key={e.id} className="flex items-start gap-2 text-sm">
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">{i + 1}</span>
                                            <span className="text-slate-700">
                                              {e.question_text ?? `Step ${i + 1}`}
                                              {e.answer_text && (
                                                <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{e.answer_text}</span>
                                              )}
                                            </span>
                                          </li>
                                        ))}
                                      </ol>
                                    )}
                                  </div>
                                  <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Providers Clicked</h3>
                                    {s.providersClicked.length === 0 ? (
                                      <p className="text-sm text-slate-500">None</p>
                                    ) : (
                                      <ul className="space-y-1">
                                        {s.providersClicked.map((pid, i) => (
                                          <li key={i} className="text-sm text-slate-700">{providerNameById.get(pid) ?? 'Unknown'}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {sessionLog.length > 10 && (
              <div className="border-t border-slate-100 px-6 py-3 text-center">
                <button type="button" onClick={() => setShowAllSessions(v => !v)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                  {showAllSessions ? 'Show less' : `Show all ${sessionLog.length} sessions`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
