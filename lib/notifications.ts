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
  // Persist for history / offline catch-up (best effort)
  if (payload.driver_id) {
    await supabase.from('notifications').insert({
      recipient_id: payload.driver_id,
      trip_id: payload.trip_id ?? null,
      event_type: payload.event_type,
      title:
        payload.event_type === 'dispatch_assigned'
          ? 'New Dispatch Assignment'
          : 'Driver Accepted Assignment',
      message: `${payload.pickup} → ${payload.destination}`,
      payload: {
        ambulanceId: payload.ambulanceId,
        priority: payload.priority,
        eta: payload.eta ?? null,
      },
    })
  }

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
