import { supabase } from '../supabase'
import type { Constraint } from '../../types/database'

export async function getConstraints(orgId: string): Promise<Constraint[]> {
  const { data, error } = await supabase
    .from('constraints')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    return []
  }

  return data as Constraint[]
}

export async function createConstraint(
  data: Omit<Constraint, 'id' | 'created_at' | 'updated_at'>
): Promise<{ data: Constraint | null; error: string | null }> {
  const { data: inserted, error } = await supabase.from('constraints').insert(data).select().maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: (inserted as Constraint) ?? null, error: null }
}

export async function updateConstraint(id: string, updates: Partial<Constraint>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('constraints').update(updates).eq('id', id)

  return { error: error?.message ?? null }
}

export async function archiveConstraint(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('constraints').update({ is_archived: true }).eq('id', id)

  return { error: error?.message ?? null }
}

/** Next sort_order for a new constraint (non-archived only). */
export async function getNextConstraintSortOrder(orgId: string): Promise<number> {
  const list = await getConstraints(orgId)
  if (list.length === 0) {
    return 0
  }
  return Math.max(...list.map((c) => c.sort_order)) + 1
}

export async function getConstraintQuestionCount(constraintId: string): Promise<number> {
  const { count, error } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('constraint_id', constraintId)
    .eq('is_archived', false)

  if (error) {
    return 0
  }

  return count ?? 0
}
