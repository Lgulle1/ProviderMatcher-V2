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
  const { data: providers, error: providersError } = await supabase
    .from('providers')
    .select('id')
    .eq('org_id', orgId)

  if (providersError) {
    return { error: providersError.message }
  }

  const providerIds = (providers ?? []).map((p) => p.id).filter(Boolean)

  if (providerIds.length > 0) {
    const { error: providerLocationsError } = await supabase
      .from('provider_locations')
      .delete()
      .in('provider_id', providerIds)

    if (providerLocationsError) {
      return { error: providerLocationsError.message }
    }
  }

  const { error: offeringsError } = await supabase.from('offerings').delete().eq('org_id', orgId)
  if (offeringsError) {
    return { error: offeringsError.message }
  }

  const { error: providersDeleteError } = await supabase.from('providers').delete().eq('org_id', orgId)
  if (providersDeleteError) {
    return { error: providersDeleteError.message }
  }

  const { error: categoriesError } = await supabase.from('categories').delete().eq('org_id', orgId)
  if (categoriesError) {
    return { error: categoriesError.message }
  }

  const { error: caseTypesError } = await supabase.from('case_types').delete().eq('org_id', orgId)
  if (caseTypesError) {
    return { error: caseTypesError.message }
  }

  const { error: importHistoryError } = await supabase.from('import_history').delete().eq('org_id', orgId)
  if (importHistoryError) {
    return { error: importHistoryError.message }
  }

  return { error: null }
}
