import { supabase } from '../supabase'

export async function getDataTableOfferings(orgId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('offerings')
    .select('*, providers(id, name, category_ids, image_url)')
    .eq('org_id', orgId)
    .eq('is_archived', false)

  if (error || !data) {
    return []
  }

  return data
}

export async function updateOfferingLocationIds(
  offeringId: string,
  locationIds: string[]
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('offerings')
    .update({ location_ids: locationIds })
    .eq('id', offeringId)

  return { error: error?.message ?? null }
}

export async function updateOfferingConstraint(
  offeringId: string,
  key: string,
  value: any
): Promise<{ error: string | null }> {
  const { data: offering, error: fetchError } = await supabase
    .from('offerings')
    .select('constraints')
    .eq('id', offeringId)
    .maybeSingle()

  if (fetchError || !offering) {
    return { error: fetchError?.message ?? 'Failed to fetch offering constraints' }
  }

  const currentConstraints = (offering.constraints ?? {}) as Record<string, any>
  const merged = { ...currentConstraints, [key]: value }

  const { error } = await supabase.from('offerings').update({ constraints: merged }).eq('id', offeringId)
  return { error: error?.message ?? null }
}

export async function updateOfferingCaseType(
  offeringId: string,
  caseTypeId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('offerings')
    .update({ case_type_id: caseTypeId })
    .eq('id', offeringId)

  return { error: error?.message ?? null }
}

export async function updateProviderCategories(
  providerId: string,
  categoryIds: string[]
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('providers')
    .update({ category_ids: categoryIds })
    .eq('id', providerId)

  return { error: error?.message ?? null }
}

export async function archiveOfferings(offeringIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('offerings')
    .update({ is_archived: true })
    .in('id', offeringIds)

  return { error: error?.message ?? null }
}

export async function archiveAllOfferings(orgId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('offerings')
    .update({ is_archived: true })
    .eq('org_id', orgId)
    .eq('is_archived', false)

  return { error: error?.message ?? null }
}
