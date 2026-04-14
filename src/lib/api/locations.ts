import { supabase } from '../supabase'
import type { Location } from '../../types/database'

export async function getLocations(orgId: string): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('name', { ascending: true })

  if (error || !data) {
    return []
  }

  return (data as Location[]).filter(Boolean)
}

export async function createLocation(data: {
  org_id: string
  name: string
  address?: string
  phone?: string
  directions_url?: string
}): Promise<{ data: Location | null; error: string | null }> {
  const { data: inserted, error } = await supabase
    .from('locations')
    .insert({
      org_id: data.org_id,
      name: data.name,
      address: data.address ?? null,
      phone: data.phone ?? null,
      directions_url: data.directions_url ?? null,
    })
    .select()
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: (inserted as Location) ?? null, error: null }
}

export async function updateLocation(id: string, updates: Partial<Location>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('locations').update(updates).eq('id', id)

  return { error: error?.message ?? null }
}

export async function archiveLocation(id: string, orgId: string): Promise<{ error: string | null }> {
  const { error: deletePlError } = await supabase.from('provider_locations').delete().eq('location_id', id)

  if (deletePlError) {
    return { error: deletePlError.message }
  }

  const { data: offerings, error: fetchError } = await supabase
    .from('offerings')
    .select('id, location_ids')
    .eq('org_id', orgId)
    .contains('location_ids', [id])

  if (fetchError) {
    return { error: fetchError.message }
  }

  const toUpdate = offerings ?? []

  for (const row of toUpdate) {
    const next = ((row.location_ids as string[]) ?? []).filter((lid) => lid !== id)
    const { error: upErr } = await supabase.from('offerings').update({ location_ids: next }).eq('id', row.id)
    if (upErr) {
      return { error: upErr.message }
    }
  }

  const { error: archiveError } = await supabase.from('locations').update({ is_archived: true }).eq('id', id)

  return { error: archiveError?.message ?? null }
}

export async function getLocationOfferingCount(locationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('offerings')
    .select('*', { count: 'exact', head: true })
    .eq('is_archived', false)
    .contains('location_ids', [locationId])

  if (error) {
    return 0
  }

  return count ?? 0
}
