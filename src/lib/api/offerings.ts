import { supabase } from '../supabase'
import type { Offering } from '../../types/database'

export async function getOfferingsByProvider(providerId: string): Promise<Offering[]> {
  const { data, error } = await supabase
    .from('offerings')
    .select('*')
    .eq('provider_id', providerId)
    .eq('is_archived', false)

  if (error || !data) {
    return []
  }

  return data as Offering[]
}

export async function createOffering(data: {
  provider_id: string
  case_type_id: string
  org_id: string
  location_ids?: string[]
  constraints?: Record<string, any>
}): Promise<{ data: Offering | null; error: string | null }> {
  const { data: inserted, error } = await supabase
    .from('offerings')
    .insert({
      provider_id: data.provider_id,
      case_type_id: data.case_type_id,
      org_id: data.org_id,
      location_ids: data.location_ids ?? [],
      constraints: data.constraints ?? {},
    })
    .select()
    .single()

  if (error || !inserted) {
    return { data: null, error: error?.message ?? 'Failed to create offering' }
  }

  return { data: inserted as Offering, error: null }
}

export async function updateOffering(
  id: string,
  updates: Partial<Offering>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('offerings').update(updates).eq('id', id)
  return { error: error?.message ?? null }
}

export async function archiveOffering(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('offerings').update({ is_archived: true }).eq('id', id)
  return { error: error?.message ?? null }
}
