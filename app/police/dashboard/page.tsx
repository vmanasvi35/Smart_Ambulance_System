'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Ambulance,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Siren,
  Timer,
  User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AmbulanceMap } from '@/components/ambulance-map'
import { PoliceStatCard } from '@/components/police/stat-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  acknowledgePoliceAlerts,
  needsPoliceIntervention,
  resolvePoliceAlerts,
  startOfTodayISO,
} from '@/lib/police-actions'
import { fetchRecentActivity, formatActivityClock, activityTone } from '@/lib/activity-logs'
import { normalizeTripWorkflowStatus, TRIP_WORKFLOW_STATUS } from '@/lib/trip-status'
import {
  BANGALORE_LOCATIONS,
  type AmbulanceTrip,
  type ClearanceStatus,
  type PoliceAlert,
  type PoliceDecision,
  type RouteState,
} from '@/lib/types'
import { cn } from '@/lib/utils'

type ActivityItem = {
  id: string
  time: string
  text: string
  tone: 'info' | 'success' | 'warning' | 'emergency'
}

function getClearanceStatus(trip: AmbulanceTrip): ClearanceStatus {
  const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}

  if (routeData.clearanceStatus === 'pending' || routeData.clearanceStatus === 'clearing' || routeData.clearanceStatus === 'cleared') {
    return routeData.clearanceStatus
  }

  if (
    trip.route_condition === 'heavy_congestion' ||
    trip.route_condition === 'road_blocked' ||
    routeData.routeState === 'WAITING_FOR_POLICE_RESPONSE'
  ) {
    return 'pending'
  }

  return 'cleared'
}

function clearanceBadgeClass(status: ClearanceStatus) {
  if (status === 'pending') return 'border-red-500/40 bg-red-500/15 text-red-400'
  if (status === 'clearing') return 'border-yellow-500/40 bg-yellow-500/15 text-yellow-400'
  return 'border-green-500/40 bg-green-500/15 text-green-400'
}

function clearanceLabel(status: ClearanceStatus) {
  if (status === 'pending') return 'Pending'
  if (status === 'clearing') return 'Clearing'
  return 'Cleared'
}

function formatClock(value?: string | null) {
  return formatActivityClock(value)
}

