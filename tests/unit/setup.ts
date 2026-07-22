import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Several pages lock body scroll while a modal is open; reset between tests
  // so one test's modal can't leak into the next.
  document.body.style.overflow = ''
})
