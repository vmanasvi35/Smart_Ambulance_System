'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { broadcastTripNotification } from '@/lib/notifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AmbulanceMap } from '@/components/ambulance-map'
import { StatusBadge } from '@/components/status-badge'
import {
  calculateSmartRoute,
  conditionForTrafficLevel,
  speedForTrafficLevel,
  trafficLabel,
  type SmartRouteData,
} from '@/lib/routing'
import {
  Activity,
  AlertTriangle,
  Clock,
  MapPin,
  Navigation,
  Play,
  RefreshCw,
  Route,
  Square,
  WifiOff,
  Wifi,
  Shield,
  Compass,
  CheckCircle,
  AlertCircle,
  Hospital,
  Bell,
  Sliders,
  ChevronRight,
  Gauge,
  Map,
  XCircle,
  Check,
  UserCheck
} from 'lucide-react'
import type { AmbulanceTrip, ClearanceStatus, PoliceDecision, Profile, RouteCondition, RouteState, TrafficLevel, TripWorkflowStatus } from '@/lib/types'
import { TRIP_WORKFLOW_STATUS, normalizeTripWorkflowStatus } from '@/lib/trip-status'

const rerouteDecisions: PoliceDecision[] = ['REROUTE_REQUIRED', 'ROAD_BLOCK_CONFIRMED']

// Valid Lifecycle Transitions mapping
const VALID_TRANSITIONS: Record<string, string[]> = {
  [TRIP_WORKFLOW_STATUS.available]: [TRIP_WORKFLOW_STATUS.assigned],
  [TRIP_WORKFLOW_STATUS.assigned]: [TRIP_WORKFLOW_STATUS.accepted, TRIP_WORKFLOW_STATUS.available],
  [TRIP_WORKFLOW_STATUS.accepted]: [TRIP_WORKFLOW_STATUS.goingToPickup],
  [TRIP_WORKFLOW_STATUS.goingToPickup]: [TRIP_WORKFLOW_STATUS.patientOnboard],
  [TRIP_WORKFLOW_STATUS.patientOnboard]: [TRIP_WORKFLOW_STATUS.enRouteHospital],
  [TRIP_WORKFLOW_STATUS.enRouteHospital]: [TRIP_WORKFLOW_STATUS.completed],
  [TRIP_WORKFLOW_STATUS.completed]: [TRIP_WORKFLOW_STATUS.available],
}

function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from] || []
  return allowed.includes(to)
}

function routeDataFor(trip: AmbulanceTrip | null): any {
  return trip?.route_data ?? null
}

function affectedRoadFor(trip: AmbulanceTrip) {
  return `${trip.source} to ${trip.destination}`
}

