export type UserRole = 'driver' | 'police' | 'dispatcher'

export type TripStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export type TripWorkflowStatus = 'Available' | 'Assigned' | 'Accepted' | 'Going to Pickup' | 'Patient Onboard' | 'En Route Hospital' | 'Completed' | 'Cancelled'

export type RouteCondition = 'unknown' | 'clear' | 'moderate_traffic' | 'heavy_congestion' | 'road_blocked'

export type TrafficLevel = 'low' | 'medium' | 'high'

export type ClearanceStatus = 'pending' | 'clearing' | 'cleared'

export type RouteState =
  | 'NORMAL'
  | 'CONGESTION_DETECTED'
  | 'ROADBLOCK_DETECTED'
  | 'WAITING_FOR_POLICE_RESPONSE'
  | 'REROUTING'
  | 'CLEARED'

export type PoliceDecision = 'CLEAR_ROUTE' | 'REROUTE_REQUIRED' | 'ROAD_BLOCK_CONFIRMED'

export type AlertType = 'traffic' | 'network_failure' | 'route_assessment' | 'general'

export type AlertStatus = 'pending' | 'acknowledged' | 'resolved'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  created_at: string
  updated_at?: string
  // Driver-specific fields
  age?: number
  hospital?: string
  experience_years?: number
  driving_license?: string
  // Police-specific fields
  police_id?: string
  police_station?: string
  badge_number?: string
}

export interface EmergencyRequestRow {
  id: string
  incident_id?: string | null
  pickup_location: string
  pickup_lat: number | null
  pickup_lng: number | null
  destination_hospital: string
  dest_lat: number | null
  dest_lng: number | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'assigned' | 'cancelled' | 'completed'
  patient_name: string | null
  age?: number | null
  notes: string | null
  emergency_type: string | null
  eta?: number | null
  distance?: number | null
  assigned_trip_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLogRow {
  id: string
  event_type: string
  message: string
  actor_id: string | null
  trip_id: string | null
  emergency_id: string | null
  ambulance_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface NotificationRow {
  id: string
  recipient_id: string | null
  trip_id: string | null
  event_type: string
  title: string | null
  message: string | null
  payload: Record<string, unknown>
  is_read: boolean
  created_at: string
}

export interface AmbulanceTrip {
  id: string
  driver_id: string
  ambulance_id: string
  emergency_id?: string | null
  source: string
  destination: string
  source_lat: number | null
  source_lng: number | null
  dest_lat: number | null
  dest_lng: number | null
  current_lat: number | null
  current_lng: number | null
  eta: number | null
  distance: number | null
  status: TripStatus
  route_condition: RouteCondition
  route_data: RouteData | null
  is_offline: boolean
  created_at: string
  updated_at: string
  // Joined data
  driver?: Profile
}

export interface RouteData {
  waypoints: [number, number][]
  totalDistance: number
  estimatedTime: number
  clearanceStatus?: ClearanceStatus
}

export interface PoliceAlert {
  id: string
  trip_id: string
  alert_type: AlertType
  alert_status: AlertStatus
  message: string | null
  assigned_police: string | null
  created_at: string
  updated_at: string
  // Joined data
  trip?: AmbulanceTrip
}

// Locations for simulation
export const BANGALORE_LOCATIONS = [
  { name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  { name: 'Indiranagar', lat: 12.9716, lng: 77.6412 },
  { name: 'Whitefield', lat: 12.9698, lng: 77.7499 },
  { name: 'Jayanagar', lat: 12.9308, lng: 77.5838 },
  { name: 'Malleshwaram', lat: 13.0035, lng: 77.5648 },
  { name: 'BTM Layout', lat: 12.9166, lng: 77.6101 },
  { name: 'HSR Layout', lat: 12.9121, lng: 77.6446 },
  { name: 'Electronic City', lat: 12.8399, lng: 77.6770 },
  { name: 'Yelahanka', lat: 13.1007, lng: 77.5963 },
  { name: 'Banashankari', lat: 12.9255, lng: 77.5468 },
  { name: 'Marathahalli', lat: 12.9591, lng: 77.6974 },
  { name: 'JP Nagar', lat: 12.9063, lng: 77.5857 },
] as const

export const HOSPITALS = [
  { name: 'Manipal Hospital', lat: 12.9592, lng: 77.6489 },
  { name: 'Apollo Hospital', lat: 12.9141, lng: 77.5950 },
  { name: 'Fortis Hospital', lat: 12.9600, lng: 77.6416 },
  { name: 'Columbia Asia Hospital', lat: 12.9698, lng: 77.7499 },
  { name: 'Narayana Health', lat: 12.8834, lng: 77.5987 },
] as const
