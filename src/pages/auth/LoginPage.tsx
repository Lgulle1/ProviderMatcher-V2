import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { getSession, signIn } from '../../hooks/useAuth'

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type SignInValues = z.infer<typeof signInSchema>

const inputClassName =
  'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()
  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  useEffect(() => {
    let cancelled = false
    void getSession().then((session) => {
      if (!cancelled && session) navigate('/dashboard', { replace: true })
    })
    return () => { cancelled = true }
  }, [navigate])

  async function onSignInSubmit(data: SignInValues) {
    setErrorMessage('')
    setIsLoading(true)
    try {
      const result = await signIn(data.email, data.password)
      if (result.error) {
        setErrorMessage(result.error)
        return
      }
      navigate('/dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <p className="text-2xl font-bold text-indigo-600">ProviderRoute</p>
          <p className="mt-1 text-sm text-slate-500">Admin Dashboard</p>
        </div>

        <h1 className="mt-8 text-center text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mb-4 mt-2 text-center text-sm text-slate-600">
          Accounts are invitation-only. Contact your administrator for access.
        </p>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={signInForm.handleSubmit(onSignInSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="signin-email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="signin-email"
              type="email"
              autoComplete="email"
              className={inputClassName}
              {...signInForm.register('email')}
            />
            {signInForm.formState.errors.email ? (
              <p className="mt-1 text-sm text-red-500">{signInForm.formState.errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="signin-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              className={inputClassName}
              {...signInForm.register('password')}
            />
            {signInForm.formState.errors.password ? (
              <p className="mt-1 text-sm text-red-500">{signInForm.formState.errors.password.message}</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
