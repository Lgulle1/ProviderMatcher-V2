import { describe, expect, it, vi } from 'vitest'
import { PAGE_SIZE, selectAllRows } from '../../src/lib/api/paginate'

/**
 * selectAllRows exists so that reads which cover a whole table stay correct
 * once a tenant grows past PostgREST's per-response row cap. An off-by-one here
 * would not throw — it would silently drop or duplicate rows, and the offering
 * counts built on top of it would just be quietly wrong. Hence the boundary
 * cases below.
 */

/** Builds a fake pager over `total` synthetic rows, recording the ranges asked for. */
function fakeSource(total: number) {
  const ranges: Array<[number, number]> = []
  const buildPage = vi.fn(async (from: number, to: number) => {
    ranges.push([from, to])
    const rows = []
    for (let i = from; i <= to && i < total; i++) {
      rows.push({ i })
    }
    return { data: rows, error: null }
  })
  return { buildPage, ranges }
}

describe('selectAllRows', () => {
  it('returns every row from a single short page', async () => {
    const { buildPage } = fakeSource(3)
    const rows = await selectAllRows<{ i: number }>(buildPage)
    expect(rows).toHaveLength(3)
    expect(buildPage).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when there are no rows', async () => {
    const { buildPage } = fakeSource(0)
    expect(await selectAllRows(buildPage)).toEqual([])
  })

  it('requests non-overlapping, contiguous ranges', async () => {
    const { buildPage, ranges } = fakeSource(PAGE_SIZE * 2 + 5)
    await selectAllRows(buildPage)
    expect(ranges[0]).toEqual([0, PAGE_SIZE - 1])
    expect(ranges[1]).toEqual([PAGE_SIZE, PAGE_SIZE * 2 - 1])
    expect(ranges[2]).toEqual([PAGE_SIZE * 2, PAGE_SIZE * 3 - 1])
  })

  it('pages past the cap without dropping or duplicating rows', async () => {
    const total = PAGE_SIZE * 2 + 5
    const { buildPage } = fakeSource(total)
    const rows = await selectAllRows<{ i: number }>(buildPage)
    expect(rows).toHaveLength(total)
    // Every index present exactly once.
    expect(new Set(rows!.map((r) => r.i)).size).toBe(total)
    expect(buildPage).toHaveBeenCalledTimes(3)
  })

  it('stops after one extra empty page when the total is an exact multiple', async () => {
    // The boundary that hides off-by-ones: a full final page looks like "more".
    const total = PAGE_SIZE
    const { buildPage } = fakeSource(total)
    const rows = await selectAllRows<{ i: number }>(buildPage)
    expect(rows).toHaveLength(total)
    expect(new Set(rows!.map((r) => r.i)).size).toBe(total)
    expect(buildPage).toHaveBeenCalledTimes(2)
  })

  it('returns null when a page errors, so callers can tell it apart from empty', async () => {
    const failing = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    expect(await selectAllRows(failing)).toBeNull()
  })

  it('returns null when a later page errors rather than a truncated list', async () => {
    let call = 0
    const flaky = vi.fn(async (from: number, to: number) => {
      call += 1
      if (call > 1) {
        return { data: null, error: { message: 'boom' } }
      }
      const rows = []
      for (let i = from; i <= to; i++) {
        rows.push({ i })
      }
      return { data: rows, error: null }
    })
    expect(await selectAllRows(flaky)).toBeNull()
  })
})
