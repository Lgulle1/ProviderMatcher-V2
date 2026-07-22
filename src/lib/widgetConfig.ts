/**
 * Reconcile a widget's stored `question_order` against its scoped question set.
 *
 * The stored order can drift from the scope: a question may be unscoped after
 * the order was saved, or newly scoped without ever being placed. Both are
 * normal, and the widget renders questions in this order, so getting it wrong
 * silently changes what a patient is asked.
 *
 * Rules: keep the stored order for ids still in scope, drop ids that are not,
 * and append newly scoped ids that have no position yet.
 */
export function reconcileQuestionOrder(
  storedOrder: unknown,
  scopedQuestionIds: readonly string[],
): string[] {
  const scoped = new Set(scopedQuestionIds)
  const order: string[] = []
  const placed = new Set<string>()

  if (Array.isArray(storedOrder)) {
    for (const qid of storedOrder) {
      if (typeof qid === 'string' && scoped.has(qid) && !placed.has(qid)) {
        order.push(qid)
        placed.add(qid)
      }
    }
  }

  for (const qid of scopedQuestionIds) {
    if (!placed.has(qid)) {
      order.push(qid)
      placed.add(qid)
    }
  }

  return order
}
