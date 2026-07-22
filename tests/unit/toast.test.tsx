import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContainer, useToast } from '../../src/components/ui/Toast'

/**
 * Covers the toast store after removing `setToastsState`, a module global that
 * was assigned during render and whose only effect was `toasts = toasts`. These
 * assert the observable behaviour that must survive its removal: toasts appear,
 * stack, and auto-dismiss.
 */

function Harness() {
  const { toast } = useToast()
  return (
    <>
      <button onClick={() => toast.success('Saved')}>success</button>
      <button onClick={() => toast.error('Broke')}>error</button>
      <ToastContainer />
    </>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  // Drain any pending auto-dismiss so toasts don't leak between tests.
  act(() => {
    vi.advanceTimersByTime(5000)
  })
  vi.useRealTimers()
})

describe('toast store', () => {
  it('renders a toast raised from a component', () => {
    render(<Harness />)
    act(() => {
      screen.getByText('success').click()
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('stacks multiple toasts', () => {
    render(<Harness />)
    act(() => {
      screen.getByText('success').click()
      screen.getByText('error').click()
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('Broke')).toBeInTheDocument()
  })

  it('auto-dismisses after its timeout', () => {
    render(<Harness />)
    act(() => {
      screen.getByText('success').click()
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})
