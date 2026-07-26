import type { SupabaseClient } from '@supabase/supabase-js'
import type { AmbulanceTrip, AlertType, AlertStatus, PoliceDecision, RouteCondition, RouteState } from '@/lib/types'
import type { SmartRouteData } from '@/lib/routing'

const alertQueueMap = new Map<string, Promise<any>>()

export async function upsertPoliceAlert(
  supabase: SupabaseClient,
  trip: AmbulanceTrip,
  payload: { alert_type: AlertType; alert_status: AlertStatus; message: string; assigned_police?: string | null },
) {
  const tripId = trip.id
  const existingPromise = alertQueueMap.get(tripId) || Promise.resolve()

  const newPromise = existingPromise.then(async () => {
    const { data: existingAlerts } = await supabase
      .from('police_alerts')
      .select('id, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })

    const now = new Date().toISOString()

    if (existingAlerts && existingAlerts.length > 0) {
      const [latest, ...duplicates] = existingAlerts

      await supabase
        .from('police_alerts')
        .update({
          ...payload,
          updated_at: now,
        })
        .eq('id', latest.id)

      if (duplicates.length) {
        await supabase
          .from('police_alerts')
          .delete()
          .in('id', duplicates.map((alert) => alert.id))
      }
    } else {
      await supabase
        .from('police_alerts')
        .insert({
          trip_id: tripId,
          ...payload,
        })
    }
  }).catch((err) => {
    console.error('Error in upsertPoliceAlert serialized execution:', err)
  })

  alertQueueMap.set(tripId, newPromise)
  return newPromise
}

export async function resolvePoliceAlerts(
  supabase: SupabaseClient,
  tripId: string,
  message?: string,
  assignedPolice?: string | null,
) {
  const payload: Record<string, unknown> = {
    alert_status: 'resolved',
    updated_at: new Date().toISOString(),
  }

  if (message !== undefined) payload.message = message
  if (assignedPolice !== undefined) payload.assigned_police = assignedPolice

  await supabase
    .from('police_alerts')
    .update(payload)
    .eq('trip_id', tripId)
}

export async function acknowledgePoliceAlerts(
  supabase: SupabaseClient,
  tripId: string,
  message?: string,
  assignedPolice?: string | null,
) {
  const payload: Record<string, unknown> = {
    alert_status: 'acknowledged',
    updated_at: new Date().toISOString(),
  }

  if (message !== undefined) payload.message = message
  if (assignedPolice !== undefined) payload.assigned_police = assignedPolice

  await supabase
    .from('police_alerts')
    .update(payload)
    .eq('trip_id', tripId)
    .eq('alert_status', 'pending')
}

export async function respondToRouteAlert(
  supabase: SupabaseClient,
  trip: AmbulanceTrip,
  decision: PoliceDecision,
  condition: RouteCondition,
  routeState: RouteState,
  response: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: currentTrip } = await supabase
    .from('ambulance_trips')
    .select('route_data')
    .eq('id', trip.id)
    .single()

  const nextRouteData = {
    ...(currentTrip?.route_data ?? {}),
    policeDecision: decision,
    policeDecisionAt: new Date().toISOString(),
    policeMessage: response,
    routeState,
  }

  await supabase
    .from('ambulance_trips')
    .update({
      route_condition: condition,
      route_data: nextRouteData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trip.id)

  await upsertPoliceAlert(supabase, trip, {
    alert_type: 'route_assessment',
    alert_status: 'resolved',
    message: `${response} response issued for ${trip.ambulance_id}. Driver dashboard will handle navigation updates.`,
    assigned_police: user?.id ?? null,
  })
}

export function getSmartRoute(trip: AmbulanceTrip | null | undefined): SmartRouteData | null {
  if (!trip?.route_data) return null
  return trip.route_data as SmartRouteData
}

const INTERVENTION_STATES: RouteState[] = [
  'CONGESTION_DETECTED',
  'ROADBLOCK_DETECTED',
  'WAITING_FOR_POLICE_RESPONSE',
]

const INTERVENTION_CONDITIONS: RouteCondition[] = ['heavy_congestion', 'road_blocked']

export function needsPoliceIntervention(trip: AmbulanceTrip): boolean {
  const route = getSmartRoute(trip)
  const state = route?.routeState
  if (state && INTERVENTION_STATES.includes(state)) return true
  if (INTERVENTION_CONDITIONS.includes(trip.route_condition)) return true
  return false
}

export type LiveAlertLevel = 'critical' | 'warning' | 'clear'

export type LiveAlertItem = {
  id: string
  tripId: string
  ambulanceId: string
  level: LiveAlertLevel
  title: string
  detail: string
  destination: string
}

export function buildLiveAlerts(trips: AmbulanceTrip[]): LiveAlertItem[] {
  return trips
    .map((trip) => {
      const route = getSmartRoute(trip)
      const state = route?.routeState
      const condition = trip.route_condition

      if (condition === 'road_blocked' || state === 'ROADBLOCK_DETECTED') {
        return {
          id: `${trip.id}-blocked`,
          tripId: trip.id,
          ambulanceId: trip.ambulance_id,
          level: 'critical' as const,
          title: 'Road Blocked',
          detail: 'Police action required',
          destination: trip.destination,
        }
      }

      if (
        condition === 'heavy_congestion' ||
        state === 'CONGESTION_DETECTED' ||
        state === 'WAITING_FOR_POLICE_RESPONSE'
      ) {
        return {
          id: `${trip.id}-heavy`,
          tripId: trip.id,
          ambulanceId: trip.ambulance_id,
          level: 'critical' as const,
          title: 'Heavy Traffic',
          detail: 'Police action required',
          destination: trip.destination,
        }
      }

      if (condition === 'moderate_traffic') {
        return {
          id: `${trip.id}-moderate`,
          tripId: trip.id,
          ambulanceId: trip.ambulance_id,
          level: 'warning' as const,
          title: 'Moderate Traffic',
          detail: 'Monitoring',
          destination: trip.destination,
        }
      }

      if (condition === 'clear' || state === 'CLEARED' || state === 'NORMAL') {
        return {
          id: `${trip.id}-clear`,
          tripId: trip.id,
          ambulanceId: trip.ambulance_id,
          level: 'clear' as const,
          title: 'Route Clear',
          detail: 'No action required',
          destination: trip.destination,
        }
      }

      return null
    })
    .filter((item): item is LiveAlertItem => item !== null)
}

export function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export type TimelineStep = {
  id: string
  label: string
  completed: boolean
  active: boolean
}

export function buildTripTimeline(trip: AmbulanceTrip): TimelineStep[] {
  const route = getSmartRoute(trip)
  const state = route?.routeState
  const condition = trip.route_condition
  const hasTraffic =
    condition === 'moderate_traffic' ||
    condition === 'heavy_congestion' ||
    condition === 'road_blocked' ||
    state === 'CONGESTION_DETECTED' ||
    state === 'ROADBLOCK_DETECTED' ||
    state === 'WAITING_FOR_POLICE_RESPONSE'
  const policeNotified = hasTraffic || Boolean(route?.policeDecision)
  const routeCleared = state === 'CLEARED' || condition === 'clear'
  const arrived = trip.status === 'completed'

  const steps: TimelineStep[] = [
    { id: 'started', label: 'Trip Started', completed: true, active: false },
    {
      id: 'traffic',
      label: 'Traffic Detected',
      completed: hasTraffic || policeNotified || routeCleared || arrived,
      active: false,
    },
    {
      id: 'notified',
      label: 'Police Notified',
      completed: policeNotified || routeCleared || arrived,
      active: false,
    },
    {
      id: 'cleared',
      label: 'Route Cleared',
      completed: routeCleared || arrived,
      active: false,
    },
    {
      id: 'arrival',
      label: 'Hospital Arrival',
      completed: arrived,
      active: false,
    },
  ]

  const firstIncomplete = steps.findIndex((s) => !s.completed)
  if (firstIncomplete >= 0) {
    steps[firstIncomplete].active = true
  } else if (steps.length) {
    steps[steps.length - 1].active = true
  }

  return steps
}

export function estimateSimulatedSpeed(trip: AmbulanceTrip): number {
  const route = getSmartRoute(trip)
  const traffic = route?.trafficLevel ?? 'low'
  if (traffic === 'high' || trip.route_condition === 'heavy_congestion') return 28
  if (traffic === 'medium' || trip.route_condition === 'moderate_traffic') return 42
  if (trip.route_condition === 'road_blocked') return 0
  return 58
}

export function priorityForTrip(trip: AmbulanceTrip): 'Critical' | 'High' | 'Normal' {
  if (needsPoliceIntervention(trip)) return 'Critical'
  if (trip.route_condition === 'moderate_traffic' || trip.status === 'in_progress') return 'High'
  return 'Normal'
}
