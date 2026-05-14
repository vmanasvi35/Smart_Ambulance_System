import type { PoliceDecision, RouteCondition, RouteState, TrafficLevel } from '@/lib/types'

export type LatLngTuple = [number, number]

export interface Roadblock {
  lat: number
  lng: number
  id: string
}

export interface SpawnedVehicle {
  lat: number
  lng: number
  id: string
  ambulanceId: string
}

export interface SmartRouteData {
  waypoints: LatLngTuple[]
  totalDistance: number
  estimatedTime: number
  baseEta?: number
  trafficLevel?: TrafficLevel
  etaDelay?: number
  rerouteCount?: number
  lastReroutedAt?: string
  lastReroutedFor?: RouteCondition
  routeState?: RouteState
  policeDecision?: PoliceDecision
  policeDecisionAt?: string
  policeMessage?: string
  lastAlertedFor?: RouteCondition
  lastAlertedAt?: string
  manualRerouteCount?: number
  roadblocks?: Roadblock[]
  spawnedVehicles?: SpawnedVehicle[]
}

export interface RouteRequest {
  source: LatLngTuple
  destination: LatLngTuple
  avoidPoints?: Roadblock[]
  trafficLevel?: TrafficLevel
}

const trafficDelayMultiplier: Record<TrafficLevel, number> = {
  low: 1,
  medium: 1.35,
  high: 2.1,
}

export function calculateDistance(
  sourceLat: number,
  sourceLng: number,
  destLat: number,
  destLng: number,
): number {
  const earthRadiusKm = 6371
  const dLat = ((destLat - sourceLat) * Math.PI) / 180
  const dLng = ((destLng - sourceLng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((sourceLat * Math.PI) / 180) *
      Math.cos((destLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function generateFallbackRoute(
  source: LatLngTuple,
  destination: LatLngTuple,
  avoidPoints: Roadblock[] = [],
): LatLngTuple[] {
  const [sourceLat, sourceLng] = source
  const [destLat, destLng] = destination
  const steps = 36
  const hasAvoidance = avoidPoints.length > 0
  const waypoints: LatLngTuple[] = []
  const bend = hasAvoidance ? 0.018 : 0.006

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const curve = Math.sin(Math.PI * t)
    const lat = sourceLat + (destLat - sourceLat) * t + curve * bend
    const lng = sourceLng + (destLng - sourceLng) * t + curve * bend * 0.7
    waypoints.push([lat, lng])
  }

  return waypoints
}

function routeStats(waypoints: LatLngTuple[], trafficLevel: TrafficLevel = 'low') {
  const totalDistance = waypoints.reduce((total, point, index) => {
    if (index === 0) return total
    const previous = waypoints[index - 1]
    return total + calculateDistance(previous[0], previous[1], point[0], point[1])
  }, 0)

  const baseEta = Math.max(1, Math.round(totalDistance * 3))
  const estimatedTime = Math.max(1, Math.round(baseEta * trafficDelayMultiplier[trafficLevel]))

  return {
    totalDistance,
    estimatedTime,
    baseEta,
    etaDelay: Math.max(0, estimatedTime - baseEta),
  }
}

function decodeOrsCoordinates(features: unknown): LatLngTuple[] | null {
  const route = Array.isArray(features) ? features[0] : null
  const geometry = route && typeof route === 'object' && 'geometry' in route ? route.geometry : null
  const coordinates =
    geometry && typeof geometry === 'object' && 'coordinates' in geometry
      ? geometry.coordinates
      : null

  if (!Array.isArray(coordinates)) return null

  return coordinates
    .filter((point): point is [number, number] => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => [lat, lng])
}

export async function calculateSmartRoute({
  source,
  destination,
  avoidPoints = [],
  trafficLevel = 'low',
}: RouteRequest): Promise<SmartRouteData> {
  const apiKey = process.env.NEXT_PUBLIC_OPENROUTESERVICE_API_KEY

  if (apiKey) {
    try {
      const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [source[1], source[0]],
            [destination[1], destination[0]],
          ],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const waypoints = decodeOrsCoordinates(data.features)

        if (waypoints?.length) {
          return {
            waypoints,
            ...routeStats(waypoints, trafficLevel),
            trafficLevel,
            routeState: 'NORMAL',
            roadblocks: avoidPoints,
          }
        }
      }
    } catch {
      // Fall back to local simulation when ORS is unavailable or blocked.
    }
  }

  const waypoints = generateFallbackRoute(source, destination, avoidPoints)

  return {
    waypoints,
    ...routeStats(waypoints, trafficLevel),
    trafficLevel,
    routeState: 'NORMAL',
    roadblocks: avoidPoints,
  }
}

export function conditionForTrafficLevel(level: TrafficLevel): RouteCondition {
  if (level === 'high') return 'heavy_congestion'
  if (level === 'medium') return 'moderate_traffic'
  return 'clear'
}

export function speedForTrafficLevel(level: TrafficLevel) {
  if (level === 'high') return 8
  if (level === 'medium') return 22
  return 42
}

export function trafficLabel(level: TrafficLevel) {
  if (level === 'high') return 'Heavy Traffic'
  if (level === 'medium') return 'Medium Traffic'
  return 'Low Traffic'
}
