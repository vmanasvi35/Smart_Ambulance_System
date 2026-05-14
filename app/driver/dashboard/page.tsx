'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AmbulanceMap } from '@/components/ambulance-map'
import { StatusBadge } from '@/components/status-badge'
import { SimulationControlPanel, type SimulationState } from '@/components/simulation-control-panel'
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
} from 'lucide-react'
import type { AmbulanceTrip, Profile, RouteCondition, TrafficLevel } from '@/lib/types'

const rerouteConditions: RouteCondition[] = ['heavy_congestion', 'road_blocked']

function routeDataFor(trip: AmbulanceTrip | null): SmartRouteData | null {
  return (trip?.route_data as SmartRouteData | null) ?? null
}

function affectedRoadFor(trip: AmbulanceTrip) {
  return `${trip.source} to ${trip.destination}`
}

export default function DriverDashboard() {
  const [activeTrip, setActiveTrip] = useState<AmbulanceTrip | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [routeIndex, setRouteIndex] = useState(0)
  const [lowSpeedTicks, setLowSpeedTicks] = useState(0)
  const [simulationState, setSimulationState] = useState<SimulationState>({
    trafficLevel: 'low',
    isOffline: false,
    roadblockMode: false,
    roadblocks: [],
    spawnedVehicles: [],
  })
  const activeTripRef = useRef<AmbulanceTrip | null>(null)
  const alertKeyRef = useRef<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    activeTripRef.current = activeTrip
  }, [activeTrip])

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
    setTracking(tripData?.status === 'in_progress')
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()

    const tripChannel = supabase
      .channel('driver-smart-trips')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ambulance_trips',
        },
        () => {
          if (!simulationState.isOffline) loadData()
        },
      )
      .subscribe()

    const alertChannel = supabase
      .channel('driver-police-responses')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'police_alerts',
        },
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

  const updateTripRouteState = useCallback(
    async (updates: Partial<AmbulanceTrip> & { route_data?: SmartRouteData }) => {
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

      const alertKey = `${trip.id}:${condition}:${Math.round(etaDelay)}`
      if (alertKeyRef.current === alertKey) return
      alertKeyRef.current = alertKey

      await supabase.from('police_alerts').insert({
        trip_id: trip.id,
        alert_type: condition === 'road_blocked' ? 'route_assessment' : 'traffic',
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
    async (reason: RouteCondition) => {
      const trip = activeTripRef.current
      if (!trip || rerouting || simulationState.isOffline) return

      const routeData = routeDataFor(trip)
      if (routeData?.lastReroutedFor === reason) return
      if (!trip.current_lat || !trip.current_lng || !trip.dest_lat || !trip.dest_lng) return

      setRerouting(true)
      const nextRoute = await calculateSmartRoute({
        source: [trip.current_lat, trip.current_lng],
        destination: [trip.dest_lat, trip.dest_lng],
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
      }

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
    if (!rerouteConditions.includes(activeTrip.route_condition)) return

    rerouteTrip(activeTrip.route_condition)
  }, [activeTrip?.route_condition, activeTrip?.status, rerouteTrip])

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

  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'in_progress') return
    if (lowSpeedTicks < 3) return

    const routeData = routeDataFor(activeTrip)
    const etaDelay = routeData?.etaDelay ?? 12
    updateTripRouteState({ route_condition: 'heavy_congestion' })
    createAutomaticAlert('heavy_congestion', etaDelay, 'Heavy Congestion')
  }, [activeTrip, createAutomaticAlert, lowSpeedTicks, updateTripRouteState])

  const startTrip = async () => {
    if (!activeTrip) return

    await supabase
      .from('ambulance_trips')
      .update({
        status: 'in_progress',
        route_condition: 'clear',
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeTrip.id)

    setTracking(true)
    loadData()
  }

  const completeTrip = async () => {
    if (!activeTrip) return

    await supabase
      .from('ambulance_trips')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', activeTrip.id)

    setTracking(false)
    loadData()
  }

  const handleTrafficChange = async (level: TrafficLevel) => {
    setSimulationState((current) => ({ ...current, trafficLevel: level }))
    if (!activeTrip) return

    const routeData = routeDataFor(activeTrip)
    const baseEta = routeData?.baseEta ?? activeTrip.eta ?? 1
    const etaDelay = level === 'high' ? 15 : level === 'medium' ? 5 : 0
    const condition = conditionForTrafficLevel(level)

    await updateTripRouteState({
      route_condition: condition,
      eta: baseEta + etaDelay,
      route_data: {
        ...(routeData ?? {
          waypoints: [],
          totalDistance: activeTrip.distance ?? 0,
          estimatedTime: activeTrip.eta ?? 0,
        }),
        trafficLevel: level,
        etaDelay,
        estimatedTime: baseEta + etaDelay,
        roadblocks: simulationState.roadblocks,
        spawnedVehicles: simulationState.spawnedVehicles,
      },
    })

    if (level === 'high') {
      createAutomaticAlert('heavy_congestion', etaDelay, trafficLabel(level))
    }
  }

  const handleNetworkToggle = (offline: boolean) => {
    setSimulationState((current) => ({ ...current, isOffline: offline }))
    setTracking(!offline && activeTrip?.status === 'in_progress')
    if (!offline) loadData()
  }

  const handleRoadblockAdd = async (lat: number, lng: number) => {
    const nextRoadblocks = [
      ...simulationState.roadblocks,
      { lat, lng, id: crypto.randomUUID() },
    ]

    setSimulationState((current) => ({
      ...current,
      roadblockMode: false,
      roadblocks: nextRoadblocks,
    }))

    if (!activeTrip) return
    const routeData = routeDataFor(activeTrip)
    const etaDelay = Math.max(10, (routeData?.etaDelay ?? 0) + 10)

    await updateTripRouteState({
      route_condition: 'road_blocked',
      eta: (activeTrip.eta ?? 1) + etaDelay,
      route_data: {
        ...(routeData ?? {
          waypoints: [],
          totalDistance: activeTrip.distance ?? 0,
          estimatedTime: activeTrip.eta ?? 0,
        }),
        roadblocks: nextRoadblocks,
        etaDelay,
      },
    })
    createAutomaticAlert('road_blocked', etaDelay, 'Road Blocked')
  }

  const handleSpawnVehicle = async () => {
    const routeData = routeDataFor(activeTrip)
    const waypoints = routeData?.waypoints ?? []
    const fallback = activeTrip?.current_lat && activeTrip?.current_lng
      ? [activeTrip.current_lat, activeTrip.current_lng]
      : [12.9716, 77.5946]
    const spawnPoint = waypoints[Math.min(routeIndex + 4, Math.max(0, waypoints.length - 1))] ?? fallback
    const nextVehicles = [
      ...simulationState.spawnedVehicles,
      {
        lat: spawnPoint[0],
        lng: spawnPoint[1],
        id: crypto.randomUUID(),
        ambulanceId: `SIM-${String(simulationState.spawnedVehicles.length + 1).padStart(3, '0')}`,
      },
    ]

    setSimulationState((current) => ({ ...current, spawnedVehicles: nextVehicles }))

    if (activeTrip && routeData) {
      await updateTripRouteState({
        route_data: {
          ...routeData,
          spawnedVehicles: nextVehicles,
        },
      })
    }
  }

  const clearRoadblocks = async () => {
    setSimulationState((current) => ({ ...current, roadblocks: [] }))
    if (!activeTrip) return

    const routeData = routeDataFor(activeTrip)
    await updateTripRouteState({
      route_condition: 'clear',
      route_data: routeData ? { ...routeData, roadblocks: [], etaDelay: 0 } : undefined,
    })
  }

  const clearVehicles = async () => {
    setSimulationState((current) => ({ ...current, spawnedVehicles: [] }))
    const routeData = routeDataFor(activeTrip)
    if (activeTrip && routeData) {
      await updateTripRouteState({ route_data: { ...routeData, spawnedVehicles: [] } })
    }
  }

  const routeData = useMemo(() => routeDataFor(activeTrip), [activeTrip])
  const etaDelay = routeData?.etaDelay ?? 0

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Driver Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {profile?.full_name}
            </p>
          </div>
          {!activeTrip && (
            <Button asChild>
              <Link href="/driver/new-trip">
                <MapPin className="mr-2 h-4 w-4" />
                Start New Trip
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {activeTrip ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <div className="space-y-6">
              <Card className="glass-card border-border/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      Active Trip
                    </CardTitle>
                    <StatusBadge status={activeTrip.status} />
                  </div>
                  <CardDescription>{activeTrip.ambulance_id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-3 w-3 rounded-full bg-green-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Pickup Location</p>
                        <p className="font-medium text-foreground">{activeTrip.source}</p>
                      </div>
                    </div>
                    <div className="ml-1.5 h-8 w-px bg-border" />
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-3 w-3 rounded-full bg-red-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Hospital</p>
                        <p className="font-medium text-foreground">{activeTrip.destination}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <div className="rounded-lg bg-secondary/50 p-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">ETA</span>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {activeTrip.eta ? `${activeTrip.eta} min` : '--'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Navigation className="h-4 w-4" />
                        <span className="text-xs">Distance</span>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {activeTrip.distance ? `${activeTrip.distance.toFixed(1)} km` : '--'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs">Route</span>
                      </div>
                      <StatusBadge status={activeTrip.route_condition} className="mt-1" />
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {simulationState.isOffline ? <WifiOff className="h-4 w-4" /> : <Route className="h-4 w-4" />}
                        <span className="text-xs">Delay</span>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        +{etaDelay} min
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {activeTrip.status === 'pending' && (
                      <Button onClick={startTrip} className="flex-1">
                        <Play className="mr-2 h-4 w-4" />
                        Start Emergency Trip
                      </Button>
                    )}
                    {activeTrip.status === 'in_progress' && (
                      <>
                        <Button disabled variant="secondary" className="flex-1">
                          <Navigation className="mr-2 h-4 w-4" />
                          {simulationState.isOffline ? 'Cached Tracking' : tracking ? 'Live GPS Active' : 'GPS Paused'}
                        </Button>
                        <Button onClick={completeTrip} variant="default" className="flex-1">
                          <Square className="mr-2 h-4 w-4" />
                          Complete Trip
                        </Button>
                      </>
                    )}
                    {rerouting && (
                      <Button disabled variant="secondary" className="flex-1">
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Calculating Alternate Route
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Live Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AmbulanceMap
                    trips={[activeTrip]}
                    selectedTrip={activeTrip}
                    showAllTrips={false}
                    trafficLevel={simulationState.trafficLevel}
                    roadblockMode={simulationState.roadblockMode}
                    roadblocks={simulationState.roadblocks}
                    spawnedVehicles={simulationState.spawnedVehicles}
                    onRoadblockAdd={handleRoadblockAdd}
                    className="h-[460px]"
                  />
                </CardContent>
              </Card>
            </div>

            <SimulationControlPanel
              simulationState={simulationState}
              onTrafficChange={handleTrafficChange}
              onNetworkToggle={handleNetworkToggle}
              onRoadblockModeToggle={(enabled) =>
                setSimulationState((current) => ({ ...current, roadblockMode: enabled }))
              }
              onSpawnVehicle={handleSpawnVehicle}
              onClearRoadblocks={clearRoadblocks}
              onClearVehicles={clearVehicles}
            />
          </div>
        ) : (
          <Card className="glass-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">No Active Trip</h3>
              <p className="mb-6 text-center text-muted-foreground">
                Start a new trip to begin tracking your route and coordinate with police.
              </p>
              <Button asChild>
                <Link href="/driver/new-trip">
                  <MapPin className="mr-2 h-4 w-4" />
                  Start New Trip
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
