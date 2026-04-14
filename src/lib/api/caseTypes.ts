import { supabase } from '../supabase'
import type { CaseType } from '../../types/database'

export async function getCaseTypes(orgId: string): Promise<CaseType[]> {
  const { data, error } = await supabase
    .from('case_types')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    return []
  }

  return data as CaseType[]
}

export async function createCaseType(
  orgId: string,
  name: string
): Promise<{ data: CaseType | null; error: string | null }> {
  const { data: maxRow } = await supabase
    .from('case_types')
    .select('sort_order')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const maxSort = maxRow?.sort_order
  const nextSort = typeof maxSort === 'number' ? maxSort + 1 : 0

  const { data: inserted, error } = await supabase
    .from('case_types')
    .insert({
      org_id: orgId,
      name,
      sort_order: nextSort,
    })
    .select()
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: (inserted as CaseType) ?? null, error: null }
}

export async function updateCaseType(id: string, name: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('case_types').update({ name }).eq('id', id)

  return { error: error?.message ?? null }
}

export async function updateCaseTypeOrders(
  updates: Array<{ id: string; sort_order: number }>
): Promise<{ error: string | null }> {
  const results = await Promise.all(
    updates.map((u) => supabase.from('case_types').update({ sort_order: u.sort_order }).eq('id', u.id))
  )

  const failed = results.find((r) => r.error)
  return { error: failed?.error?.message ?? null }
}

export async function archiveCaseType(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('case_types').update({ is_archived: true }).eq('id', id)

  return { error: error?.message ?? null }
}

export async function getCaseTypeOfferingCount(caseTypeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('offerings')
    .select('*', { count: 'exact', head: true })
    .eq('case_type_id', caseTypeId)
    .eq('is_archived', false)

  if (error) {
    return 0
  }

  return count ?? 0
}
