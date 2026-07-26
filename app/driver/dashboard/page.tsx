'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { broadcastTripNotification } from '@/lib/notifications'
import { upsertPoliceAlert, resolvePoliceAlerts } from '@/lib/police-actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AmbulanceMap } from '@/components/ambulance-map'
import { StatusBadge } from '@/components/status-badge'
import {
  calculateSmartRoute,
  interpolateRoutePosition,
  routeRemainingDistance,
  speedForTrafficLevel,
  type SmartRouteData,
} from '@/lib/routing'
import {
  Clock,
  MapPin,
  Navigation,
  RefreshCw,
  Shield,
  Compass,
  Check,
  Hospital,
  Map,
  UserCheck,
  WifiOff,
  AlertCircle,
} from 'lucide-react'
import type { AmbulanceTrip, ClearanceStatus, PoliceDecision, Profile, RouteCondition, TrafficLevel, AlertType, AlertStatus } from '@/lib/types'
import { TRIP_WORKFLOW_STATUS, normalizeTripWorkflowStatus } from '@/lib/trip-status'
import {
  getStoredGpsRefreshInterval,
  GPS_REFRESH_INTERVAL_STORAGE_KEY,
  type GpsRefreshInterval,
} from '@/lib/dispatch-settings'

const rerouteDecisions: PoliceDecision[] = ['REROUTE_REQUIRED', 'ROAD_BLOCK_CONFIRMED']

// Valid Lifecycle Transitions mapping
const VALID_TRANSITIONS: Record<string, string[]> = {
  [TRIP_WORKFLOW_STATUS.available]: [TRIP_WORKFLOW_STATUS.assigned, TRIP_WORKFLOW_STATUS.accepted, TRIP_WORKFLOW_STATUS.goingToPickup],
  [TRIP_WORKFLOW_STATUS.assigned]: [TRIP_WORKFLOW_STATUS.accepted, TRIP_WORKFLOW_STATUS.goingToPickup, TRIP_WORKFLOW_STATUS.available],
  [TRIP_WORKFLOW_STATUS.accepted]: [TRIP_WORKFLOW_STATUS.goingToPickup, TRIP_WORKFLOW_STATUS.patientOnboard, TRIP_WORKFLOW_STATUS.enRouteHospital, TRIP_WORKFLOW_STATUS.completed, TRIP_WORKFLOW_STATUS.available],
  [TRIP_WORKFLOW_STATUS.goingToPickup]: [TRIP_WORKFLOW_STATUS.patientOnboard, TRIP_WORKFLOW_STATUS.enRouteHospital, TRIP_WORKFLOW_STATUS.completed, TRIP_WORKFLOW_STATUS.available],
  [TRIP_WORKFLOW_STATUS.patientOnboard]: [TRIP_WORKFLOW_STATUS.enRouteHospital, TRIP_WORKFLOW_STATUS.completed, TRIP_WORKFLOW_STATUS.available],
  [TRIP_WORKFLOW_STATUS.enRouteHospital]: [TRIP_WORKFLOW_STATUS.completed, TRIP_WORKFLOW_STATUS.available],
  [TRIP_WORKFLOW_STATUS.completed]: [TRIP_WORKFLOW_STATUS.available],
}

function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true
  if (to === TRIP_WORKFLOW_STATUS.completed || to === TRIP_WORKFLOW_STATUS.available) return true
  const allowed = VALID_TRANSITIONS[from] || []
  return allowed.length === 0 || allowed.includes(to)
}

function routeDataFor(trip: AmbulanceTrip | null): any {
  return trip?.route_data ?? null
}

function affectedRoadFor(trip: AmbulanceTrip) {
  return `${trip.source} to ${trip.destination}`
}

type NotificationItem = {
  id: string
  time: string
  text: string
  type: 'info' | 'warning' | 'success' | 'error'
}

