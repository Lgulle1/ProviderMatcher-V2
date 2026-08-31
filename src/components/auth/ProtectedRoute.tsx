import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getSession, signOut } from '../../hooks/useAuth'
import { useAuthStore } from '../../stores/authStore'

type GuardState = 'loading' | 'login' | 'onboarding' | 'allowed'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [state, setState] = useState<GuardState>('loading')

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const session = await getSession()
      if (cancelled) return

      if (!session) {
        setState('login')
        return
      }

      const org = useAuthStore.getState().org
      if (!org?.onboarding_completed) {
        setState('onboarding')
        return
      }

      setState('allowed')
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state !== 'allowed') return
    const configured = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES ?? '30')
    const timeoutMs = (Number.isFinite(configured) && configured >= 5 ? configured : 30) * 60_000
    const storageKey = 'pm-last-activity'
    const recordActivity = () => sessionStorage.setItem(storageKey, String(Date.now()))
    if (!sessionStorage.getItem(storageKey)) recordActivity()

    const checkIdle = () => {
      const lastActivity = Number(sessionStorage.getItem(storageKey) ?? '0')
      if (!lastActivity || Date.now() - lastActivity < timeoutMs) return
      sessionStorage.removeItem(storageKey)
      void signOut().finally(() => setState('login'))
    }

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart']
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }))
    const interval = window.setInterval(checkIdle, 30_000)
    checkIdle()
    return () => {
      events.forEach((event) => window.removeEventListener(event, recordActivity))
      window.clearInterval(interval)
    }
  }, [state])

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (state === 'login') {
    return <Navigate to="/login" replace />
  }

  if (state === 'onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
