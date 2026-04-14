import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getSession } from '../../hooks/useAuth'
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
