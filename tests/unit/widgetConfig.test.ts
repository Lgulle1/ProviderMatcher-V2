import { describe, expect, it } from 'vitest'
import { reconcileQuestionOrder } from '../../src/lib/widgetConfig'

describe('reconcileQuestionOrder', () => {
  it('keeps the stored order for questions still in scope', () => {
    expect(reconcileQuestionOrder(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('drops ids that are no longer scoped', () => {
    expect(reconcileQuestionOrder(['a', 'gone', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('appends newly scoped questions that have no stored position', () => {
    expect(reconcileQuestionOrder(['a'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('returns the scope order when nothing is stored', () => {
    expect(reconcileQuestionOrder(null, ['a', 'b'])).toEqual(['a', 'b'])
    expect(reconcileQuestionOrder(undefined, ['a', 'b'])).toEqual(['a', 'b'])
    expect(reconcileQuestionOrder([], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('is empty when nothing is scoped, whatever was stored', () => {
    expect(reconcileQuestionOrder(['a', 'b'], [])).toEqual([])
  })

  it('ignores non-string entries in stored order', () => {
    expect(reconcileQuestionOrder([1, null, 'a', { id: 'b' }], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('never emits a duplicate, even if the stored order contains one', () => {
    expect(reconcileQuestionOrder(['a', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('is idempotent — re-reconciling its own output changes nothing', () => {
    const once = reconcileQuestionOrder(['c', 'x', 'a'], ['a', 'b', 'c'])
    expect(reconcileQuestionOrder(once, ['a', 'b', 'c'])).toEqual(once)
  })
})
