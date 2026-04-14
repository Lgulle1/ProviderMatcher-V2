import { supabase } from '../supabase'
import type { Category } from '../../types/database'

export async function getCategories(orgId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    return []
  }

  return data as Category[]
}

export async function createCategory(
  orgId: string,
  name: string
): Promise<{ data: Category | null; error: string | null }> {
  const { data: maxRow } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const maxSort = maxRow?.sort_order
  const nextSort = typeof maxSort === 'number' ? maxSort + 1 : 0

  const { data: inserted, error } = await supabase
    .from('categories')
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

  return { data: (inserted as Category) ?? null, error: null }
}

export async function updateCategory(id: string, name: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('categories').update({ name }).eq('id', id)

  return { error: error?.message ?? null }
}

export async function updateCategoryOrders(
  updates: Array<{ id: string; sort_order: number }>
): Promise<{ error: string | null }> {
  const results = await Promise.all(
    updates.map((u) => supabase.from('categories').update({ sort_order: u.sort_order }).eq('id', u.id))
  )

  const failed = results.find((r) => r.error)
  return { error: failed?.error?.message ?? null }
}

export async function archiveCategory(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('categories').update({ is_archived: true }).eq('id', id)

  return { error: error?.message ?? null }
}

/** Non-archived offerings whose provider includes this category in category_ids (parity with case type usage badge). */
export async function getCategoryOfferingCount(categoryId: string): Promise<number> {
  const { data: providers, error: pErr } = await supabase
    .from('providers')
    .select('id')
    .eq('is_archived', false)
    .contains('category_ids', [categoryId])

  if (pErr || !providers?.length) {
    return 0
  }

  const providerIds = providers.map((p) => p.id)
  const { count, error } = await supabase
    .from('offerings')
    .select('*', { count: 'exact', head: true })
    .eq('is_archived', false)
    .in('provider_id', providerIds)

  if (error) {
    return 0
  }

  return count ?? 0
}
