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
} from 'lucide-react'
import type { AmbulanceTrip, ClearanceStatus, PoliceDecision, Profile, RouteCondition, TrafficLevel } from '@/lib/types'
import { TRIP_WORKFLOW_STATUS, normalizeTripWorkflowStatus } from '@/lib/trip-status'
import {
  getStoredGpsRefreshInterval,
  GPS_REFRESH_INTERVAL_STORAGE_KEY,
  type GpsRefreshInterval,
} from '@/lib/dispatch-settings'

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
  const [gpsRefreshInterval, setGpsRefreshInterval] = useState<GpsRefreshInterval>(getStoredGpsRefreshInterval)

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
    if (trueLifecycle === TRIP_WORKFLOW_STATUS.accepted) {
      return { label: 'Navigate to Pickup', onClick: startOutboundJourney, icon: Navigation }
    }
    if (trueLifecycle === TRIP_WORKFLOW_STATUS.goingToPickup) {
      return { label: 'Patient Picked Up', onClick: pickUpPatient, icon: Check }
    }
    if (trueLifecycle === TRIP_WORKFLOW_STATUS.patientOnboard) {
      return { label: 'Navigate to Hospital', onClick: startHospitalJourney, icon: Navigation }
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
        ) : trueLifecycle === TRIP_WORKFLOW_STATUS.assigned ? (
          <Card className="glass-card mx-auto max-w-xl border-emergency/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-emergency" />
                New Assignment
              </CardTitle>
              <CardDescription>Confirm to begin the response workflow</CardDescription>
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
              <div className="flex gap-3">
                <Button onClick={rejectAssignment} variant="outline" className="flex-1">
                  Reject
                </Button>
                <Button onClick={acceptAssignment} className="flex-1 bg-success text-white hover:bg-success/90">
                  Accept Assignment
                </Button>
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
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Map className="h-4 w-4 text-primary" />
                    Navigation Map
                  </CardTitle>
                  <CardDescription>
                    Route · ETA {activeTrip.eta != null ? `${activeTrip.eta} min` : '—'}
                    {etaDelay > 0 ? ` (+${etaDelay} delay)` : ''}
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
                    {routeState !== 'NORMAL' && routeState !== 'REROUTING' && (
                      <Button onClick={handleManualReroute} variant="outline" className="flex-1 border-emergency/30 text-emergency">
                        Reroute
                      </Button>
                    )}
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
                    Patient Details
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {patientName ?? 'Not provided'}
                  </p>
                  {patientNotes && (
                    <p className="mt-1 text-xs text-muted-foreground">{String(patientNotes)}</p>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Compass className="h-3.5 w-3.5 text-warning" />
                    Current Road
                  </div>
                  <p className="text-sm font-medium text-foreground">{currentRoad}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
