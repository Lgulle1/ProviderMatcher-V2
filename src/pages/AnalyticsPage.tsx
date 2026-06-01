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
  created_at: string
}

interface WidgetRef { id: string; name: string; status: string }
interface CaseTypeRef { id: string; name: string }
interface ProviderRef { id: string; name: string }

interface AnalyticsData {
  events: SessionEvent[]
  sessions: WidgetSession[]
  widgets: WidgetRef[]
  caseTypes: CaseTypeRef[]
  providers: ProviderRef[]
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAnalyticsData(orgId: string): Promise<AnalyticsData> {
  const [eventsRes, sessionsRes, widgetsRes, caseTypesRes, providersRes] = await Promise.all([
    supabase.from('widget_session_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('widget_sessions').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('widgets').select('id, name, status').eq('org_id', orgId).neq('status', 'archived'),
    supabase.from('case_types').select('id, name').eq('org_id', orgId),
    supabase.from('providers').select('id, name').eq('org_id', orgId),
  ])
  if (eventsRes.error) throw new Error(eventsRes.error.message)
  if (sessionsRes.error) throw new Error(sessionsRes.error.message)
  return {
    events: (eventsRes.data ?? []) as SessionEvent[],
    sessions: (sessionsRes.data ?? []) as WidgetSession[],
    widgets: (widgetsRes.data ?? []) as WidgetRef[],
    caseTypes: (caseTypesRes.data ?? []) as CaseTypeRef[],
    providers: (providersRes.data ?? []) as ProviderRef[],
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
  const width = 640
  const height = 160
  const padL = 8, padR = 8, padT = 12, padB = 28
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
  const labelEvery = Math.ceil(counts.length / 8)

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</span>
        <span className="text-sm text-slate-500">total opens</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Sessions over time">
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
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={p.c > 0 ? 3 : 2} fill={p.c > 0 ? '#6366f1' : '#cbd5e1'} />
            {(i % labelEvery === 0 || i === counts.length - 1) && (
              <text x={p.x} y={height - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">{labels[i]}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Funnel Chart ─────────────────────────────────────────────────────────────

type FunnelMode = 'combined' | 'booking' | 'call'

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
      <div className="mb-4 flex gap-1.5">
        {(['combined', 'booking', 'call'] as FunnelMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
            }`}
          >
            {m === 'combined' ? 'Combined' : m === 'booking' ? 'Book Only' : 'Call Only'}
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
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)

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
    const zeroResults = filteredSessions.filter(s => s.zero_results === true).length
    return {
      opens, results,
      bookings: bookingIds.size,
      calls: callIds.size,
      ctas,
      zeroResults,
      conversionRate: opens > 0 ? Math.round((ctas / opens) * 100) : 0,
    }
  }, [filteredEvents, filteredSessions])

  // ── Funnel steps
  const funnelSteps = useMemo((): FunnelStep[] => {
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
    const steps: FunnelStep[] = [{ label: 'Widget Opened', count: openCount, pct: pct(openCount) }]

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
  }, [filteredEvents, filteredSessions, funnelMode])

  // ── No Results Pipeline
  const noResultsPipeline = useMemo(() => {
    const total = filteredSessions.filter(s => s.zero_results === true).length
    const called = new Set(filteredEvents.filter(e => e.event_type === 'call_office_clicked').map(e => e.session_id)).size
    const restarted = new Set(filteredEvents.filter(e => e.event_type === 'start_over_clicked').map(e => e.session_id)).size
    // Sessions that restarted and then eventually converted
    const restartedSessionIds = new Set(filteredEvents.filter(e => e.event_type === 'start_over_clicked').map(e => e.session_id))
    const recoveredIds = new Set(filteredEvents.filter(e =>
      (e.event_type === 'booking_clicked' || e.event_type === 'call_clicked') && restartedSessionIds.has(e.session_id)
    ).map(e => e.session_id))
    const recovered = recoveredIds.size
    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
    return { total, called, restarted, recovered, pct }
  }, [filteredEvents, filteredSessions])

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
    const total = filteredSessions.length
    const counts = new Map<string, number>()
    filteredSessions.forEach(s => {
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
  }, [filteredSessions, caseTypeNameById])

  // ── Providers by clicks
  const providersByClicks = useMemo(() => {
    const counts = new Map<string, number>()
    filteredSessions.forEach(s => {
      (s.providers_clicked ?? []).forEach(pid => counts.set(pid, (counts.get(pid) ?? 0) + 1))
    })
    return Array.from(counts.entries())
      .map(([id, clicks]) => ({ id, clicks, name: providerNameById.get(id) ?? 'Unknown' }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)
  }, [filteredSessions, providerNameById])

  // ── Session log
  const sessionLog = useMemo(() => {
    const map = new Map<string, { events: SessionEvent[]; session?: WidgetSession }>()
    filteredEvents.forEach(e => {
      if (!map.has(e.session_id)) map.set(e.session_id, { events: [] })
      map.get(e.session_id)!.events.push(e)
    })
    filteredSessions.forEach(s => {
      if (map.has(s.session_id)) map.get(s.session_id)!.session = s
      else map.set(s.session_id, { events: [], session: s })
    })
    return Array.from(map.entries())
      .map(([sessionId, d]) => {
        const sortedEvents = [...d.events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const openedAt = sortedEvents.find(e => e.event_type === 'widget_opened')?.created_at ?? sortedEvents[0]?.created_at ?? d.session?.created_at ?? ''
        const caseTypeEvent = sortedEvents.find(e => e.event_type === 'case_type_selected')
        const caseTypeName = d.session?.case_type_id
          ? (caseTypeNameById.get(d.session.case_type_id) ?? 'Unknown')
          : (caseTypeEvent?.question_text ?? '—')
        const booked = sortedEvents.some(e => e.event_type === 'booking_clicked')
        const called = sortedEvents.some(e => e.event_type === 'call_clicked' || e.event_type === 'call_office_clicked')
        const calledFromNoResults = sortedEvents.some(e => e.event_type === 'call_office_clicked')
        const zeroResults = d.session?.zero_results === true
        const restarted = sortedEvents.some(e => e.event_type === 'start_over_clicked')

        // Detect back navigation: if step_index goes backwards at any point
        const stepEvents = sortedEvents.filter(e => e.event_type === 'question_answered' && e.step_index != null)
        let wentBack = false
        for (let i = 1; i < stepEvents.length; i++) {
          if ((stepEvents[i].step_index ?? 0) <= (stepEvents[i - 1].step_index ?? 0)) {
            wentBack = true
            break
          }
        }

        // Drop-off point: last meaningful event type
        const eventOrder = ['widget_opened', 'case_type_selected', 'question_answered', 'results_shown', 'booking_clicked', 'call_clicked']
        const lastEvent = [...sortedEvents].reverse().find(e => eventOrder.includes(e.event_type))
        const dropOffPoint = lastEvent?.event_type === 'booking_clicked' || lastEvent?.event_type === 'call_clicked'
          ? 'Converted'
          : lastEvent?.event_type === 'results_shown'
          ? zeroResults ? 'No Results' : 'Saw Results — No CTA'
          : lastEvent?.event_type === 'question_answered'
          ? `Dropped at: ${lastEvent.question_text ?? 'question'}`
          : lastEvent?.event_type === 'case_type_selected'
          ? 'Dropped after case type'
          : lastEvent?.event_type === 'widget_opened'
          ? 'Opened — no interaction'
          : 'Unknown'

        // Deduplicated question flow (last answer per step when they went back)
        const stepMap = new Map<number, SessionEvent>()
        stepEvents.forEach(e => stepMap.set(e.step_index!, e))
        const questionFlow = Array.from(stepMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, e]) => e)

        return {
          sessionId, openedAt, caseTypeName,
          booked, called, bookedOrCalled: booked || called,
          zeroResults, wentBack, restarted, calledFromNoResults, dropOffPoint,
          questionFlow,
          providersClicked: d.session?.providers_clicked ?? [],
        }
      })
      .filter(s => s.openedAt)
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
      .slice(0, 100)
  }, [filteredEvents, filteredSessions, caseTypeNameById])

  if (!orgId || isLoading) return <p className="p-8 text-sm text-slate-500">Loading analytics…</p>
  if (error) return <p className="p-8 text-sm text-red-600">{error instanceof Error ? error.message : 'Error loading analytics.'}</p>

  return (
    <div>
      {/* Header */}
      <section className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-slate-500">{orgName}</p>
      </section>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
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
            <button
              key={p}
              type="button"
              onClick={() => setDatePreset(p)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                datePreset === p
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
              }`}
            >
              {p === '7d' ? 'Last 7d' : p === '30d' ? 'Last 30d' : 'Last 90d'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDatePreset('custom')}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              datePreset === 'custom'
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
            }`}
          >
            Custom
          </button>
        </div>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <span className="text-sm text-slate-400">to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
        )}
      </div>

      {/* Executive Summary */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
            <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{summary.opens.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Widget Opens</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
            <Users className="h-4 w-4 text-emerald-600" aria-hidden />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{summary.results.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Results Shown</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
            <MousePointerClick className="h-4 w-4 text-violet-600" aria-hidden />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{summary.ctas.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Total CTAs</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <BookOpen className="h-4 w-4 text-blue-600" aria-hidden />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{summary.bookings.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Bookings</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
            <Phone className="h-4 w-4 text-amber-600" aria-hidden />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{summary.calls.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-500">Calls</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50">
            <TrendingUp className="h-4 w-4 text-rose-600" aria-hidden />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{summary.conversionRate}%</p>
          <p className="mt-0.5 text-xs text-slate-500">Conversion</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
            <TrendingDown className="h-4 w-4 text-red-500" aria-hidden />
          </div>
          <p className="mt-3 text-2xl font-bold text-red-700">{summary.zeroResults.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-red-500">No Results</p>
        </div>
      </div>

      {/* Funnel + Sessions Over Time */}
      <div className="mb-8 grid gap-8 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Conversion Funnel</h2>
          </div>
          <div className="px-6 py-4">
            {summary.opens === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No funnel data yet. Open the widget on your live site to start tracking.
              </p>
            ) : (
              <FunnelChart steps={funnelSteps} mode={funnelMode} onModeChange={setFunnelMode} />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Sessions Over Time</h2>
          </div>
          <div className="px-6 py-4">
            <LineChart counts={sessionsOverTime.counts} labels={sessionsOverTime.labels} total={summary.opens} />
          </div>
        </section>
      </div>

      {/* No Results Pipeline */}
      {noResultsPipeline.total > 0 && (
        <section className="mb-8 overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm">
          <div className="border-b border-red-100 bg-red-50 px-6 py-4">
            <h2 className="font-semibold text-red-900">No Results Pipeline</h2>
            <p className="mt-0.5 text-xs text-red-500">Sessions that hit zero results — what happened next</p>
          </div>
          <div className="px-6 py-4 space-y-3">
            {[
              { label: 'Got No Results', count: noResultsPipeline.total, pct: 100, color: 'bg-red-400' },
              { label: 'Called the Office', count: noResultsPipeline.called, pct: noResultsPipeline.pct(noResultsPipeline.called), color: 'bg-amber-400' },
              { label: 'Started Over', count: noResultsPipeline.restarted, pct: noResultsPipeline.pct(noResultsPipeline.restarted), color: 'bg-blue-400' },
              { label: 'Recovered (restarted → converted)', count: noResultsPipeline.recovered, pct: noResultsPipeline.pct(noResultsPipeline.recovered), color: 'bg-emerald-500' },
            ].map((step, i) => (
              <div key={i}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{step.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums text-slate-900">{step.count.toLocaleString()}</span>
                    <span className="w-10 text-right text-xs text-slate-500">{step.pct}%</span>
                  </div>
                </div>
                <div className="h-6 w-full overflow-hidden rounded-md bg-slate-100">
                  <div
                    className={`h-full rounded-md transition-all duration-500 ${step.color}`}
                    style={{ width: `${noResultsPipeline.total > 0 ? (step.count / noResultsPipeline.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Case Types + Providers */}
      <div className="mb-8 grid gap-8 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Sessions by Case Type</h2>
          </div>
          {sessionsByCaseType.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">No session data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <th className="px-6 py-3">Case Type</th>
                    <th className="px-6 py-3">Sessions</th>
                    <th className="px-6 py-3">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsByCaseType.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                      <td className="px-6 py-3 tabular-nums text-slate-700">{row.count}</td>
                      <td className="px-6 py-3 tabular-nums text-slate-700">{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Most Clicked Providers</h2>
          </div>
          {providersByClicks.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">No provider clicks yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <th className="px-6 py-3">Provider</th>
                    <th className="px-6 py-3">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {providersByClicks.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                      <td className="px-6 py-3 tabular-nums text-slate-700">{row.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Session Log */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Session Log</h2>
          <p className="mt-0.5 text-xs text-slate-500">Up to 100 most recent sessions</p>
        </div>
        {sessionLog.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">No sessions recorded yet.</p>
        ) : (
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
                {sessionLog.map(s => {
                  const expanded = expandedSessionId === s.sessionId
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
                      <tr
                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                        onClick={() => setExpandedSessionId(expanded ? null : s.sessionId)}
                      >
                        <td className="px-4 py-3 text-slate-400">
                          {expanded
                            ? <ChevronDown className="h-4 w-4" aria-hidden />
                            : <ChevronRight className="h-4 w-4" aria-hidden />}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{formatDateTime(s.openedAt)}</td>
                        <td className="px-4 py-3 text-slate-700">{s.caseTypeName}</td>
                        <td className={`px-4 py-3 ${ctaColor}`}>{ctaLabel}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{s.dropOffPoint}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="mb-3 flex flex-wrap gap-2">
                              {s.zeroResults && (
                                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">No Results</span>
                              )}
                              {s.wentBack && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">↩ Went Back</span>
                              )}
                              {s.restarted && (
                                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">↺ Restarted</span>
                              )}
                              {s.calledFromNoResults && (
                                <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">Called from No Results</span>
                              )}
                              {s.bookedOrCalled && (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Converted</span>
                              )}
                            </div>
                            <div className="grid gap-6 md:grid-cols-2">
                              <div>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Question Flow
                                </h3>
                                {s.questionFlow.length === 0 ? (
                                  <p className="text-sm text-slate-500">No questions answered.</p>
                                ) : (
                                  <ol className="space-y-2">
                                    {s.questionFlow.map((e, i) => (
                                      <li key={e.id} className="flex items-start gap-2 text-sm">
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
                                          {i + 1}
                                        </span>
                                        <span className="text-slate-700">{e.question_text ?? `Step ${i + 1}`}</span>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </div>
                              <div>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Providers Clicked
                                </h3>
                                {s.providersClicked.length === 0 ? (
                                  <p className="text-sm text-slate-500">None</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {s.providersClicked.map((pid, i) => (
                                      <li key={i} className="text-sm text-slate-700">
                                        {providerNameById.get(pid) ?? 'Unknown'}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
