import type { SupabaseClient } from '@supabase/supabase-js'

export type TripNotificationPayload = {
  event_type: 'dispatch_assigned' | 'driver_accepted'
  driver_id?: string | null
  pickup: string
  destination: string
  priority: string
  ambulanceId: string
  eta?: number | string | null
  trip_id?: string
}

export async function broadcastTripNotification(
  supabase: SupabaseClient,
  payload: TripNotificationPayload,
): Promise<void> {
  const channel = supabase.channel('ambulance-notifications')

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'notification',
          payload,
        })
        resolve()
        return
      }

      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        resolve()
      }
    })
  })
}