function stateForIssue(condition: RouteCondition): RouteState {
  return condition === 'road_blocked' ? 'ROADBLOCK_DETECTED' : 'CONGESTION_DETECTED'
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
  const [lowSpeedTicks, setLowSpeedTicks] = useState(0)

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
  const supabase = createClient()

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

    setActiveTrip(tripData)
    
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

      if (existingAlert) return

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

      await supabase.from('police_alerts').insert({
        trip_id: trip.id,
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
    if (!activeTrip || activeTrip.status !== 'in_progress' || !tracking || simulationState.isOffline) return

    const timer = window.setInterval(async () => {
      const trip = activeTripRef.current
      const routeData = routeDataFor(trip)
      const waypoints = routeData?.waypoints ?? []
      if (!trip || waypoints.length === 0) return

      setRouteIndex((current) => {
        const nextIndex = Math.min(current + 1, waypoints.length - 1)
        const [lat, lng] = waypoints[nextIndex]
        const remainingRatio = Math.max(0, (waypoints.length - nextIndex) / waypoints.length)
        const baseEta = Math.max(1, Math.round((routeData?.baseEta ?? trip.eta ?? 1) * remainingRatio))
        const delay = routeData?.etaDelay ?? 0
        const speed = speedForTrafficLevel(simulationState.trafficLevel)

        supabase
          .from('ambulance_trips')
          .update({
            current_lat: lat,
            current_lng: lng,
            eta: Math.max(1, baseEta + delay),
            updated_at: new Date().toISOString(),
          })
          .eq('id', trip.id)
          .then(() => {
            if (speed < 12) setLowSpeedTicks((ticks) => ticks + 1)
            else setLowSpeedTicks(0)
          })

        return nextIndex
      })
    }, 2200)

    return () => window.clearInterval(timer)
  }, [activeTrip, simulationState.isOffline, simulationState.trafficLevel, supabase, tracking])

  // Speed screening alert trigger
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') return
    if (lowSpeedTicks < 3) return

    const routeData = routeDataFor(activeTrip)
    const etaDelay = routeData?.etaDelay ?? 12
    updateTripRouteState({ route_condition: 'heavy_congestion' })
    createAutomaticAlert('heavy_congestion', etaDelay, 'Heavy Congestion')
  }, [activeTrip, createAutomaticAlert, lowSpeedTicks, updateTripRouteState])

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

    await executeTransition(TRIP_WORKFLOW_STATUS.accepted, async () => {
      setLoading(true)
      const routeData = routeDataFor(activeTrip)

      await supabase
        .from('ambulance_trips')
        .update({
          route_data: {
            ...(routeData ?? {}),
            status: TRIP_WORKFLOW_STATUS.accepted,
          },
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
        eta: activeTrip.eta,
        trip_id: activeTrip.id,
      })

      await loadData()
    })
  }

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

  const startOutboundJourney = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.goingToPickup, async () => {
      setLoading(true)
      const startLat = activeTrip.current_lat ?? 12.9352
      const startLng = activeTrip.current_lng ?? 77.6245
      const pickupLat = activeTrip.source_lat ?? startLat
      const pickupLng = activeTrip.source_lng ?? startLng

      const routeData = await calculateSmartRoute({
        source: [startLat, startLng],
        destination: [pickupLat, pickupLng],
        trafficLevel: simulationState.trafficLevel,
      })

      const existingRouteData = routeDataFor(activeTrip)
      const payload = {
        ...routeData,
        phase: 'en_route_to_pickup',
        status: TRIP_WORKFLOW_STATUS.goingToPickup,
        priority: existingRouteData?.priority || 'critical',
      }

      await supabase
        .from('ambulance_trips')
        .update({
          status: 'in_progress',
          route_condition: 'clear',
          route_data: payload,
          eta: routeData.estimatedTime,
          distance: routeData.totalDistance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTrip.id)

      setRouteIndex(0)
      setTracking(true)
      await loadData()
    })
  }

  const pickUpPatient = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.patientOnboard, async () => {
      setLoading(true)
      const routeData = routeDataFor(activeTrip)

      await supabase
        .from('ambulance_trips')
        .update({
          route_data: {
            ...(routeData ?? {}),
            status: TRIP_WORKFLOW_STATUS.patientOnboard,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTrip.id)

      setTracking(false)
      await loadData()
    })
  }

  const startHospitalJourney = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.enRouteHospital, async () => {
      setLoading(true)
      const pickupLat = activeTrip.source_lat ?? 12.9352
      const pickupLng = activeTrip.source_lng ?? 77.6245
      const destLat = activeTrip.dest_lat ?? pickupLat
      const destLng = activeTrip.dest_lng ?? pickupLng

      const routeData = await calculateSmartRoute({
        source: [pickupLat, pickupLng],
        destination: [destLat, destLng],
        trafficLevel: simulationState.trafficLevel,
      })

      const existingRouteData = routeDataFor(activeTrip)
      const payload = {
        ...routeData,
        phase: 'en_route_to_hospital',
        status: TRIP_WORKFLOW_STATUS.enRouteHospital,
        priority: existingRouteData?.priority || 'critical',
      }

      await supabase
        .from('ambulance_trips')
        .update({
          route_data: payload,
          eta: routeData.estimatedTime,
          distance: routeData.totalDistance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTrip.id)

      setRouteIndex(0)
      setTracking(true)
      await loadData()
    })
  }

  const completeTrip = async () => {
    if (!activeTrip) return

    await executeTransition(TRIP_WORKFLOW_STATUS.completed, async () => {
      await supabase
        .from('ambulance_trips')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', activeTrip.id)

      setTracking(false)
      await loadData()
    })
  }

  const handleManualReroute = async () => {
    const reason = activeTrip?.route_condition === 'road_blocked' ? 'road_blocked' : 'heavy_congestion'
    await rerouteTrip(reason, 'manual')
  }

  const handleTrafficChange = async (level: TrafficLevel) => {
    setSimulationState((current) => ({ ...current, trafficLevel: level }))
    const trip = activeTripRef.current
    if (trip && trip.status === 'in_progress') {
      const routeData = routeDataFor(trip)
      const startLat = trip.current_lat ?? 12.9352
      const startLng = trip.current_lng ?? 77.6245
      const targetLat = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lat ?? trip.dest_lat) : trip.dest_lat
      const targetLng = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lng ?? trip.dest_lng) : trip.dest_lng

      if (!targetLat || !targetLng) return

      const routeRes = await calculateSmartRoute({
        source: [startLat, startLng],
        destination: [targetLat, targetLng],
        avoidPoints: simulationState.roadblocks,
        trafficLevel: level,
      })

      await updateTripRouteState({
        route_data: {
          ...routeRes,
          status: normalizeTripWorkflowStatus(routeData?.status || TRIP_WORKFLOW_STATUS.goingToPickup),
          priority: routeData?.priority || 'critical',
        },
        eta: routeRes.estimatedTime,
        distance: routeRes.totalDistance,
      })
    }
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

  const clearRoadblocks = async () => {
    setSimulationState((current) => ({ ...current, roadblocks: [] }))
    const trip = activeTripRef.current
    if (trip && trip.status === 'in_progress') {
      const routeData = routeDataFor(trip)
      const targetLat = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lat ?? trip.dest_lat) : trip.dest_lat
      const targetLng = normalizeTripWorkflowStatus(routeData?.status) === TRIP_WORKFLOW_STATUS.goingToPickup ? (trip.source_lng ?? trip.dest_lng) : trip.dest_lng

      if (!targetLat || !targetLng) return

      const routeRes = await calculateSmartRoute({
        source: [trip.current_lat ?? 12.9352, trip.current_lng ?? 77.6245],
        destination: [targetLat, targetLng],
        avoidPoints: [],
        trafficLevel: simulationState.trafficLevel,
      })

      await updateTripRouteState({
        route_condition: 'clear',
        route_data: {
          ...routeRes,
          status: normalizeTripWorkflowStatus(routeData?.status || TRIP_WORKFLOW_STATUS.goingToPickup),
          priority: routeData?.priority || 'critical',
          roadblocks: [],
        },
        eta: routeRes.estimatedTime,
        distance: routeRes.totalDistance,
      })
    }
  }

  const handleSpawnVehicle = () => {
    const trip = activeTripRef.current
    if (!trip) return
    const id = crypto.randomUUID()
    const newVehicle = {
      lat: (trip.current_lat ?? 12.9352) + (Math.random() - 0.5) * 0.005,
      lng: (trip.current_lng ?? 77.6245) + (Math.random() - 0.5) * 0.005,
      id,
      ambulanceId: 'SIM-VEHICLE',
    }

    setSimulationState((current) => ({ ...current, spawnedVehicles: [...current.spawnedVehicles, newVehicle] }))
  }

  const clearVehicles = async () => {
    setSimulationState((current) => ({ ...current, spawnedVehicles: [] }))
  }

  const handleNetworkToggle = (offline: boolean) => {
    setSimulationState((current) => ({ ...current, isOffline: offline }))
  }

  const routeData = useMemo(() => routeDataFor(activeTrip), [activeTrip])
  const etaDelay = routeData?.etaDelay ?? 0
  const routeState = routeData?.routeState ?? 'NORMAL'
  const clearanceStatus = (routeData?.clearanceStatus as ClearanceStatus | undefined) ??
    (activeTrip?.route_condition === 'heavy_congestion' || activeTrip?.route_condition === 'road_blocked' || routeState === 'WAITING_FOR_POLICE_RESPONSE'
      ? 'pending'
      : 'cleared')

  // Speed simulator
  const currentSpeed = activeTrip?.status === 'in_progress' && tracking
    ? simulationState.trafficLevel === 'low'
      ? 78 + Math.floor(Math.sin(routeIndex) * 4)
      : simulationState.trafficLevel === 'medium'
        ? 42 + Math.floor(Math.sin(routeIndex) * 3)
        : 11 + Math.floor(Math.sin(routeIndex) * 2)
    : 0

  const currentRoad = useMemo(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') return 'Standby Corridor'
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
    if (activeTrip.status === 'completed') return 'Mission completed. Standby at bay.'
    
    if (lifecycleStatus === TRIP_WORKFLOW_STATUS.accepted) return 'Assignment accepted. Ready for outbound deployment.'
    if (lifecycleStatus === TRIP_WORKFLOW_STATUS.goingToPickup) {
      return 'Proceed immediately to pickup location. GPS navigation active.'
    }
    if (lifecycleStatus === TRIP_WORKFLOW_STATUS.patientOnboard) return 'Patient inside responder cabinet. Prepare hospital transit.'
    return 'Patient on board. Navigate to target hospital preemption dock.'
  }, [activeTrip])

  if (loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-[#060e1a]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-red-500" />
          <p className="text-sm font-semibold tracking-wider text-muted-foreground/80 uppercase">
            Initializing Telemetry Console…
          </p>
        </div>
      </div>
    )
  }

  const trueLifecycle = normalizeTripWorkflowStatus(routeData?.status || (activeTrip ? TRIP_WORKFLOW_STATUS.assigned : TRIP_WORKFLOW_STATUS.available))

  return (
    <div className="relative flex h-full flex-col bg-[#050b14] text-slate-100 font-sans min-h-screen">
      <div className="fixed right-4 top-4 z-50 flex w-[360px] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              className="rounded-2xl border border-red-500/20 bg-[#081222]/95 p-4 shadow-2xl backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{toast.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{toast.message}</p>
                  <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                    <p>Pickup: <span className="font-semibold text-slate-200">{toast.pickup}</span></p>
                    <p>Destination: <span className="font-semibold text-slate-200">{toast.destination}</span></p>
                    <p>Priority: <span className="font-semibold text-slate-200">{toast.priority}</span></p>
                    <p>Ambulance: <span className="font-semibold text-slate-200">{toast.ambulanceId}</span></p>
                    <p>ETA: <span className="font-semibold text-slate-200">{toast.eta ? `${toast.eta} min` : 'Pending'}</span></p>
                  </div>
                </div>
                <div className="rounded-full bg-red-500/15 p-2 text-red-400">
                  <Bell className="h-4 w-4" />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Header */}
      <header className="border-b border-white/10 bg-[#081222]/90 px-6 py-4 backdrop-blur-xl font-medium">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600"></span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Emergency Dispatch Console
                <span className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/20">
                  RESPONDER MODE
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Operator: <span className="font-semibold text-slate-200">{profile?.full_name ?? 'Active Unit'}</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {activeTrip ? (
          <div className="space-y-6 max-w-[1600px] mx-auto">
            
            {/* If assigned and pending acceptance */}
            {trueLifecycle === TRIP_WORKFLOW_STATUS.assigned && (
              <div className="max-w-xl mx-auto">
                <Card className="bg-[#0a1628]/60 border border-red-500/30 shadow-2xl rounded-2xl overflow-hidden relative">
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-600 animate-pulse" />
                  <CardHeader className="p-6 pb-2">
                    <CardTitle className="text-lg font-extrabold text-white flex items-center gap-2">
                      <Shield className="h-5 w-5 text-red-500 animate-bounce" />
                      NEW EMERGENCY DISPATCH ASSIGNMENT
                    </CardTitle>
                    <CardDescription className="text-xs text-red-400/80 font-bold uppercase tracking-wider">
                      Incident Code: REQ-{activeTrip.id}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 pt-2 space-y-4">
                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3.5 text-sm text-slate-300">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pickup Point</p>
                          <p className="font-semibold text-slate-200 mt-0.5">{activeTrip.source}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2">
                        <Hospital className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Destination Hospital</p>
                          <p className="font-semibold text-slate-200 mt-0.5">{activeTrip.destination}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3.5 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Priority</span>
                          <span className="text-red-400 font-extrabold uppercase">CRITICAL</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Distance</span>
                          <span className="text-slate-200 font-bold font-mono">{activeTrip.distance ? `${activeTrip.distance.toFixed(1)} km` : '--'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Est. ETA</span>
                          <span className="text-slate-200 font-bold font-mono">{activeTrip.eta ? `${activeTrip.eta} min` : '--'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button onClick={rejectAssignment} variant="outline" className="flex-1 rounded-xl border-white/15 text-slate-400 hover:bg-white/5">
                        <XCircle className="mr-1.5 h-4.5 w-4.5" />
                        Reject
                      </Button>
                      <Button onClick={acceptAssignment} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg">
                        <Check className="mr-1.5 h-4.5 w-4.5" />
                        Accept Assignment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* If accepted and in progress (including Accepted phase) */}
            {trueLifecycle !== 'Assigned' && (
              <>
                {/* 1. Dashboard Overview Widgets */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="relative overflow-hidden bg-[#0a1628]/60 border-white/10 hover:border-white/20 transition-all duration-300 shadow-lg group">
                    <div className="absolute right-3 top-3 h-10 w-10 text-white/5">
                      <Shield className="h-full w-full" />
                    </div>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-xl bg-red-500/10 p-2.5 text-red-400 border border-red-500/20">
                        <Activity className="h-5 w-5 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mission Phase</p>
                        <p className="text-xs font-bold text-white mt-0.5">
                          {trueLifecycle}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden bg-[#0a1628]/60 border-white/10 hover:border-white/20 transition-all duration-300 shadow-lg group">
                    <div className="absolute right-3 top-3 h-10 w-10 text-white/5">
                      <Clock className="h-full w-full" />
                    </div>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400 border border-amber-500/20">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ETA to Destination</p>
                        <p className="text-sm font-semibold text-white mt-0.5">
                          {activeTrip.eta ? `${activeTrip.eta} mins` : '--'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden bg-[#0a1628]/60 border-white/10 hover:border-white/20 transition-all duration-300 shadow-lg group">
                    <div className="absolute right-3 top-3 h-10 w-10 text-white/5">
                      <Compass className="h-full w-full" />
                    </div>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400 border border-emerald-500/20">
                        <Route className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Route obstacle</p>
                        <p className="text-sm font-semibold text-white mt-0.5 capitalize">
                          {activeTrip.route_condition.replace('_', ' ')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden bg-[#0a1628]/60 border-white/10 hover:border-white/20 transition-all duration-300 shadow-lg group">
                    <div className="absolute right-3 top-3 h-10 w-10 text-white/5">
                      <Wifi className="h-full w-full" />
                    </div>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`rounded-xl p-2.5 border ${
                        simulationState.isOffline 
                          ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {simulationState.isOffline ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GPS Link</p>
                        <p className="text-sm font-semibold text-white mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${simulationState.isOffline ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                          {simulationState.isOffline ? 'Offline (Cached)' : 'Online (Active)'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 2. Map & Dashboard Grid */}
                <div className="grid gap-6 md:grid-cols-[380px_1fr]">
                  
                  {/* Action Panel Left Column */}
                  <div className="space-y-6">
                    <Card className="bg-[#0a1628]/45 border-white/10 shadow-xl rounded-2xl relative overflow-hidden backdrop-blur-xl">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600" />
                      <CardHeader className="pb-3 border-b border-white/5">
                        <CardTitle className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                          <UserCheck className="h-4.5 w-4.5 text-emerald-500" />
                          Responder Action Center
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-400">Operational state transitions</CardDescription>
                      </CardHeader>
                      <CardContent className="p-5 space-y-4">
                        <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2 text-xs">
                          <div>
                            <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Pickup Location</span>
                            <span className="text-slate-200 font-bold">{activeTrip.source}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Destination Facility</span>
                            <span className="text-slate-200 font-bold">{activeTrip.destination}</span>
                          </div>
                        </div>

                        {trueLifecycle === 'Accepted' && (
                          <Button onClick={startOutboundJourney} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg">
                            <Navigation className="mr-2 h-4 w-4" />
                            Start Outbound Journey
                          </Button>
                        )}

                        {trueLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup && (
                          <Button onClick={pickUpPatient} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg">
                            <Check className="mr-2 h-4 w-4" />
                            Patient Onboard
                          </Button>
                        )}

                        {trueLifecycle === TRIP_WORKFLOW_STATUS.patientOnboard && (
                          <Button onClick={startHospitalJourney} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg">
                            <Navigation className="mr-2 h-4 w-4" />
                            Start Hospital Journey
                          </Button>
                        )}

                        {trueLifecycle === TRIP_WORKFLOW_STATUS.enRouteHospital && (
                          <Button onClick={completeTrip} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg">
                            <Check className="mr-2 h-4 w-4" />
                            Complete Trip
                          </Button>
                        )}

                        <div className="flex gap-2">
                          <Button 
                            onClick={() => setTracking(!tracking)} 
                            variant="outline"
                            className="flex-1 font-bold rounded-xl border-white/10 text-xs"
                            disabled={trueLifecycle === TRIP_WORKFLOW_STATUS.accepted || trueLifecycle === TRIP_WORKFLOW_STATUS.patientOnboard}
                          >
                            {tracking ? 'Pause GPS' : 'Resume GPS'}
                          </Button>
                          {routeState !== 'NORMAL' && routeState !== 'REROUTING' && (
                            <Button onClick={handleManualReroute} variant="outline" className="flex-1 font-bold rounded-xl border-red-500/20 text-red-400 text-xs">
                              Reroute
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Dynamic Notification Panel */}
                    <Card className="bg-[#0a1628]/45 border-white/10 shadow-xl rounded-2xl relative overflow-hidden backdrop-blur-xl">
                      <CardHeader className="pb-3 border-b border-white/5">
                        <CardTitle className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                          <Bell className="h-4.5 w-4.5 text-red-500" />
                          Telemetry Event Logs
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        <div className="h-[180px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                          {notifications.map((notif) => {
                            const colors = {
                              info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                              success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                              warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                              error: 'bg-red-500/10 text-red-400 border-red-500/20',
                            }
                            return (
                              <div
                                key={notif.id}
                                className={`flex items-start gap-2 p-1.5 rounded-lg border text-[11px] ${colors[notif.type]}`}
                              >
                                <span className="font-mono text-[9px] text-slate-400 mt-0.5 select-none">{notif.time}</span>
                                <span className="font-medium flex-1 text-slate-200">{notif.text}</span>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Interactive Map Column */}
                  <div className="space-y-6">
                    <Card className="bg-[#0a1628]/45 border-white/10 shadow-xl rounded-2xl overflow-hidden relative">
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
                          className="h-[460px] rounded-xl overflow-hidden border border-white/10"
                        />
                      </CardContent>
                    </Card>

                    {/* Telemetry and Simulation overrides */}
                    <div className="grid gap-6 md:grid-cols-2">
                      <Card className="bg-[#0a1628]/45 border-white/10 shadow-xl rounded-2xl backdrop-blur-xl">
                        <CardHeader className="pb-3 border-b border-white/5">
                          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                            <Gauge className="h-4.5 w-4.5 text-red-500" />
                            Tactical Telemetry
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl border border-white/5 bg-[#07101c]/60 p-3">
                            <span className="text-[10px] text-slate-400 block uppercase">Velocity</span>
                            <span className="text-base font-bold text-white mt-1 block">{currentSpeed} km/h</span>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-[#07101c]/60 p-3">
                            <span className="text-[10px] text-slate-400 block uppercase">Current Road</span>
                            <span className="text-xs font-bold text-white mt-1 block truncate">{currentRoad}</span>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-[#07101c]/60 p-3">
                            <span className="text-[10px] text-slate-400 block uppercase">Road obstacle</span>
                            <span className="text-xs font-bold text-white mt-1 block uppercase">{activeTrip.route_condition.replace('_', ' ')}</span>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-[#07101c]/60 p-3">
                            <span className="text-[10px] text-slate-400 block uppercase">Route State</span>
                            <span className="text-xs font-bold text-white mt-1 block">{routeState}</span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-[#0a1628]/45 border-white/10 shadow-xl rounded-2xl backdrop-blur-xl">
                        <CardHeader className="pb-3 border-b border-white/5">
                          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                            <Sliders className="h-4.5 w-4.5 text-red-500" />
                            Simulation Override Panel
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3 text-xs">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Traffic Level Simulator</span>
                            <div className="flex gap-2 mt-1">
                              {(['low', 'medium', 'high'] as const).map((level) => (
                                <Button
                                  key={level}
                                  size="sm"
                                  variant={simulationState.trafficLevel === level ? 'default' : 'outline'}
                                  onClick={() => handleTrafficChange(level)}
                                  className={`flex-1 font-bold rounded-lg text-[10px] h-7 ${
                                    simulationState.trafficLevel === level 
                                      ? 'bg-red-600 text-white' 
                                      : 'border-white/10 hover:bg-white/5 text-slate-200'
                                  }`}
                                >
                                  {level.toUpperCase()}
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-white/5 pt-2">
                            <span>Offline telemetry cache</span>
                            <Button
                              size="sm"
                              variant={simulationState.isOffline ? 'destructive' : 'outline'}
                              onClick={() => handleNetworkToggle(!simulationState.isOffline)}
                              className="rounded-lg h-7 text-[10px] font-bold"
                            >
                              {simulationState.isOffline ? 'Go Online' : 'Simulate Offline'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                </div>
              </>
            )}

          </div>
        ) : (
          /* Default Empty State waiting for assignment */
          <div className="max-w-md mx-auto py-24">
            <Card className="bg-[#0a1628]/60 border border-white/10 shadow-2xl rounded-2xl overflow-hidden relative backdrop-blur-md">
              <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
              <CardContent className="flex flex-col items-center justify-center p-10 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 animate-pulse">
                  <Clock className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-white tracking-tight">Waiting for Assignment</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                  No active assignment. Standby for dispatch directions from CAD command. Keep this dashboard open to synchronize telemetry automatically.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
