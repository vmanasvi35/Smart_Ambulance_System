import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityLogRow } from '@/lib/types'

export async function fetchRecentActivity(
  supabase: SupabaseClient,
  limit = 20,
): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as ActivityLogRow[]
}

export function formatActivityClock(value?: string | null) {
  const date = value ? new Date(value) : new Date()
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function activityTone(
  eventType: string,
): 'info' | 'success' | 'warning' | 'emergency' {
  if (
    eventType.includes('cleared') ||
    eventType.includes('accepted') ||
    eventType.includes('completed') ||
    eventType.includes('onboard')
  ) {
    return 'success'
  }
  if (eventType.includes('clearing') || eventType.includes('pickup') || eventType.includes('en_route')) {
    return 'warning'
  }
  if (eventType.includes('emergency') || eventType.includes('alert')) {
    return 'emergency'
  }
  return 'info'
}
