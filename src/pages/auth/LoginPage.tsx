import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { signIn, signUp } from '../../hooks/useAuth'

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
})

const signUpSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Full name is required')
      .min(2, 'Name must be at least 2 characters'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    orgName: z
      .string()
      .min(1, 'Organization name is required')
      .min(2, 'Organization name must be at least 2 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  })

type SignInValues = z.infer<typeof signInSchema>
type SignUpValues = z.infer<typeof signUpSchema>

const inputClassName =
  'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      orgName: '',
    },
  })

  function toggleMode() {
    setIsSignUp((v) => !v)
    setErrorMessage('')
    signInForm.reset()
    signUpForm.reset()
  }

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

  async function onSignUpSubmit(data: SignUpValues) {
    setErrorMessage('')
    setIsLoading(true)
    try {
      const result = await signUp(data.email, data.password, data.name, data.orgName)
      if (result.error) {
        setErrorMessage(result.error)
        return
      }
      navigate('/onboarding')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <p className="text-2xl font-bold text-indigo-600">ProviderMatcher</p>
          <p className="mt-1 text-sm text-slate-500">Admin Dashboard</p>
        </div>

        <hr className="mt-6 mb-6 border-slate-200" />

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {!isSignUp ? (
          <form
            onSubmit={signInForm.handleSubmit(onSignInSubmit)}
            className="space-y-4"
            noValidate
          >
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
        ) : (
          <form
            onSubmit={signUpForm.handleSubmit(onSignUpSubmit)}
            className="space-y-4"
            noValidate
          >
            <div>
              <label htmlFor="signup-name" className="mb-1 block text-sm font-medium text-slate-700">
                Full Name
              </label>
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                className={inputClassName}
                {...signUpForm.register('name')}
              />
              {signUpForm.formState.errors.name ? (
                <p className="mt-1 text-sm text-red-500">{signUpForm.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="signup-email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                className={inputClassName}
                {...signUpForm.register('email')}
              />
              {signUpForm.formState.errors.email ? (
                <p className="mt-1 text-sm text-red-500">{signUpForm.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                className={inputClassName}
                {...signUpForm.register('password')}
              />
              {signUpForm.formState.errors.password ? (
                <p className="mt-1 text-sm text-red-500">{signUpForm.formState.errors.password.message}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="signup-confirm" className="mb-1 block text-sm font-medium text-slate-700">
                Confirm Password
              </label>
              <input
                id="signup-confirm"
                type="password"
                autoComplete="new-password"
                className={inputClassName}
                {...signUpForm.register('confirmPassword')}
              />
              {signUpForm.formState.errors.confirmPassword ? (
                <p className="mt-1 text-sm text-red-500">
                  {signUpForm.formState.errors.confirmPassword.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="signup-org" className="mb-1 block text-sm font-medium text-slate-700">
                Organization Name
              </label>
              <input
                id="signup-org"
                type="text"
                autoComplete="organization"
                className={inputClassName}
                {...signUpForm.register('orgName')}
              />
              {signUpForm.formState.errors.orgName ? (
                <p className="mt-1 text-sm text-red-500">{signUpForm.formState.errors.orgName.message}</p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        )}

        {!isSignUp ? (
          <p className="mt-4 text-center text-sm text-slate-600">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Sign up
            </button>
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
