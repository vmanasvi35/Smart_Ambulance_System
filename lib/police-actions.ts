import type { SupabaseClient } from '@supabase/supabase-js'
import type { AmbulanceTrip, PoliceDecision, RouteCondition, RouteState } from '@/lib/types'
import type { SmartRouteData } from '@/lib/routing'

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

  // Update existing pending or acknowledged alerts to 'resolved'
  const { data: updatedAlerts } = await supabase
    .from('police_alerts')
    .update({
      alert_status: 'resolved',
      message: `${response} response issued for ${trip.ambulance_id}. Driver dashboard will handle navigation updates.`,
      assigned_police: user?.id,
      updated_at: new Date().toISOString(),
    })
    .eq('trip_id', trip.id)
    .in('alert_status', ['pending', 'acknowledged'])
    .select()

  // If no active alerts were found, insert a resolved route assessment alert
  if (!updatedAlerts || updatedAlerts.length === 0) {
    await supabase.from('police_alerts').insert({
      trip_id: trip.id,
      alert_type: 'route_assessment',
      message: `${response} response issued for ${trip.ambulance_id}. Driver dashboard will handle navigation updates.`,
      assigned_police: user?.id,
      alert_status: 'resolved',
    })
  }
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