export default function PoliceControlRoom() {
  const [trips, setTrips] = useState<AmbulanceTrip[]>([])
  const [todayAlerts, setTodayAlerts] = useState<PoliceAlert[]>([])
  const [activeAlerts, setActiveAlerts] = useState<PoliceAlert[]>([])
  const [selectedTrip, setSelectedTrip] = useState<AmbulanceTrip | null>(null)
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [busyTripId, setBusyTripId] = useState<string | null>(null)
  const knownTripStatuses = useRef<Map<string, string>>(new Map())
  const supabase = createClient()

  const pushActivity = useCallback((text: string, tone: ActivityItem['tone'] = 'info') => {
    setActivity((prev) => [
      {
        id: crypto.randomUUID(),
        time: formatClock(),
        text,
        tone,
      },
      ...prev,
    ].slice(0, 12))
  }, [])

  const loadActivityLogs = useCallback(async () => {
    const rows = await fetchRecentActivity(supabase, 30)
    if (rows.length === 0) return
    const filteredRows = rows.filter(
      (row) => !row.event_type.startsWith('dispatch')
    )
    setActivity(
      filteredRows.slice(0, 12).map((row) => ({
        id: row.id,
        time: formatClock(row.created_at),
        text: row.message,
        tone: activityTone(row.event_type),
      })),
    )
  }, [supabase])

  const loadData = useCallback(async () => {
    const [
      { data: driverProfilesData },
      { data: activeTripsData },
      { data: recentCompletedData },
      { data: alertsData },
      { data: activeAlertsData },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('role', 'driver'),
      supabase
        .from('ambulance_trips')
        .select('*, driver:profiles!ambulance_trips_driver_id_fkey(*)')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false }),
      supabase
        .from('ambulance_trips')
        .select('id, ambulance_id, destination, status, updated_at')
        .eq('status', 'completed')
        .gte('updated_at', startOfTodayISO())
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('police_alerts')
        .select('*')
        .gte('created_at', startOfTodayISO())
        .order('created_at', { ascending: false }),
      supabase
        .from('police_alerts')
        .select('*')
        .in('alert_status', ['pending', 'acknowledged'])
        .order('created_at', { ascending: false }),
    ])

    const dbDrivers = driverProfilesData ?? []
    const activeTrips = activeTripsData ?? []

    // Build complete trip representation for available and assigned ambulances
    const mapTrips: AmbulanceTrip[] = dbDrivers.map((driver, index) => {
      const activeTrip = activeTrips.find((t) => t.driver_id === driver.id)
      const locationPreset = BANGALORE_LOCATIONS[index % BANGALORE_LOCATIONS.length]
      const ambId = activeTrip?.ambulance_id || `AMB-${driver.full_name.substring(0, 3).toUpperCase()}-${driver.id.substring(0, 3).toUpperCase()}`

      if (activeTrip) {
        return {
          ...activeTrip,
          ambulance_id: ambId,
          driver: activeTrip.driver || driver,
        }
      }

      return {
        id: `available-${driver.id}`,
        driver_id: driver.id,
        ambulance_id: ambId,
        source: locationPreset.name,
        destination: 'Standby Base',
        source_lat: locationPreset.lat,
        source_lng: locationPreset.lng,
        dest_lat: null,
        dest_lng: null,
        current_lat: locationPreset.lat,
        current_lng: locationPreset.lng,
        status: 'pending',
        route_condition: 'clear',
        route_data: {
          status: TRIP_WORKFLOW_STATUS.available,
          waypoints: [[locationPreset.lat, locationPreset.lng]],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        driver: driver,
      } as AmbulanceTrip
    })

    for (const trip of activeTrips) {
      if (!mapTrips.some((t) => t.id === trip.id)) {
        mapTrips.push(trip)
      }
    }

    if (activeTripsData) {
      for (const trip of activeTripsData) {
        knownTripStatuses.current.set(trip.id, trip.status)
      }
    }

    if (recentCompletedData) {
      for (const trip of recentCompletedData) {
        knownTripStatuses.current.set(trip.id, trip.status)
      }
    }

    setTrips(mapTrips)
    setSelectedTrip((prev) => {
      if (!prev) return null
      return mapTrips.find((trip) => trip.id === prev.id) ?? null
    })

    setTodayAlerts(alertsData ?? [])
    setActiveAlerts(activeAlertsData ?? [])

    await loadActivityLogs()
    setLoading(false)
  }, [loadActivityLogs, supabase])

  useEffect(() => {
    loadData()

    const notificationChannel = supabase
      .channel('ambulance-notifications')
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        if (!payload) return
        loadData()
      })
      .subscribe()

    const tripsChannel = supabase
      .channel('police-dashboard-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulance_trips' },
        () => {
          loadData()
        },
      )
      .subscribe()

    const alertsChannel = supabase
      .channel('police-dashboard-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'police_alerts' },
        () => {
          loadData()
        },
      )
      .subscribe()

    const activityChannel = supabase
      .channel('police-dashboard-activity')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_logs' },
        () => {
          loadActivityLogs()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(notificationChannel)
      supabase.removeChannel(tripsChannel)
      supabase.removeChannel(alertsChannel)
      supabase.removeChannel(activityChannel)
    }
  }, [loadActivityLogs, loadData, supabase])

  const handleRoadCleared = async (trip: AmbulanceTrip) => {
    setBusyTripId(trip.id)
    const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: 'clear',
        route_data: {
          ...routeData,
          clearanceStatus: 'cleared' as ClearanceStatus,
          routeState: 'CLEARED' as RouteState,
          policeDecision: 'CLEAR_ROUTE' as PoliceDecision,
          policeDecisionAt: new Date().toISOString(),
          policeMessage: 'Road cleared. Ambulance may continue on current route.',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    await resolvePoliceAlerts(
      supabase,
      trip.id,
      'Decision: Road cleared by police.',
    )

    pushActivity(`Road cleared for ${trip.ambulance_id}`, 'success')
    await loadData()
    setBusyTripId(null)
  }

  const handleTrafficManaged = async (trip: AmbulanceTrip) => {
    setBusyTripId(trip.id)
    const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: 'moderate_traffic',
        route_data: {
          ...routeData,
          clearanceStatus: 'cleared' as ClearanceStatus,
          routeState: 'CLEARED' as RouteState,
          policeDecision: 'TRAFFIC_MANAGED' as PoliceDecision,
          policeDecisionAt: new Date().toISOString(),
          policeMessage: 'Traffic managed. Ambulance may continue on current route.',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    await resolvePoliceAlerts(
      supabase,
      trip.id,
      'Decision: Traffic managed by police.',
    )

    pushActivity(`Traffic managed for ${trip.ambulance_id}`, 'success')
    await loadData()
    setBusyTripId(null)
  }

  const handleRequestReroute = async (trip: AmbulanceTrip) => {
    setBusyTripId(trip.id)
    const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: 'road_blocked',
        route_data: {
          ...routeData,
          clearanceStatus: 'pending' as ClearanceStatus,
          routeState: 'WAITING_FOR_POLICE_RESPONSE' as RouteState,
          policeDecision: 'REROUTE_REQUIRED' as PoliceDecision,
          policeDecisionAt: new Date().toISOString(),
          policeMessage: 'Reroute requested. Driver dashboard will automatically calculate new route.',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    await acknowledgePoliceAlerts(
      supabase,
      trip.id,
      'Decision: Reroute requested by police.',
    )

    pushActivity(`Reroute requested for ${trip.ambulance_id}`, 'warning')
    await loadData()
    setBusyTripId(null)
  }


  const activeAlertTripIds = useMemo(
    () => new Set(activeAlerts.map((alert) => alert.trip_id)),
    [activeAlerts],
  )

  const emergencyTrips = useMemo(() => {
    const tripsWithAlerts = trips.filter((trip) => activeAlertTripIds.has(trip.id))
    const tripsNeedingAttention = trips.filter(
      (trip) => needsPoliceIntervention(trip) && !activeAlertTripIds.has(trip.id),
    )

    return [...tripsWithAlerts, ...tripsNeedingAttention]
  }, [activeAlertTripIds, trips])

  const activeAlertsCount = useMemo(
    () => new Set(activeAlerts.filter((alert) => alert.alert_status === 'pending').map((a) => a.trip_id)).size,
    [activeAlerts],
  )
  const activeAmbulancesNeedingClearance = emergencyTrips.length
  const routesClearedToday = useMemo(() => {
    const clearedTripIds = new Set(
      todayAlerts
        .filter((alert) => {
          const message = (alert.message ?? '').toLowerCase()
          const isResolved = alert.alert_status === 'resolved'
          const isMerged = message.includes('duplicate') || message.includes('merged')
          return isResolved && !isMerged
        })
        .map((alert) => alert.trip_id),
    )

    return clearedTripIds.size
  }, [todayAlerts])

  const averageResponseTime = useMemo(() => {
    const resolved = todayAlerts.filter((alert) => {
      const message = (alert.message ?? '').toLowerCase()
      const isMerged = message.includes('duplicate') || message.includes('merged')
      const isAutoCompleted = message.includes('completed') || message.includes('closed automatically')
      return alert.alert_status === 'resolved' && !isMerged && !isAutoCompleted
    })
    
    if (resolved.length === 0) return null

    const totalMinutes = resolved.reduce((sum, alert) => {
      const start = new Date(alert.created_at).getTime()
      const end = new Date(alert.updated_at || alert.created_at).getTime()
      const minutes = Math.max(1, Math.round((end - start) / 60000))
      return sum + minutes
    }, 0)

    return Math.round((totalMinutes / resolved.length) * 10) / 10
  }, [todayAlerts])

  const selectedRouteData = (selectedTrip?.route_data as Record<string, unknown> | null) ?? null

  if (loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-[#060e1a]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-7 w-7 animate-spin text-emergency" />
          <p className="text-sm">Loading traffic control center…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#060e1a]">
      <header className="border-b border-white/10 bg-[#07111f]/80 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emergency">
              <Radio className="h-3.5 w-3.5" />
              Traffic Control Center
            </div>
            <h1 className="text-xl font-semibold text-foreground">Police Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Receive alerts → Road Cleared / Traffic Managed / Request Reroute
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-emergency/30 bg-emergency/10 px-3 py-1.5 text-sm text-emergency">
            <Siren className="h-4 w-4 animate-pulse" />
            {activeAlertsCount} Pending
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-auto p-4 sm:p-6">
        {/* 1. Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PoliceStatCard
            label="Active Alerts"
            value={activeAlertsCount}
            icon={Siren}
            tone="emergency"
            hint="Require police attention"
            delay={0}
          />
          <PoliceStatCard
            label="Active Ambulances"
            value={activeAmbulancesNeedingClearance}
            icon={Ambulance}
            tone="warning"
            hint="Requesting clearance"
            delay={0.05}
          />
          <PoliceStatCard
            label="Routes Cleared Today"
            value={routesClearedToday}
            icon={CheckCircle2}
            tone="success"
            hint="Completed clearances"
            delay={0.1}
          />
          <PoliceStatCard
            label="Average Response Time"
            value={averageResponseTime ?? 0}
            icon={Timer}
            tone="info"
            hint={
              averageResponseTime == null
                ? 'Placeholder — awaiting responses'
                : `${averageResponseTime} min avg`
            }
            delay={0.15}
          />
        </div>

        {/* 2. Map + Recent Activity Grid */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          {/* Map Card */}
          <Card className="glass-card overflow-hidden border-white/10 flex flex-col h-[520px]">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-white/10 py-3 shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Navigation className="h-4 w-4 text-primary" />
                Live Tracking Map
              </CardTitle>
              {selectedTrip && (
                <Button size="sm" variant="outline" onClick={() => setSelectedTrip(null)}>
                  Show All
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-3 sm:p-4 flex-1 min-h-0 relative">
              <AmbulanceMap
                trips={trips}
                selectedTrip={selectedTrip}
                onTripSelect={setSelectedTrip}
                showAllTrips={!selectedTrip}
                className="h-full w-full absolute inset-0"
              />
            </CardContent>
          </Card>

          {/* Recent Activity Card */}
          <Card className="glass-card border-white/10 flex flex-col h-[520px] overflow-hidden">
            <CardHeader className="border-b border-white/10 py-3 shrink-0">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-y-auto">
              {activity.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-xs text-muted-foreground">
                  Waiting for dispatch, acceptance, and clearance events.
                </div>
              ) : (
                <ol className="space-y-3">
                  {activity.map((item) => (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"
                    >
                      <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.time}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          item.tone === 'success' && 'text-success',
                          item.tone === 'warning' && 'text-warning',
                          item.tone === 'emergency' && 'text-emergency',
                          item.tone === 'info' && 'text-foreground',
                        )}
                      >
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 3. Active Emergency Alerts */}
        <div className="mt-6">
          <Card className="glass-card border-white/10">
            <CardHeader className="border-b border-white/10 py-3">
              <CardTitle className="text-base">Active Emergency Alerts</CardTitle>
              <CardDescription>Only emergencies that need police action</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {emergencyTrips.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
                  <p className="text-sm font-medium text-foreground">No active clearance requests</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    All ambulance corridors are currently clear.
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {emergencyTrips.map((trip) => {
                    const clearance = getClearanceStatus(trip)
                    const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}
                    const tripStatus = normalizeTripWorkflowStatus(
                      typeof routeData.status === 'string' ? routeData.status : TRIP_WORKFLOW_STATUS.assigned,
                    )
                    const priority = String(routeData.priority ?? 'critical')
                    const isSelected = selectedTrip?.id === trip.id

                    return (
                      <motion.div
                        key={trip.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        className={cn(
                          'rounded-xl border p-4 text-left transition-all duration-200 block w-full',
                          isSelected
                            ? 'bg-primary/10 border-primary/45 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10',
                        )}
                      >
                        <button
                          onClick={() => setSelectedTrip(trip)}
                          className="w-full text-left block focus:outline-none"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {trip.ambulance_id}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                {trip.driver?.full_name ?? 'Driver'}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase',
                                clearanceBadgeClass(clearance),
                              )}
                            >
                              {clearanceLabel(clearance)}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <p>
                              Priority:{' '}
                              <span className="font-medium uppercase text-foreground">{priority}</span>
                            </p>
                            <p>
                              Trip Status:{' '}
                              <span className="font-medium text-foreground">{tripStatus}</span>
                            </p>
                            <p className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              ETA:{' '}
                              <span className="font-medium text-foreground">
                                {trip.eta != null ? `${trip.eta} min` : '—'}
                              </span>
                            </p>
                            <p className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {trip.source} → {trip.destination}
                              </span>
                            </p>
                          </div>
                        </button>

                        <div className="mt-3 flex gap-2" onClick={(event) => event.stopPropagation()}>
                          {clearance === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                className="flex-1 bg-success text-white hover:bg-success/90"
                                disabled={busyTripId === trip.id}
                                onClick={() => handleRoadCleared(trip)}
                              >
                                <Check className="mr-1.5 h-3.5 w-3.5" />
                                Road Cleared
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 bg-warning text-white hover:bg-warning/90"
                                disabled={busyTripId === trip.id}
                                onClick={() => handleTrafficManaged(trip)}
                              >
                                <Navigation className="mr-1.5 h-3.5 w-3.5" />
                                Traffic Managed
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 border-emergency/30 text-emergency"
                                disabled={busyTripId === trip.id}
                                onClick={() => handleRequestReroute(trip)}
                              >
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                Request Reroute
                              </Button>
                            </>
                          )}
                          {clearance === 'cleared' && (
                            <p className="w-full rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-center text-xs text-success">
                              Cleared · read only
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MapChip({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">{label}</span>
  )
}
