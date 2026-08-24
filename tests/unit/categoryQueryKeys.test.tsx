import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../../src/types/database'

/**
 * Pins the cache-key contract between the counts-augmented list pages and the
 * plain `Category[]` / `CaseType[]` consumers elsewhere in the app.
 *
 * CategoriesPage caches `{entity, offeringCount}[]`, while ProvidersPage,
 * LogicTester, DataTablePage and ProviderProfilePage cache a plain
 * `Category[]` — all previously under the same ['categories', orgId] key.
 * React Query keys the cache by that tuple, so whichever mounted first served
 * its shape to the other on the next mount, before the refetch resolved. A
 * consumer reading `.name` off the augmented rows renders blank names.
 *
 * These tests assert the two shapes live under different keys, and that the
 * list page still invalidates the plain key so the other pages refresh after
 * an add/edit/archive.
 */

const api = vi.hoisted(() => ({
  getCategories: vi.fn(),
  getCategoryOfferingCounts: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  updateCategoryOrders: vi.fn(),
  archiveCategory: vi.fn(),
}))

vi.mock('../../src/lib/api/categories', () => api)
vi.mock('../../src/components/ui/toastStore', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }),
}))

import CategoriesPage from '../../src/pages/categories/CategoriesPage'
import { useAuthStore } from '../../src/stores/authStore'

const category = (over: Partial<Category> = {}): Category =>
  ({
    id: 'cat1',
    org_id: 'org1',
    name: 'Sports Medicine',
    sort_order: 0,
    is_archived: false,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Category

/**
 * Stands in for the plain-shape consumers (ProvidersPage, LogicTester,
 * DataTablePage, ProviderProfilePage), which all read `Category[]` from
 * ['categories', orgId] and render `.name`.
 */
function PlainCategoryConsumer() {
  const { data } = useQuery({
    queryKey: ['categories', 'org1'],
    queryFn: () => api.getCategories('org1'),
  })
  return (
    <ul data-testid="consumer">
      {(data ?? []).map((c: Category, i: number) => (
        <li key={i}>{String(c?.name)}</li>
      ))}
    </ul>
  )
}

let client: QueryClient

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.setState({
    org: { id: 'org1', name: 'Test Org' } as never,
    user: { id: 'u1', org_id: 'org1', name: 'Tester', email: 't@example.com' } as never,
  })
  api.getCategories.mockResolvedValue([
    category({ id: 'cat1', name: 'Sports Medicine', sort_order: 0 }),
    category({ id: 'cat2', name: 'Joint Replacement', sort_order: 1 }),
  ])
  api.getCategoryOfferingCounts.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, 0])),
  )
  api.createCategory.mockResolvedValue({ error: null })
  api.updateCategory.mockResolvedValue({ error: null })
  api.updateCategoryOrders.mockResolvedValue({ error: null })
  api.archiveCategory.mockResolvedValue({ error: null })
})

describe('categories cache keys', () => {
  it('does not write augmented rows into the plain Category[] key', async () => {
    render(
      <QueryClientProvider client={client}>
        <CategoriesPage />
      </QueryClientProvider>,
    )
    await screen.findByText('Sports Medicine')

    // The plain key must hold either nothing or real Category objects -- never
    // the page's {entity, offeringCount} rows.
    const plain = client.getQueryData<unknown[]>(['categories', 'org1'])
    if (plain) {
      for (const row of plain) {
        expect(row).toHaveProperty('name')
        expect(row).not.toHaveProperty('offeringCount')
      }
    }
  })

  it('serves a plain-shape consumer real category names, not augmented rows', async () => {
    // Mount the list page first so its data is cached, then mount a consumer
    // that reads the plain key -- the exact navigation order that broke.
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <CategoriesPage />
      </QueryClientProvider>,
    )
    await screen.findByText('Sports Medicine')
    unmount()

    render(
      <QueryClientProvider client={client}>
        <PlainCategoryConsumer />
      </QueryClientProvider>,
    )

    // The consumer must never be handed the augmented shape. Before the keys
    // were split it rendered "undefined" for every name, because it read
    // `.name` off {entity, offeringCount} rows served from the shared key.
    const list = await screen.findByTestId('consumer')
    expect(list.textContent).not.toContain('undefined')

    // It then resolves real names from its own fetch.
    await screen.findByText('Sports Medicine')
    expect(screen.getByTestId('consumer').textContent).toContain('Joint Replacement')
  })

  it('still refreshes the plain key after an add, so other pages update', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <CategoriesPage />
        <PlainCategoryConsumer />
      </QueryClientProvider>,
    )
    await screen.findByText('Sports Medicine')
    // Wait for the consumer's own fetch to settle so dataUpdatedAt is stable.
    await waitFor(() => {
      expect(client.getQueryState(['categories', 'org1'])?.dataUpdatedAt).toBeTruthy()
    })

    // Track the PLAIN key specifically -- the list page's own query also calls
    // getCategories, so a raw call count could not tell the two apart.
    const before = client.getQueryState(['categories', 'org1'])!.dataUpdatedAt

    await user.click(screen.getByRole('button', { name: /add category/i }))
    await user.type(await screen.findByRole('textbox'), 'Hand Surgery')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // The mutation must invalidate the plain key too, or the other pages keep
    // showing a stale list until their own gcTime expires.
    await waitFor(() => {
      expect(client.getQueryState(['categories', 'org1'])!.dataUpdatedAt).toBeGreaterThan(before)
    })
  })
})