export default function DriverDashboard() {
  const [activeTrip, setActiveTrip] = useState<AmbulanceTrip | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [routeIndex, setRouteIndex] = useState(0)
  const [gpsRefreshInterval, setGpsRefreshInterval] = useState<GpsRefreshInterval>(getStoredGpsRefreshInterval)
  const [arrivedAtPickup, setArrivedAtPickup] = useState(false)

  const DEMO_TRIP_DURATION_SECONDS = 180
  const SIMULATION_INTERVAL_MS = 500

  // Real-time Event Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'init',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text: 'Emergency vehicle telemetry console online. Awaiting dispatch assignment.',
      type: 'info',
    },
  ])

  const [toasts, setToasts] = useState<any[]>([])
  const [autoAccepted, setAutoAccepted] = useState(false)
  const supabase = createClient()
  const autoAcceptedRef = useRef(false)
  const pickupOnboardTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!activeTrip) return

    if (activeTrip.status === 'pending') {
      autoAcceptedRef.current = false
      setAutoAccepted(false)
    }
  }, [activeTrip?.id, activeTrip?.status])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === GPS_REFRESH_INTERVAL_STORAGE_KEY) {
        setGpsRefreshInterval(getStoredGpsRefreshInterval())
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const showToast = (toast: any) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 6000)
  }

  const pushNotification = useCallback((text: string, type: NotificationItem['type'] = 'info') => {
    setNotifications((prev) => [
      {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        text,
        type,
      },
      ...prev.slice(0, 19),
    ])
  }, [])

  useEffect(() => {
    if (!profile) return

    const notifyChannel = supabase
      .channel('driver-toast-notifications')
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        const eventType = payload?.event_type
        const eventPayload = payload as Record<string, unknown> | undefined

        if (!eventPayload || !['dispatch_assigned', 'driver_accepted'].includes(eventType)) return

        if (eventType === 'dispatch_assigned' && eventPayload.driver_id === profile.id) {
          showToast({
            title: 'New Incident Assigned',
            message: `Dispatch Center assigned you to ${String(eventPayload.destination ?? 'the requested destination')}.`,
            pickup: String(eventPayload.pickup ?? 'Unknown pickup'),
            destination: String(eventPayload.destination ?? 'Unknown destination'),
            priority: String(eventPayload.priority ?? 'standard'),
            ambulanceId: String(eventPayload.ambulanceId ?? 'Unknown ambulance'),
            eta: eventPayload.eta,
          })
          pushNotification(`Assignment received for ${String(eventPayload.pickup ?? 'the pickup')} → ${String(eventPayload.destination ?? 'the destination')}.`, 'success')
        }

        if (eventType === 'driver_accepted' && eventPayload.driver_id === profile.id) {
          showToast({
            title: 'Assignment Accepted',
            message: `You have accepted the ${String(eventPayload.priority ?? 'standard')} response for ${String(eventPayload.destination ?? 'the requested destination')}.`,
            pickup: String(eventPayload.pickup ?? 'Unknown pickup'),
            destination: String(eventPayload.destination ?? 'Unknown destination'),
            priority: String(eventPayload.priority ?? 'standard'),
            ambulanceId: String(eventPayload.ambulanceId ?? 'Unknown ambulance'),
            eta: eventPayload.eta,
          })
          pushNotification('Assignment accepted and trip is now active.', 'info')
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(notifyChannel)
    }
  }, [profile, pushNotification, supabase])

  const [simulationState, setSimulationState] = useState({
    trafficLevel: 'low' as TrafficLevel,
    isOffline: false,
    roadblockMode: false,
    roadblocks: [] as Array<{ lat: number; lng: number; id: string }>,
    spawnedVehicles: [] as Array<{ lat: number; lng: number; id: string; ambulanceId: string }>,
  })

  const activeTripRef = useRef<AmbulanceTrip | null>(null)
  const alertKeyRef = useRef<string | null>(null)

  useEffect(() => {
    activeTripRef.current = activeTrip
  }, [activeTrip])

  // Load profile and active trips
  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileData) setProfile(profileData)

    const { data: tripData } = await supabase
      .from('ambulance_trips')
      .select('*')
      .eq('driver_id', user.id)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch emergency request data if patient info is missing from route_data
    if (tripData && tripData.emergency_id) {
      const routeData = routeDataFor(tripData)
      if (!routeData?.patientName) {
        const { data: emergencyData } = await supabase
          .from('emergency_requests')
          .select('patient_name, age, notes, emergency_type')
          .eq('id', tripData.emergency_id)
          .maybeSingle()
        
        if (emergencyData) {
          // Update route_data with patient information
          await supabase
            .from('ambulance_trips')
            .update({
              route_data: {
                ...(routeData ?? {}),
                patientName: emergencyData.patient_name,
                patientNotes: emergencyData.notes,
                patientAge: emergencyData.age,
                emergencyType: emergencyData.emergency_type,
              },
            })
            .eq('id', tripData.id)
          
          // Reload trip data with updated patient info
          const { data: updatedTripData } = await supabase
            .from('ambulance_trips')
            .select('*')
            .eq('id', tripData.id)
            .single()
          
          setActiveTrip(updatedTripData)
        } else {
          setActiveTrip(tripData)
        }
      } else {
        setActiveTrip(tripData)
      }
    } else {
      setActiveTrip(tripData)
    }
    
    // Auto-resume simulation only if en route to pickup or hospital
    const rData = routeDataFor(tripData)
    const currentLifecycle = normalizeTripWorkflowStatus(rData?.status || (tripData ? TRIP_WORKFLOW_STATUS.assigned : TRIP_WORKFLOW_STATUS.available))
    const isTrackingStage = currentLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup || currentLifecycle === TRIP_WORKFLOW_STATUS.enRouteHospital
    setTracking(tripData?.status === 'in_progress' && isTrackingStage)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()

    const tripChannel = supabase
      .channel('driver-smart-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulance_trips' },
        () => {
          if (!simulationState.isOffline) loadData()
        },
      )
      .subscribe()

    const alertChannel = supabase
      .channel('driver-police-responses')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'police_alerts' },
        () => {
          if (!simulationState.isOffline) loadData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tripChannel)
      supabase.removeChannel(alertChannel)
    }
  }, [loadData, supabase, simulationState.isOffline])

  useEffect(() => {
    const routeData = routeDataFor(activeTrip)
    if (!routeData) return

    setSimulationState((current) => ({
      ...current,
      trafficLevel: routeData.trafficLevel ?? current.trafficLevel,
      roadblocks: routeData.roadblocks ?? current.roadblocks,
      spawnedVehicles: routeData.spawnedVehicles ?? current.spawnedVehicles,
    }))
  }, [activeTrip?.id])

  // Track state transitions for notifications panel
  const prevStatusRef = useRef<string | undefined>(undefined)
  const prevConditionRef = useRef<string | undefined>(undefined)
  const prevDecisionRef = useRef<string | undefined>(undefined)
  const prevRerouteCountRef = useRef<number>(0)
  const prevOfflineRef = useRef<boolean>(false)

  useEffect(() => {
    if (!activeTrip) return

    const addNotification = (text: string, type: 'info' | 'warning' | 'success' | 'error' = 'info') => {
      setNotifications((prev) => [
        {
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          text,
          type,
        },
        ...prev.slice(0, 19),
      ])
    }

    const rData = routeDataFor(activeTrip)
    const currentLifecycle = normalizeTripWorkflowStatus(rData?.status || TRIP_WORKFLOW_STATUS.assigned)

    if (currentLifecycle !== prevStatusRef.current) {
      if (prevStatusRef.current !== undefined) {
        addNotification(
          `Lifecycle status changed: ${prevStatusRef.current} → ${currentLifecycle}`,
          'success'
        )
      }
      prevStatusRef.current = currentLifecycle
    }

    if (activeTrip.route_condition !== prevConditionRef.current) {
      if (prevConditionRef.current !== undefined) {
        const isProblem = ['heavy_congestion', 'road_blocked'].includes(activeTrip.route_condition)
        addNotification(
          `Route obstacle detected: ${activeTrip.route_condition.replace('_', ' ').toUpperCase()}`,
          isProblem ? 'warning' : 'success'
        )
      }
      prevConditionRef.current = activeTrip.route_condition
    }

    const currentDecision = rData?.policeDecision
    if (currentDecision !== prevDecisionRef.current) {
      if (currentDecision) {
        addNotification(`Police clearance response: ${currentDecision.replace('_', ' ')}`, 'info')
      }
      prevDecisionRef.current = currentDecision
    }

    const reroutes = rData?.rerouteCount ?? 0
    if (reroutes > prevRerouteCountRef.current) {
      addNotification(`Smart routing engine recalculated path (Reroute #${reroutes})`, 'success')
      prevRerouteCountRef.current = reroutes
    }

    if (simulationState.isOffline !== prevOfflineRef.current) {
      addNotification(
        simulationState.isOffline ? 'GPS telemetry lost. Offline cached mode active.' : 'GPS telemetry synchronized.',
        simulationState.isOffline ? 'error' : 'success'
      )
      prevOfflineRef.current = simulationState.isOffline
    }
  }, [activeTrip, simulationState.isOffline])

  const updateTripRouteState = useCallback(
    async (updates: Partial<AmbulanceTrip> & { route_data?: any }) => {
      if (!activeTripRef.current || simulationState.isOffline) return

      await supabase
        .from('ambulance_trips')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTripRef.current.id)

      loadData()
    },
    [loadData, simulationState.isOffline, supabase],
  )

  const createAutomaticAlert = useCallback(
    async (condition: RouteCondition, etaDelay: number, congestionLevel: string) => {
      const trip = activeTripRef.current
      if (!trip || simulationState.isOffline) return
      if (condition !== 'heavy_congestion' && condition !== 'road_blocked') return

      const routeData = routeDataFor(trip)
      if (routeData?.routeState === 'WAITING_FOR_POLICE_RESPONSE') return

      const alertKey = `${trip.id}:${condition}:${Math.round(etaDelay)}`
      if (alertKeyRef.current === alertKey) return
      alertKeyRef.current = alertKey

      const { data: existingAlert } = await supabase
        .from('police_alerts')
        .select('id')
        .eq('trip_id', trip.id)
        .in('alert_status', ['pending', 'acknowledged'])
        .limit(1)
        .maybeSingle()

      await supabase
        .from('ambulance_trips')
        .update({
          route_condition: condition,
          route_data: {
            ...(routeData ?? {}),
            routeState: 'WAITING_FOR_POLICE_RESPONSE',
            lastAlertedFor: condition,
            lastAlertedAt: new Date().toISOString(),
            policeDecision: undefined,
            policeDecisionAt: undefined,
            policeMessage: undefined,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', trip.id)

      await upsertPoliceAlert(supabase, trip, {
        alert_type: condition === 'road_blocked' ? 'route_assessment' : 'traffic',
        alert_status: 'pending',
        message: [
          `Automatic smart-route alert for ${trip.ambulance_id}.`,
          `Affected road: ${affectedRoadFor(trip)}.`,
          `Congestion level: ${congestionLevel}.`,
          `Current ETA delay: ${etaDelay} min.`,
        ].join(' '),
      })
    },
    [simulationState.isOffline, supabase],
  )

  const rerouteTrip = useCallback(
    async (reason: RouteCondition, mode: 'police' | 'manual' = 'police') => {
      const trip = activeTripRef.current
      if (!trip || rerouting || simulationState.isOffline) return

      const routeData = routeDataFor(trip)
      if (mode === 'police' && routeData?.lastReroutedFor === reason) return
      if (!trip.current_lat || !trip.current_lng || !trip.dest_lat || !trip.dest_lng) return

      setRerouting(true)
      await updateTripRouteState({
        route_data: {
          ...(routeData ?? {
            waypoints: [],
            totalDistance: trip.distance ?? 0,
            estimatedTime: trip.eta ?? 0,
          }),
          routeState: 'REROUTING',
        },
      })

      const targetLat = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lat ?? trip.dest_lat) : trip.dest_lat
      const targetLng = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lng ?? trip.dest_lng) : trip.dest_lng

      if (!targetLat || !targetLng) return

      const nextRoute = await calculateSmartRoute({
        source: [trip.current_lat, trip.current_lng],
        destination: [targetLat, targetLng],
        avoidPoints: simulationState.roadblocks,
        trafficLevel: reason === 'road_blocked' ? 'medium' : simulationState.trafficLevel,
      })

      const routePayload: SmartRouteData = {
        ...nextRoute,
        trafficLevel: reason === 'road_blocked' ? 'medium' : simulationState.trafficLevel,
        roadblocks: simulationState.roadblocks,
        spawnedVehicles: simulationState.spawnedVehicles,
        rerouteCount: (routeData?.rerouteCount ?? 0) + 1,
        lastReroutedAt: new Date().toISOString(),
        lastReroutedFor: reason,
        routeState: 'CLEARED',
        policeDecision: undefined,
        policeMessage: mode === 'manual' ? 'Driver used emergency manual reroute.' : routeData?.policeMessage,
        manualRerouteCount: mode === 'manual' ? (routeData?.manualRerouteCount ?? 0) + 1 : routeData?.manualRerouteCount,
        phase: routeData?.phase || 'en_route_to_pickup',
        status: normalizeTripWorkflowStatus(routeData?.status || TRIP_WORKFLOW_STATUS.goingToPickup),
        priority: routeData?.priority || 'critical',
      } as any

      await updateTripRouteState({
        route_condition: reason === 'road_blocked' ? 'moderate_traffic' : 'clear',
        route_data: routePayload,
        distance: routePayload.totalDistance,
        eta: routePayload.estimatedTime,
      })
      setRouteIndex(0)
      setRerouting(false)
    },
    [rerouting, simulationState, updateTripRouteState],
  )

  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') return
    const routeData = routeDataFor(activeTrip)
    if (!routeData?.policeDecision || !rerouteDecisions.includes(routeData.policeDecision)) return

    rerouteTrip(routeData.policeDecision === 'ROAD_BLOCK_CONFIRMED' ? 'road_blocked' : 'heavy_congestion')
  }, [activeTrip, rerouteTrip])

  // GPS Simulation interval
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress' || !tracking) return

    const timer = window.setInterval(async () => {
      const trip = activeTripRef.current
      const routeData = routeDataFor(trip)
      const waypoints = routeData?.waypoints ?? []
      if (!trip || waypoints.length <= 1) return

      setRouteIndex((current) => {
        const routeCondition = trip.route_condition ?? 'clear'
        const routeState = routeData?.routeState ?? 'NORMAL'
        const baseIncrement = (waypoints.length - 1) / DEMO_TRIP_DURATION_SECONDS
        const movementFactor =
          routeCondition === 'clear' && routeState === 'NORMAL'
            ? 1
            : routeCondition === 'clear'
              ? 0.5
              : routeCondition === 'moderate_traffic'
                ? 0.1
                : routeCondition === 'heavy_congestion' || routeCondition === 'road_blocked'
                  ? 0.02
                  : 0.04
        const increment = Math.max(0.01, baseIncrement * movementFactor)
        const nextPosition = Math.min(current + increment, waypoints.length - 1)
        const [lat, lng] = interpolateRoutePosition(waypoints, nextPosition)
        const remainingDistance = routeRemainingDistance(waypoints, nextPosition)
        const totalDistance = routeData?.totalDistance ?? 1
        const remainingSeconds = Math.max(0, Math.round((remainingDistance / Math.max(0.001, totalDistance)) * DEMO_TRIP_DURATION_SECONDS))
        const nextEta = Math.max(1, Math.ceil(remainingSeconds / 60))

        supabase
          .from('ambulance_trips')
          .update({
            current_lat: lat,
            current_lng: lng,
            eta: nextEta,
            updated_at: new Date().toISOString(),
            route_data: {
              ...routeData,
              remainingDistance: Number(remainingDistance.toFixed(1)),
              progressPosition: nextPosition,
            },
          })
          .eq('id', trip.id)
          .then(() => {
            // Route condition and map movement are handled by the increment factor below.
          })

        const currentLifecycle = normalizeTripWorkflowStatus(routeData?.status || TRIP_WORKFLOW_STATUS.assigned)
        if (currentLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup) {
          const distanceShare = remainingDistance / Math.max(0.001, totalDistance)
          const arrivalThreshold = 0.08
          const isAtPickup = distanceShare <= arrivalThreshold
          if (isAtPickup && !arrivedAtPickup) {
            setArrivedAtPickup(true)
            pushNotification('Arrived at pickup location. Patient ready for boarding.', 'success')
          }
        } else if (currentLifecycle === TRIP_WORKFLOW_STATUS.enRouteHospital) {
          setArrivedAtPickup(false)
        }

        return nextPosition
      })
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [tracking, activeTrip?.id, supabase])

  // Trigger automatic alert if route condition is heavy/blocked and routeState isn't WAITING_FOR_POLICE_RESPONSE
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') return

    const routeData = routeDataFor(activeTrip)
    const condition = activeTrip.route_condition
    if (condition === 'heavy_congestion' || condition === 'road_blocked') {
      if (routeData?.routeState !== 'WAITING_FOR_POLICE_RESPONSE') {
        const etaDelay = routeData?.etaDelay ?? 12
        const congestionLabel = condition === 'road_blocked' ? 'Road Blocked' : 'Heavy Congestion'
        createAutomaticAlert(condition, etaDelay, congestionLabel)
      }
    }
  }, [activeTrip?.route_condition, activeTrip?.id, createAutomaticAlert])

  // Transition validation & execution
  const executeTransition = async (nextStatus: string, callback: () => Promise<void>) => {
    const routeData = routeDataFor(activeTrip)
    const currentStatus = normalizeTripWorkflowStatus(routeData?.status || (activeTrip ? TRIP_WORKFLOW_STATUS.assigned : TRIP_WORKFLOW_STATUS.available))

    if (!isValidTransition(currentStatus, nextStatus)) {
      alert(`Invalid Transition: Cannot change status from "${currentStatus}" to "${nextStatus}".`)
      return
    }

    await callback()
  }

  // Acceptance workflow actions
  const acceptAssignment = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.goingToPickup, async () => {
      setLoading(true)
      const routeData = routeDataFor(activeTrip)
      const startLat = activeTrip.current_lat ?? 12.9352
      const startLng = activeTrip.current_lng ?? 77.6245
      const pickupLat = activeTrip.source_lat ?? startLat
      const pickupLng = activeTrip.source_lng ?? startLng

      const calculatedRoute = await calculateSmartRoute({
        source: [startLat, startLng],
        destination: [pickupLat, pickupLng],
        trafficLevel: simulationState.trafficLevel,
      })

      const payload = {
        ...calculatedRoute,
        phase: 'en_route_to_pickup',
        status: TRIP_WORKFLOW_STATUS.goingToPickup,
        priority: routeData?.priority || 'critical',
        patientName: routeData?.patientName,
        patientNotes: routeData?.patientNotes,
        patientAge: routeData?.patientAge,
        emergencyType: routeData?.emergencyType,
      }

      await supabase
        .from('ambulance_trips')
        .update({
          status: 'in_progress',
          route_condition: 'clear',
          route_data: payload,
          eta: calculatedRoute.estimatedTime,
          distance: calculatedRoute.totalDistance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTrip.id)

      await broadcastTripNotification(supabase, {
        event_type: 'driver_accepted',
        driver_id: profile?.id,
        pickup: activeTrip.source,
        destination: activeTrip.destination,
        priority: routeData?.priority || 'critical',
        ambulanceId: activeTrip.ambulance_id,
        eta: calculatedRoute.estimatedTime,
        trip_id: activeTrip.id,
      })

      setRouteIndex(0)
      setTracking(true)
      setAutoAccepted(true)
      autoAcceptedRef.current = true
      await loadData()
    })
  }

  // Automatically accept pending assignment and launch GPS tracking
  useEffect(() => {
    if (activeTrip && activeTrip.status === 'pending' && !autoAcceptedRef.current) {
      autoAcceptedRef.current = true
      acceptAssignment()
    }
  }, [activeTrip, acceptAssignment])

  const rejectAssignment = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.available, async () => {
      await supabase
        .from('ambulance_trips')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', activeTrip.id)

      setTracking(false)
      await loadData()
    })
  }


  const pickUpPatient = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.enRouteHospital, async () => {
      setLoading(true)
      const routeData = routeDataFor(activeTrip)
      const pickupLat = activeTrip.source_lat ?? 12.9352
      const pickupLng = activeTrip.source_lng ?? 77.6245
      const destLat = activeTrip.dest_lat ?? pickupLat
      const destLng = activeTrip.dest_lng ?? pickupLng

      const calculatedRoute = await calculateSmartRoute({
        source: [pickupLat, pickupLng],
        destination: [destLat, destLng],
        trafficLevel: simulationState.trafficLevel,
      })

      const payload = {
        ...calculatedRoute,
        phase: 'en_route_to_hospital',
        status: TRIP_WORKFLOW_STATUS.enRouteHospital,
        priority: routeData?.priority || 'critical',
        patientName: routeData?.patientName,
        patientNotes: routeData?.patientNotes,
        patientAge: routeData?.patientAge,
        emergencyType: routeData?.emergencyType,
      }

      await supabase
        .from('ambulance_trips')
        .update({
          route_data: payload,
          eta: calculatedRoute.estimatedTime,
          distance: calculatedRoute.totalDistance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTrip.id)

      await upsertPoliceAlert(supabase, activeTrip, {
        alert_type: 'route_assessment',
        alert_status: 'pending',
        message: `Ambulance ${activeTrip.ambulance_id} en route to hospital with patient. Route: ${activeTrip.source} → ${activeTrip.destination}. ETA: ${calculatedRoute.estimatedTime} min.`,
      })

      await broadcastTripNotification(supabase, {
        event_type: 'patient_onboard',
        driver_id: profile?.id,
        pickup: activeTrip.source,
        destination: activeTrip.destination,
        priority: routeData?.priority || 'critical',
        ambulanceId: activeTrip.ambulance_id,
        eta: calculatedRoute.estimatedTime,
        trip_id: activeTrip.id,
      })

      setRouteIndex(0)
      setTracking(true)
      setArrivedAtPickup(false)
      await loadData()
    })
  }

  const completeTrip = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.completed, async () => {
      const completionTime = new Date().toISOString()
      
      await supabase
        .from('ambulance_trips')
        .update({ 
          status: 'completed', 
          route_condition: 'clear',
          updated_at: completionTime,
          route_data: {
            ...(routeDataFor(activeTrip) ?? {}),
            completedAt: completionTime,
            status: TRIP_WORKFLOW_STATUS.completed,
            clearanceStatus: 'cleared',
            routeState: 'CLEARED',
          },
        })
        .eq('id', activeTrip.id)

      // Broadcast notification to all dashboards
      await broadcastTripNotification(supabase, {
        event_type: 'trip_completed',
        driver_id: profile?.id,
        pickup: activeTrip.source,
        destination: activeTrip.destination,
        priority: routeDataFor(activeTrip)?.priority || 'critical',
        ambulanceId: activeTrip.ambulance_id,
        trip_id: activeTrip.id,
      })

      await resolvePoliceAlerts(
        supabase,
        activeTrip.id,
        'Trip completed. Police alert closed automatically.',
      )

      setTracking(false)
      await loadData()
    })
  }

  // Simulation control handlers
  const handleSetRouteClear = async () => {
    if (!activeTrip) return
    await updateTripRouteState({
      route_condition: 'clear',
      route_data: {
        ...(routeDataFor(activeTrip) ?? {}),
        routeState: 'NORMAL',
        clearanceStatus: 'cleared',
      },
    })
    
    await upsertPoliceAlert(supabase, activeTrip, {
      alert_type: 'route_assessment',
      alert_status: 'pending',
      message: `Ambulance ${activeTrip.ambulance_id} route condition: CLEAR. Traffic cleared, proceeding normally.`,
    })
    
    pushNotification('Route condition set to: Clear', 'success')
  }

  const handleSetRouteBlocked = async () => {
    if (!activeTrip) return
    await updateTripRouteState({
      route_condition: 'road_blocked',
      route_data: {
        ...(routeDataFor(activeTrip) ?? {}),
        routeState: 'ROADBLOCK_DETECTED',
        clearanceStatus: 'pending',
      },
    })
    
    await upsertPoliceAlert(supabase, activeTrip, {
      alert_type: 'traffic',
      alert_status: 'pending',
      message: `URGENT: Ambulance ${activeTrip.ambulance_id} route BLOCKED. Immediate police intervention required. Location: ${activeTrip.source} → ${activeTrip.destination}.`,
    })
    
    // Broadcast to all dashboards
    await broadcastTripNotification(supabase, {
      event_type: 'driver_accepted',
      driver_id: profile?.id,
      pickup: activeTrip.source,
      destination: activeTrip.destination,
      priority: routeDataFor(activeTrip)?.priority || 'critical',
      ambulanceId: activeTrip.ambulance_id,
      eta: activeTrip.eta,
      trip_id: activeTrip.id,
    })
    
    pushNotification('Route condition set to: Road Blocked', 'warning')
  }

  const handleSetMediumTraffic = async () => {
    if (!activeTrip) return
    await updateTripRouteState({
      route_condition: 'moderate_traffic',
      route_data: {
        ...(routeDataFor(activeTrip) ?? {}),
        routeState: 'CONGESTION_DETECTED',
        clearanceStatus: 'pending',
      },
    })
    
    await upsertPoliceAlert(supabase, activeTrip, {
      alert_type: 'traffic',
      alert_status: 'pending',
      message: `Ambulance ${activeTrip.ambulance_id} route condition: MODERATE TRAFFIC. Traffic management advised. Route: ${activeTrip.source} → ${activeTrip.destination}.`,
    })
    
    // Broadcast to all dashboards
    await broadcastTripNotification(supabase, {
      event_type: 'driver_accepted',
      driver_id: profile?.id,
      pickup: activeTrip.source,
      destination: activeTrip.destination,
      priority: routeDataFor(activeTrip)?.priority || 'critical',
      ambulanceId: activeTrip.ambulance_id,
      eta: activeTrip.eta,
      trip_id: activeTrip.id,
    })
    
    pushNotification('Route condition set to: Moderate Traffic', 'warning')
  }

  const handleSetHeavyTraffic = async () => {
    if (!activeTrip) return
    await updateTripRouteState({
      route_condition: 'heavy_congestion',
      route_data: {
        ...(routeDataFor(activeTrip) ?? {}),
        routeState: 'CONGESTION_DETECTED',
        clearanceStatus: 'pending',
      },
    })
    
    await upsertPoliceAlert(supabase, activeTrip, {
      alert_type: 'traffic',
      alert_status: 'pending',
      message: `URGENT: Ambulance ${activeTrip.ambulance_id} route condition: HEAVY CONGESTION. Traffic clearance required. Route: ${activeTrip.source} → ${activeTrip.destination}.`,
    })
    
    // Broadcast to all dashboards
    await broadcastTripNotification(supabase, {
      event_type: 'driver_accepted',
      driver_id: profile?.id,
      pickup: activeTrip.source,
      destination: activeTrip.destination,
      priority: routeDataFor(activeTrip)?.priority || 'critical',
      ambulanceId: activeTrip.ambulance_id,
      eta: activeTrip.eta,
      trip_id: activeTrip.id,
    })
    
    pushNotification('Route condition set to: Heavy Congestion', 'warning')
  }

  const handleToggleOffline = () => {
    setSimulationState((prev) => {
      const newState = !prev.isOffline
      pushNotification(newState ? 'Offline mode activated' : 'Online mode restored', newState ? 'error' : 'success')
      return { ...prev, isOffline: newState }
    })
  }

  const handleAddAmbulance = () => {
    if (!activeTrip) return
    const routeData = routeDataFor(activeTrip)
    const waypoints = routeData?.waypoints ?? []
    if (waypoints.length === 0) return

    const randomWaypointIndex = Math.floor(Math.random() * waypoints.length)
    const [lat, lng] = waypoints[randomWaypointIndex]
    const newAmbulance = {
      lat,
      lng,
      id: crypto.randomUUID(),
      ambulanceId: `AMB-${Math.floor(Math.random() * 9000) + 1000}`,
    }

    setSimulationState((prev) => ({
      ...prev,
      spawnedVehicles: [...prev.spawnedVehicles, newAmbulance],
    }))

    pushNotification(`Added ambulance ${newAmbulance.ambulanceId} to route`, 'info')
  }

  const handleRoadblockAdd = async (lat: number, lng: number) => {
    const id = crypto.randomUUID()
    const newRoadblock = { lat, lng, id }
    setSimulationState((current) => ({ ...current, roadblocks: [...current.roadblocks, newRoadblock] }))

    const trip = activeTripRef.current
    if (trip && trip.status === 'in_progress') {
      const routeData = routeDataFor(trip)
      const targetLat = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lat ?? trip.dest_lat) : trip.dest_lat
      const targetLng = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lng ?? trip.dest_lng) : trip.dest_lng

      if (!targetLat || !targetLng) return

      const routeRes = await calculateSmartRoute({
        source: [trip.current_lat ?? lat, trip.current_lng ?? lng],
        destination: [targetLat, targetLng],
        avoidPoints: [...simulationState.roadblocks, newRoadblock],
        trafficLevel: simulationState.trafficLevel,
      })

      await updateTripRouteState({
        route_condition: 'road_blocked',
        route_data: {
          ...routeRes,
          status: normalizeTripWorkflowStatus(routeData?.status || TRIP_WORKFLOW_STATUS.goingToPickup),
          priority: routeData?.priority || 'critical',
          roadblocks: [...simulationState.roadblocks, newRoadblock],
        },
        eta: routeRes.estimatedTime,
        distance: routeRes.totalDistance,
      })
    }
  }

  const routeData = useMemo(() => routeDataFor(activeTrip), [activeTrip])
  const etaDelay = routeData?.etaDelay ?? 0
  const routeState = routeData?.routeState ?? 'NORMAL'
  const clearanceStatus = (routeData?.clearanceStatus as ClearanceStatus | undefined) ??
    (activeTrip?.route_condition === 'heavy_congestion' || activeTrip?.route_condition === 'road_blocked' || routeState === 'WAITING_FOR_POLICE_RESPONSE'
      ? 'pending'
      : 'cleared')

  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') return
    const routeData = routeDataFor(activeTrip)
    const currentLifecycle = normalizeTripWorkflowStatus(routeData?.status || TRIP_WORKFLOW_STATUS.assigned)
    const waypoints = routeData?.waypoints ?? []

    if (currentLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup && waypoints.length > 1) {
      const remainingDistance = routeRemainingDistance(waypoints, routeIndex)
      const threshold = Math.max(0.02, (routeData?.totalDistance ?? 1) * 0.07)
      setArrivedAtPickup(remainingDistance <= threshold)
    } else {
      setArrivedAtPickup(false)
    }

    return () => {
      if (pickupOnboardTimerRef.current) {
        window.clearTimeout(pickupOnboardTimerRef.current)
        pickupOnboardTimerRef.current = null
      }
    }
  }, [activeTrip, routeIndex])

  // Speed simulator
  const currentSpeed = activeTrip?.status === 'in_progress' && tracking
    ? simulationState.trafficLevel === 'low'
      ? 32 + Math.floor(Math.sin(routeIndex * 1.2) * 4)
      : simulationState.trafficLevel === 'medium'
        ? 24 + Math.floor(Math.sin(routeIndex * 1.6) * 3)
        : 14 + Math.floor(Math.sin(routeIndex * 2.2) * 2)
    : 0

  const currentRoad = useMemo(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') return 'No active route'
    const routeData = routeDataFor(activeTrip)
    const waypoints = routeData?.waypoints ?? []
    if (waypoints.length === 0) return 'Primary Transit Road'
    const progress = routeIndex / waypoints.length
    if (progress < 0.25) return 'Initial Outbound Lane'
    if (progress < 0.7) return 'Emergency Priority Arterial'
    return 'Hospital Entry Approach'
  }, [activeTrip, routeIndex])

  const nextNavStep = useMemo(() => {
    if (!activeTrip) return 'Awaiting dispatch assignment.'
    const rData = routeDataFor(activeTrip)
    const lifecycleStatus = normalizeTripWorkflowStatus(rData?.status || TRIP_WORKFLOW_STATUS.assigned)

    if (activeTrip.status === 'pending') {
      return `Assignment received: ${lifecycleStatus}. Please confirm deploy.`
    }
    if (activeTrip.status === 'completed') return 'Mission completed. Returning to standby.'
    
    if (lifecycleStatus === TRIP_WORKFLOW_STATUS.accepted) return 'Assignment accepted. Ready for outbound deployment.'
    if (lifecycleStatus === TRIP_WORKFLOW_STATUS.goingToPickup) {
      return arrivedAtPickup 
        ? 'Arrived at pickup. Patient ready for boarding.'
        : 'Proceed immediately to pickup location. GPS navigation active.'
    }
    if (lifecycleStatus === TRIP_WORKFLOW_STATUS.patientOnboard) return 'Patient inside responder cabinet. Prepare hospital transit.'
    return 'Patient on board. Navigate to target hospital preemption dock.'
  }, [activeTrip])

  if (loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-[#060e1a]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading control room…</p>
        </div>
      </div>
    )
  }

  const trueLifecycle = normalizeTripWorkflowStatus(routeData?.status || (activeTrip ? TRIP_WORKFLOW_STATUS.assigned : TRIP_WORKFLOW_STATUS.available))
  const patientName = routeData?.patientName || routeData?.patient_name || null
  const patientNotes = routeData?.patientNotes || routeData?.notes || null
  const driverStatus = activeTrip
    ? trueLifecycle === TRIP_WORKFLOW_STATUS.assigned
      ? 'Assignment pending'
      : tracking
        ? 'Navigating'
        : 'On assignment'
    : 'Available'

  const primaryAction = (() => {
    if (!activeTrip) return null
    if (trueLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup && arrivedAtPickup) {
      return { label: 'Patient Onboard', onClick: pickUpPatient, icon: UserCheck }
    }
    if (trueLifecycle === TRIP_WORKFLOW_STATUS.enRouteHospital) {
      return { label: 'Complete Trip', onClick: completeTrip, icon: Check }
    }
    return null
  })()

  return (
    <div className="relative flex min-h-full flex-col bg-[#060e1a] text-foreground">
      <div className="fixed right-4 top-4 z-50 flex w-[340px] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              className="rounded-2xl border border-emergency/25 bg-[#081222]/95 p-4 shadow-2xl backdrop-blur"
            >
              <p className="text-sm font-semibold text-foreground">{toast.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <header className="border-b border-white/10 bg-[#07111f]/80 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Control Room</h1>
            <p className="text-sm text-muted-foreground">
              {profile?.full_name ?? 'Driver'} · focused trip workspace
            </p>
          </div>
          <StatusBadge status={trueLifecycle} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 overflow-auto p-4 sm:p-6">
        {!activeTrip ? (
          <Card className="glass-card border-white/10">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Waiting for assignment</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Receive assignment → Navigate to pickup → Pick up patient → Navigate to hospital → Complete trip
              </p>
              <Button asChild className="mt-6" variant="outline">
                <Link href="/driver/new-trip">Start Manual Trip</Link>
              </Button>
            </CardContent>
          </Card>
        ) : trueLifecycle === TRIP_WORKFLOW_STATUS.assigned && !autoAccepted ? (
          <Card className="glass-card mx-auto max-w-xl border-emergency/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-emergency" />
                New Assignment
              </CardTitle>
              <CardDescription>Auto-accepting and launching the response workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Pickup</p>
                  <p className="font-medium text-foreground">{activeTrip.source}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hospital</p>
                  <p className="font-medium text-foreground">{activeTrip.destination}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Ambulance</p>
                    <p className="font-semibold text-foreground">{activeTrip.ambulance_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Distance</p>
                    <p className="font-semibold text-foreground">
                      {activeTrip.distance ? `${activeTrip.distance.toFixed(1)} km` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ETA</p>
                    <p className="font-semibold text-foreground">
                      {activeTrip.eta ? `${activeTrip.eta} min` : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground">
                Auto-starting the trip. No manual navigation input is required.
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="glass-card border-white/10">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Driver Status</p>
                  <p className="mt-1 font-semibold text-foreground">{driverStatus}</p>
                </CardContent>
              </Card>
              <Card className="glass-card border-white/10">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Assigned Ambulance</p>
                  <p className="mt-1 font-semibold text-foreground">{activeTrip.ambulance_id}</p>
                </CardContent>
              </Card>
              <Card className="glass-card border-white/10">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Current Assignment</p>
                  <p className="mt-1 truncate font-semibold text-foreground">{activeTrip.destination}</p>
                </CardContent>
              </Card>
              <Card className="glass-card border-white/10">
                <CardContent className="flex items-center justify-between gap-2 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Trip Status</p>
                    <p className="mt-1 font-semibold text-foreground">{trueLifecycle}</p>
                  </div>
                  <StatusBadge status={trueLifecycle} />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
              <Card className="glass-card overflow-hidden border-white/10">
                <CardHeader className="border-b border-white/10 py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Map className="h-4 w-4 text-primary" />
                      Navigation Map
                    </CardTitle>
                    {simulationState.isOffline && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emergency/30 bg-emergency/10 px-2.5 py-1 text-xs font-semibold text-emergency">
                        <WifiOff className="h-3 w-3" />
                        OFFLINE
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="font-semibold text-primary">
                      {trueLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup
                        ? 'Navigating to Pickup'
                        : trueLifecycle === TRIP_WORKFLOW_STATUS.enRouteHospital
                          ? 'Transporting Patient to Hospital'
                          : trueLifecycle === TRIP_WORKFLOW_STATUS.patientOnboard
                            ? 'Patient onboard. Hospital route active.'
                            : activeTrip.status === 'completed'
                              ? 'Trip completed. Waiting for next assignment.'
                              : 'Awaiting next dispatch'}
                    </span>
                    <span className="text-muted-foreground">
                      ·
                    </span>
                    <span className="text-muted-foreground">
                      ETA {activeTrip.eta != null ? `${activeTrip.eta} min` : '—'}
                      {etaDelay > 0 ? ` (+${etaDelay} delay)` : ''}
                    </span>
                  </div>
                  <CardDescription className="mt-1">
                    {trueLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup
                      ? `Route: ${activeTrip.ambulance_id} → ${activeTrip.source}`
                      : trueLifecycle === TRIP_WORKFLOW_STATUS.enRouteHospital
                        ? `Route: ${activeTrip.source} → ${activeTrip.destination}`
                        : 'Awaiting assignment'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3">
                  <AmbulanceMap
                    trips={[activeTrip]}
                    selectedTrip={activeTrip}
                    showAllTrips={false}
                    trafficLevel={simulationState.trafficLevel}
                    roadblockMode={simulationState.roadblockMode}
                    roadblocks={simulationState.roadblocks}
                    spawnedVehicles={simulationState.spawnedVehicles}
                    onRoadblockAdd={handleRoadblockAdd}
                    showTrafficCircles
                    className="h-[380px] rounded-xl border border-white/10 sm:h-[460px]"
                  />
                </CardContent>
              </Card>

              <Card className="glass-card border-white/10">
                <CardHeader className="border-b border-white/10 py-3">
                  <CardTitle className="text-base">Trip Actions</CardTitle>
                  <CardDescription>{nextNavStep}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs text-muted-foreground">ETA</p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {activeTrip.eta != null ? `${activeTrip.eta} min` : '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs text-muted-foreground">Speed</p>
                      <p className="mt-1 text-lg font-bold text-foreground">{currentSpeed} km/h</p>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Button
                      onClick={pickUpPatient}
                      variant="outline"
                      className="w-full"
                      disabled={
                        !activeTrip ||
                        trueLifecycle === TRIP_WORKFLOW_STATUS.enRouteHospital ||
                        activeTrip.status !== 'in_progress'
                      }
                    >
                      Patient Onboard
                    </Button>
                    <Button
                      onClick={completeTrip}
                      variant="outline"
                      className="w-full"
                      disabled={
                        !activeTrip ||
                        activeTrip.status !== 'in_progress'
                      }
                    >
                      Trip Completed
                    </Button>
                  </div>

                  {primaryAction && (
                    <Button onClick={primaryAction.onClick} className="w-full bg-emergency text-white hover:bg-emergency/90">
                      {(() => {
                        const ActionIcon = primaryAction.icon
                        return <ActionIcon className="mr-2 h-4 w-4" />
                      })()}
                      {primaryAction.label}
                    </Button>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setTracking(!tracking)}
                      variant="outline"
                      className="flex-1"
                      disabled={
                        trueLifecycle === TRIP_WORKFLOW_STATUS.accepted ||
                        trueLifecycle === TRIP_WORKFLOW_STATUS.patientOnboard
                      }
                    >
                      {tracking ? 'Pause GPS' : 'Resume GPS'}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">
                    <p>
                      Road condition:{' '}
                      <span className="font-medium capitalize text-foreground">
                        {activeTrip.route_condition.replaceAll('_', ' ')}
                      </span>
                    </p>
                    <p className="mt-1">
                      Clearance:{' '}
                      <span className="font-medium capitalize text-foreground">{clearanceStatus}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="glass-card border-white/10">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Simulation Controls</CardTitle>
                <CardDescription>Test route conditions and offline mode</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Route Status</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-success/30 text-success hover:bg-success/10"
                      onClick={handleSetRouteClear}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-warning/30 text-warning hover:bg-warning/10"
                      onClick={handleSetMediumTraffic}
                    >
                      Medium
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emergency/30 text-emergency hover:bg-emergency/10"
                      onClick={handleSetHeavyTraffic}
                    >
                      Heavy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={handleSetRouteBlocked}
                    >
                      Blocked
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant={simulationState.isOffline ? 'default' : 'outline'}
                      className={simulationState.isOffline ? 'bg-emergency text-white hover:bg-emergency/90' : 'border-white/10'}
                      onClick={handleToggleOffline}
                    >
                      {simulationState.isOffline ? 'Online' : 'Offline'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-primary/30 text-primary hover:bg-primary/10"
                      onClick={handleAddAmbulance}
                    >
                      + Ambulance
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-white/10">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Emergency Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-emergency" />
                    Pickup Location
                  </div>
                  <p className="text-sm font-medium text-foreground">{activeTrip.source}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Hospital className="h-3.5 w-3.5 text-success" />
                    Destination Hospital
                  </div>
                  <p className="text-sm font-medium text-foreground">{activeTrip.destination}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <UserCheck className="h-3.5 w-3.5 text-primary" />
                    Patient Name
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {patientName ?? 'Not provided'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield className="h-3.5 w-3.5 text-warning" />
                    Priority
                  </div>
                  <p className="text-sm font-medium text-foreground capitalize">
                    {routeData?.priority || 'critical'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Patient Age
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {routeData?.patientAge ?? 'Not provided'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5 text-emergency" />
                    Emergency Type
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {routeData?.emergencyType ?? 'Not provided'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Navigation className="h-3.5 w-3.5 text-primary" />
                    Incident ID
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {activeTrip.emergency_id ?? 'Not provided'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Compass className="h-3.5 w-3.5 text-warning" />
                    Current Road
                  </div>
                  <p className="text-sm font-medium text-foreground">{currentRoad}</p>
                </div>
                {patientNotes && (
                  <div className="col-span-full rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <UserCheck className="h-3.5 w-3.5 text-primary" />
                      Patient Notes
                    </div>
                    <p className="text-sm text-foreground">{String(patientNotes)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
