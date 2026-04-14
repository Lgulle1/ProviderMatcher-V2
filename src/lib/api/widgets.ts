import { supabase } from '../supabase'
import type { Widget } from '../../types/database'

export async function getWidgets(orgId: string): Promise<Widget[]> {
  const { data, error } = await supabase
    .from('widgets')
    .select('*')
    .eq('org_id', orgId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (error || !data) {
    return []
  }

  return data as Widget[]
}

export async function getWidget(id: string): Promise<Widget | null> {
  const { data, error } = await supabase.from('widgets').select('*').eq('id', id).maybeSingle()

  if (error || !data) {
    return null
  }

  return data as Widget
}

export async function createWidget(
  orgId: string,
  name: string
): Promise<{ data: Widget | null; error: string | null }> {
  const { data: inserted, error } = await supabase
    .from('widgets')
    .insert({
      org_id: orgId,
      name,
      status: 'draft',
    })
    .select()
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: (inserted as Widget) ?? null, error: null }
}

export async function updateWidget(id: string, updates: Partial<Widget>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('widgets').update(updates).eq('id', id)

  return { error: error?.message ?? null }
}

export async function publishWidget(
  id: string,
  snapshot: Record<string, any>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('widgets')
    .update({
      status: 'live',
      published_at: new Date().toISOString(),
      published_snapshot: snapshot,
    })
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function unpublishWidget(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('widgets')
    .update({
      status: 'draft',
      published_at: null,
      published_snapshot: null,
    })
    .eq('id', id)

  return { error: error?.message ?? null }
}
