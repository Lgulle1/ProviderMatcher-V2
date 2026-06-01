import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronDown, ChevronRight, MousePointerClick, TrendingDown, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { WidgetSession } from '../types/database'

interface CaseTypeRef {
  id: string
  name: string
}

interface ProviderRef {
  id: string
  name: string
}

interface AnalyticsData {
  sessions: WidgetSession[]
  caseTypes: CaseTypeRef[]
  providers: ProviderRef[]
}

async function fetchAnalytics(orgId: string, selectedWidgetId: string | null): Promise<AnalyticsData> {
  let sessionsQuery = supabase
    .from('widget_sessions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (selectedWidgetId) {
    sessionsQuery = sessionsQuery.eq('widget_id', selectedWidgetId)
  }

  const [sessionsRes, caseTypesRes, providersRes] = await Promise.all([
    sessionsQuery,
    supabase.from('case_types').select('id, name').eq('org_id', orgId),
    supabase.from('providers').select('id, name').eq('org_id', orgId),
  ])

  if (sessionsRes.error) {
    throw new Error(sessionsRes.error.message)
  }
  if (caseTypesRes.error) {
    throw new Error(caseTypesRes.error.message)
  }
  if (providersRes.error) {
    throw new Error(providersRes.error.message)
  }

  return {
    sessions: (sessionsRes.data ?? []) as WidgetSession[],
    caseTypes: (caseTypesRes.data ?? []) as CaseTypeRef[],
    providers: (providersRes.data ?? []) as ProviderRef[],
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function SessionsOverTimeChart({ counts, labels }: { counts: number[]; labels: string[] }) {
  const width = 640
  const height = 160
  const padLeft = 8
  const padRight = 8
  const padTop = 8
  const padBottom = 28
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom
  const max = Math.max(...counts, 1)
  const barGap = 2
  const barW = counts.length > 0 ? (chartW - barGap * (counts.length - 1)) / counts.length : chartW

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Sessions over the last 30 days">
      {counts.map((count, i) => {
        const barH = max > 0 ? (count / max) * chartH : 0
        const x = padLeft + i * (barW + barGap)
        const y = padTop + chartH - barH
        return (
          <g key={labels[i]}>
            <rect
              x={x}
              y={y}
              width={Math.max(barW, 1)}
              height={Math.max(barH, 0)}
              rx={2}
              className="fill-indigo-500"
            />
            {i % 5 === 0 || i === counts.length - 1 ? (
              <text
                x={x + barW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={9}
                className="fill-slate-500"
              >
                {labels[i]}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

interface FunnelChartProps {
  steps: { label: string; count: number }[]
  bookingCount: number
  callCount: number
  top: number
}

function FunnelChart({ steps, bookingCount, callCount, top }: FunnelChartProps) {
  const allZero = steps.every((s) => s.count === 0)
  const resultsShown = steps.find((s) => s.label === 'Results Shown')?.count ?? 0
  const maxWidth = top > 0 ? top : 1

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="font-semibold text-slate-900">Conversion funnel</h2>
      </div>
      {allZero ? (
        <p className="px-6 py-8 text-center text-sm text-slate-500">No funnel data yet.</p>
      ) : (
        <div className="space-y-3 px-6 py-4">
          {steps.map((step, i) => {
            const prevCount = i > 0 ? steps[i - 1].count : step.count
            const dropoff = i > 0 && prevCount > 0 ? Math.round((1 - step.count / prevCount) * 100) : 0
            const widthPct = Math.max((step.count / maxWidth) * 100, step.count > 0 ? 2 : 0)
            return (
              <div key={`${step.label}-${i}`} className="flex items-center gap-3">
                <div
                  className="w-36 shrink-0 truncate text-sm font-medium text-slate-700"
                  title={step.label}
                >
                  {step.label}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-8 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="h-full rounded-md bg-indigo-500 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                <div className="w-28 shrink-0 text-right text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{step.count}</span>
                  {i > 0 ? <span className="text-slate-500"> · −{dropoff}%</span> : null}
                </div>
              </div>
            )
          })}
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            {(
              [
                { label: 'Booking Clicked', count: bookingCount },
                { label: 'Call Clicked', count: callCount },
              ] as const
            ).map((item) => {
              const pct = resultsShown > 0 ? Math.round((item.count / resultsShown) * 100) : 0
              const widthPct = Math.max(
                (resultsShown > 0 ? item.count / resultsShown : 0) * 100,
                item.count > 0 ? 2 : 0
              )
              return (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="text-slate-600">
                      <span className="font-semibold text-slate-900">{item.count}</span>
                      <span className="text-slate-500"> · {pct}% of results</span>
                    </span>
                  </div>
                  <div className="h-6 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="h-full rounded-md bg-violet-500 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export default function AnalyticsPage() {
  const orgName = useAuthStore((s) => s.org?.name ?? '')
  const orgId = useAuthStore((s) => s.org?.id ?? '')
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [datePreset, setDatePreset] = useState<'7d' | '30d' | '90d' | 'custom'>('30d')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', orgId, selectedWidgetId],
    queryFn: () => fetchAnalytics(orgId, selectedWidgetId),
    enabled: Boolean(orgId),
  })

  const { data: funnelEvents } = useQuery({
    queryKey: ['funnel-events', orgId, selectedWidgetId],
    queryFn: async () => {
      let query = supabase
        .from('widget_session_events')
        .select('session_id, event_type, step_index, question_id, question_text, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
      if (selectedWidgetId) {
        query = query.eq('widget_id', selectedWidgetId)
      }
      const { data } = await query
      return data ?? []
    },
    enabled: Boolean(orgId),
  })

  const { data: widgets } = useQuery({
    queryKey: ['widgets-list', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('widgets')
        .select('id, button_text, status')
        .eq('org_id', orgId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: Boolean(orgId),
  })

  const filteredSessions = useMemo(() => {
    const sessions = data?.sessions ?? []
    const now = new Date()
    let start: Date | null = null
    let end: Date | null = null
    if (datePreset === '7d') {
      start = new Date(now)
      start.setDate(now.getDate() - 6)
    } else if (datePreset === '30d') {
      start = new Date(now)
      start.setDate(now.getDate() - 29)
    } else if (datePreset === '90d') {
      start = new Date(now)
      start.setDate(now.getDate() - 89)
    } else if (datePreset === 'custom' && customStart) {
      start = new Date(customStart)
      end = customEnd ? new Date(customEnd) : now
    }
    if (!start) return sessions
    start.setHours(0, 0, 0, 0)
    if (end) end.setHours(23, 59, 59, 999)
    return sessions.filter((s) => {
      const d = new Date(s.created_at)
      if (d < start!) return false
      if (end && d > end) return false
      return true
    })
  }, [data?.sessions, datePreset, customStart, customEnd])

  const caseTypeNameById = useMemo(() => {
    const map = new Map<string, string>()
    data?.caseTypes.forEach((ct) => map.set(ct.id, ct.name))
    return map
  }, [data?.caseTypes])

  const providerNameById = useMemo(() => {
    const map = new Map<string, string>()
    data?.providers.forEach((p) => map.set(p.id, p.name))
    return map
  }, [data?.providers])

  const funnel = useMemo(() => {
    const sessions = filteredSessions
    const total = sessions.length
    const gotResults = sessions.filter((s) => !s.zero_results).length
    const clickedBooking = sessions.filter((s) => (s.providers_clicked ?? []).length > 0).length
    const gotResultsNoClick = sessions.filter(
      (s) => !s.zero_results && (s.providers_clicked ?? []).length === 0
    ).length
    const dropOffRate = gotResults > 0 ? Math.round((gotResultsNoClick / gotResults) * 100) : 0
    return { total, gotResults, clickedBooking, dropOffRate }
  }, [filteredSessions])

  const sessionsOverTime = useMemo(() => {
    const sessions = filteredSessions
    const dayCount = datePreset === '7d' ? 7 : datePreset === '90d' ? 90 : 30
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days: { key: string; label: string; count: number }[] = []
    for (let i = dayCount - 1; i >= 0; i -= 1) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      days.push({ key: dayKey(d), label: formatDayLabel(d), count: 0 })
    }
    const countByKey = new Map(days.map((d) => [d.key, 0]))
    sessions.forEach((s) => {
      const created = new Date(s.created_at)
      created.setHours(0, 0, 0, 0)
      const key = dayKey(created)
      if (countByKey.has(key)) {
        countByKey.set(key, (countByKey.get(key) ?? 0) + 1)
      }
    })
    return {
      labels: days.map((d) => d.label),
      counts: days.map((d) => countByKey.get(d.key) ?? 0),
    }
  }, [filteredSessions, datePreset])

  const sessionsByCaseType = useMemo(() => {
    const sessions = filteredSessions
    const total = sessions.length
    const counts = new Map<string, number>()
    sessions.forEach((s) => {
      const id = s.case_type_id ?? '__none__'
      counts.set(id, (counts.get(id) ?? 0) + 1)
    })
    const rows = Array.from(counts.entries()).map(([id, count]) => ({
      id,
      name: id === '__none__' ? '—' : caseTypeNameById.get(id) ?? 'Unknown',
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    rows.sort((a, b) => b.count - a.count)
    return { rows, total }
  }, [filteredSessions, caseTypeNameById])

  const mostClickedProviders = useMemo(() => {
    const sessions = filteredSessions
    const counts = new Map<string, number>()
    sessions.forEach((s) => {
      ;(s.providers_clicked ?? []).forEach((pid) => {
        counts.set(pid, (counts.get(pid) ?? 0) + 1)
      })
    })
    return Array.from(counts.entries())
      .map(([id, clicks]) => ({
        id,
        name: providerNameById.get(id) ?? 'Unknown',
        clicks,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)
  }, [filteredSessions, providerNameById])

  const funnelSteps = useMemo(() => {
    const events = funnelEvents ?? []

    const sessionsByEvent = new Map<string, Set<string>>()
    events.forEach((e) => {
      if (!sessionsByEvent.has(e.event_type)) {
        sessionsByEvent.set(e.event_type, new Set())
      }
      sessionsByEvent.get(e.event_type)!.add(e.session_id)
    })

    const questionSteps = new Map<number, { label: string; sessions: Set<string> }>()
    events
      .filter((e) => e.event_type === 'question_answered')
      .forEach((e) => {
        const idx = e.step_index ?? 0
        if (!questionSteps.has(idx)) {
          questionSteps.set(idx, { label: e.question_text ?? `Step ${idx}`, sessions: new Set() })
        }
        questionSteps.get(idx)!.sessions.add(e.session_id)
      })

    const ordered = Array.from(questionSteps.entries()).sort((a, b) => a[0] - b[0])

    const steps: { label: string; count: number }[] = [
      { label: 'Widget Opened', count: sessionsByEvent.get('widget_opened')?.size ?? 0 },
      { label: 'Case Type Selected', count: sessionsByEvent.get('case_type_selected')?.size ?? 0 },
      ...ordered.map(([, v]) => ({ label: v.label, count: v.sessions.size })),
      { label: 'Results Shown', count: sessionsByEvent.get('results_shown')?.size ?? 0 },
    ]

    const bookingCount = sessionsByEvent.get('booking_clicked')?.size ?? 0
    const callCount = sessionsByEvent.get('call_clicked')?.size ?? 0
    const top = steps[0]?.count ?? 0

    return { steps, bookingCount, callCount, top }
  }, [funnelEvents])

  const analyticsLoading = Boolean(orgId) && isLoading

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-slate-500">{orgName}</p>
      </section>

      {!orgId || analyticsLoading ? (
        <p className="mb-8 text-sm text-slate-500">Loading analytics…</p>
      ) : error ? (
        <p className="mb-8 text-sm text-red-600">{error instanceof Error ? error.message : 'Unable to load analytics.'}</p>
      ) : data ? (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="w-full text-xs text-slate-500">Filters all data below</span>
            <select
              value={selectedWidgetId ?? ''}
              onChange={(e) => setSelectedWidgetId(e.target.value || null)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
            >
              <option value="">All Widgets</option>
              {(widgets ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.button_text}
                </option>
              ))}
            </select>
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDatePreset(p)}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  datePreset === p
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
                }`}
              >
                {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDatePreset('custom')}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                datePreset === 'custom'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
              }`}
            >
              Custom range
            </button>
            {datePreset === 'custom' ? (
              <div className="mt-1 flex w-full items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
              </div>
            ) : null}
          </div>

          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                <BarChart3 className="h-5 w-5 text-indigo-600" aria-hidden />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{funnel.total}</p>
              <p className="mt-1 text-sm text-slate-500">Total Sessions</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <Users className="h-5 w-5 text-emerald-600" aria-hidden />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{funnel.gotResults}</p>
              <p className="mt-1 text-sm text-slate-500">Got Results</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                <MousePointerClick className="h-5 w-5 text-violet-600" aria-hidden />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{funnel.clickedBooking}</p>
              <p className="mt-1 text-sm text-slate-500">Clicked Booking</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <TrendingDown className="h-5 w-5 text-amber-600" aria-hidden />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{funnel.dropOffRate}%</p>
              <p className="mt-1 text-sm text-slate-500">Drop-off Rate</p>
            </div>
          </div>

          <FunnelChart
            steps={funnelSteps.steps}
            bookingCount={funnelSteps.bookingCount}
            callCount={funnelSteps.callCount}
            top={funnelSteps.top}
          />

          <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Sessions over time</h2>
            </div>
            <div className="px-6 py-4">
              <SessionsOverTimeChart counts={sessionsOverTime.counts} labels={sessionsOverTime.labels} />
            </div>
          </section>

          <div className="mb-8 grid gap-8 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Sessions by Case Type</h2>
              </div>
              {sessionsByCaseType.rows.length === 0 ? (
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
                      {sessionsByCaseType.rows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                          <td className="px-6 py-3 text-slate-700">{row.count}</td>
                          <td className="px-6 py-3 text-slate-700">{row.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Most Clicked Providers</h2>
              </div>
              {mostClickedProviders.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-slate-500">No booking clicks yet.</p>
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
                      {mostClickedProviders.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                          <td className="px-6 py-3 text-slate-700">{row.clicks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Session log</h2>
            </div>
            {filteredSessions.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-slate-500">No sessions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                      <th className="w-8 px-4 py-3" aria-hidden />
                      <th className="px-4 py-3">Date/Time</th>
                      <th className="px-4 py-3">Case Type</th>
                      <th className="px-4 py-3">Results Shown</th>
                      <th className="px-4 py-3">Booking Clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((session) => {
                      const expanded = expandedSessionId === session.id
                      const caseTypeName = session.case_type_id
                        ? caseTypeNameById.get(session.case_type_id) ?? 'Unknown'
                        : '—'
                      const clicked = (session.providers_clicked ?? []).length > 0
                      const answerEntries = Object.entries(session.answers ?? {})
                      const clickedNames = (session.providers_clicked ?? []).map(
                        (pid) => providerNameById.get(pid) ?? 'Unknown'
                      )

                      return (
                        <Fragment key={session.id}>
                          <tr
                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                            onClick={() =>
                              setExpandedSessionId(expanded ? null : session.id)
                            }
                          >
                            <td className="px-4 py-3 text-slate-400">
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" aria-hidden />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden />
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{formatDateTime(session.created_at)}</td>
                            <td className="px-4 py-3 text-slate-700">{caseTypeName}</td>
                            <td className="px-4 py-3 text-slate-700">{session.results_count ?? 0}</td>
                            <td className="px-4 py-3 text-slate-700">{clicked ? 'Yes' : 'No'}</td>
                          </tr>
                          {expanded ? (
                            <tr key={`${session.id}-detail`} className="border-b border-slate-100 bg-slate-50/50">
                              <td colSpan={5} className="px-6 py-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Answers
                                    </h3>
                                    {answerEntries.length === 0 ? (
                                      <p className="text-sm text-slate-500">No answers recorded.</p>
                                    ) : (
                                      <dl className="space-y-1 text-sm">
                                        {answerEntries.map(([key, value]) => (
                                          <div key={key} className="flex gap-2">
                                            <dt className="shrink-0 font-medium text-slate-700">{key}:</dt>
                                            <dd className="text-slate-600">{String(value)}</dd>
                                          </div>
                                        ))}
                                      </dl>
                                    )}
                                  </div>
                                  <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Providers Clicked
                                    </h3>
                                    {clickedNames.length === 0 ? (
                                      <p className="text-sm text-slate-500">None</p>
                                    ) : (
                                      <ul className="list-inside list-disc text-sm text-slate-600">
                                        {clickedNames.map((name, i) => (
                                          <li key={`${session.id}-click-${i}`}>{name}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="mb-8 text-sm text-slate-500">Unable to load analytics.</p>
      )}
    </div>
  )
}
