import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render errors so a single bad component shows a recoverable screen
 * instead of a blank page. Errors are logged to the console; wire this to a
 * reporting service when one is in place — until then the console is the only
 * record, so it deliberately logs the component stack too.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-600">
            This page hit an unexpected error. Your data has not been changed.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-500">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Try again
            </button>
            <button
              onClick={() => {
                window.location.href = '/dashboard'
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
