import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaseType } from '../../src/types/database'

/**
 * Pins the modal form-reset behaviour of CaseTypesPage.
 *
 * The page used to reset `name`/`formError` from an effect watching `modal`,
 * which cascades an extra render on every open. These tests describe the
 * behaviour a user can observe, so the same assertions hold before and after
 * moving that reset into the handlers that open the modal.
 */

const caseType = (over: Partial<CaseType> = {}): CaseType =>
  ({
    id: 'ct1',
    org_id: 'org1',
    name: 'Knee Pain',
    order_rank: 0,
    is_archived: false,
    created_at: '',
    updated_at: '',
    ...over,
  }) as CaseType

const api = vi.hoisted(() => ({
  getCaseTypes: vi.fn(),
  getCaseTypeOfferingCounts: vi.fn(),
  createCaseType: vi.fn(),
  updateCaseType: vi.fn(),
  updateCaseTypeOrders: vi.fn(),
  archiveCaseType: vi.fn(),
}))

vi.mock('../../src/lib/api/caseTypes', () => api)

vi.mock('../../src/components/ui/toastStore', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }),
}))

import CaseTypesPage from '../../src/pages/case-types/CaseTypesPage'
import { useAuthStore } from '../../src/stores/authStore'

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CaseTypesPage />
    </QueryClientProvider>,
  )
}

/** The dialog is the element containing the name input. */
function dialog() {
  return screen.getByRole('textbox').closest('div[class*="fixed"], form, div') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({
    org: { id: 'org1', name: 'Test Org' } as never,
    user: { id: 'u1', org_id: 'org1', name: 'Tester', email: 't@example.com' } as never,
  })
  api.getCaseTypes.mockResolvedValue([
    caseType({ id: 'ct1', name: 'Knee Pain', order_rank: 0 }),
    caseType({ id: 'ct2', name: 'Shoulder Pain', order_rank: 1 }),
  ])
  api.getCaseTypeOfferingCounts.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, 0])),
  )
  api.createCaseType.mockResolvedValue({ error: null })
  api.updateCaseType.mockResolvedValue({ error: null })
  api.archiveCaseType.mockResolvedValue({ error: null })
})

describe('CaseTypesPage modal state', () => {
  it('opens the add dialog with an empty name field', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Knee Pain')

    await user.click(screen.getByRole('button', { name: /add case type/i }))

    const input = await screen.findByRole('textbox')
    expect(input).toHaveValue('')
  })

  it('opens the edit dialog prefilled with that row’s name', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Shoulder Pain')

    const row = screen.getByText('Shoulder Pain').closest('li, tr, div') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /edit/i }))

    expect(await screen.findByRole('textbox')).toHaveValue('Shoulder Pain')
  })

  it('does not carry a typed value from one open to the next', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Knee Pain')

    // Type into add, then close without saving.
    await user.click(screen.getByRole('button', { name: /add case type/i }))
    await user.type(await screen.findByRole('textbox'), 'Discarded draft')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Reopening must start clean, not show the discarded draft.
    await user.click(screen.getByRole('button', { name: /add case type/i }))
    expect(await screen.findByRole('textbox')).toHaveValue('')
  })

  it('clears a validation error when the dialog is reopened', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Knee Pain')

    // A single character trips the minimum-length check.
    await user.click(screen.getByRole('button', { name: /add case type/i }))
    await user.type(await screen.findByRole('textbox'), 'x')
    await user.click(screen.getByRole('button', { name: /^save$|^add$|^create$/i }))

    const error = await screen.findByText(/at least 2 characters/i)
    expect(error).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    await user.click(screen.getByRole('button', { name: /add case type/i }))

    await waitFor(() => {
      expect(screen.queryByText(/at least 2 characters/i)).not.toBeInTheDocument()
    })
  })

  it('renders rows in the order the query returned them', async () => {
    renderPage()
    await screen.findByText('Knee Pain')

    const names = screen.getAllByRole('button', { name: /edit case type/i }).map((btn) => {
      const row = btn.closest('div') as HTMLElement
      return row.textContent
    })
    // Knee Pain (rank 0) must precede Shoulder Pain (rank 1).
    const all = document.body.textContent ?? ''
    expect(all.indexOf('Knee Pain')).toBeLessThan(all.indexOf('Shoulder Pain'))
    expect(names).toHaveLength(2)
  })

  it('picks up a reordered list when the query data changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Knee Pain')

    // Simulate the post-save refetch returning a new order.
    api.getCaseTypes.mockResolvedValue([
      caseType({ id: 'ct2', name: 'Shoulder Pain', order_rank: 0 }),
      caseType({ id: 'ct1', name: 'Knee Pain', order_rank: 1 }),
    ])

    // Any mutation triggers invalidation; adding one is the simplest trigger.
    await user.click(screen.getByRole('button', { name: /add case type/i }))
    await user.type(await screen.findByRole('textbox'), 'Ankle Pain')
    await user.click(screen.getByRole('button', { name: /^save$|^add$|^create$/i }))

    await waitFor(() => {
      const all = document.body.textContent ?? ''
      expect(all.indexOf('Shoulder Pain')).toBeLessThan(all.indexOf('Knee Pain'))
    })
  })

  it('switching from edit straight to add clears the prefilled name', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Knee Pain')

    const row = screen.getByText('Knee Pain').closest('li, tr, div') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /edit/i }))
    expect(await screen.findByRole('textbox')).toHaveValue('Knee Pain')

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    await user.click(screen.getByRole('button', { name: /add case type/i }))

    expect(await screen.findByRole('textbox')).toHaveValue('')
  })
})

export { dialog }
