import { supabase } from '../supabase'
import type { Question } from '../../types/database'

export async function getQuestions(orgId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('order_rank', { ascending: true })

  if (error || !data) {
    return []
  }

  return data as Question[]
}

export async function createQuestion(
  data: Omit<Question, 'id' | 'created_at' | 'updated_at'>
): Promise<{ data: Question | null; error: string | null }> {
  const { data: inserted, error } = await supabase.from('questions').insert(data).select().maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: (inserted as Question) ?? null, error: null }
}

export async function updateQuestion(id: string, updates: Partial<Question>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('questions').update(updates).eq('id', id)

  return { error: error?.message ?? null }
}

export async function archiveQuestion(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('questions').update({ is_archived: true }).eq('id', id)

  return { error: error?.message ?? null }
}

export async function reorderQuestions(
  updates: Array<{ id: string; order_rank: number }>
): Promise<{ error: string | null }> {
  const results = await Promise.all(
    updates.map((u) => supabase.from('questions').update({ order_rank: u.order_rank }).eq('id', u.id))
  )

  const failed = results.find((r) => r.error)
  return { error: failed?.error?.message ?? null }
}

export async function ensureEntryQuestion(orgId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('questions')
    .select('id')
    .eq('org_id', orgId)
    .eq('question_type', 'entry')
    .eq('is_archived', false)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return
  }

  await supabase.from('questions').insert({
    org_id: orgId,
    question_text: 'What are you seeing us for today?',
    subtext: null,
    question_type: 'entry',
    input_type: 'buttons',
    constraint_id: null,
    required: true,
    order_rank: 0,
    system_config: {},
    is_archived: false,
  })
}

export async function getNextOrderRank(orgId: string): Promise<number> {
  const { data: row } = await supabase
    .from('questions')
    .select('order_rank')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('order_rank', { ascending: false })
    .limit(1)
    .maybeSingle()

  const max = row?.order_rank
  if (max === undefined || max === null) {
    return 1
  }

  return max + 1
}
