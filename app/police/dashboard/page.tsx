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
import { startOfTodayISO } from '@/lib/police-actions'
import { fetchRecentActivity, formatActivityClock, activityTone } from '@/lib/activity-logs'
import { normalizeTripWorkflowStatus, TRIP_WORKFLOW_STATUS } from '@/lib/trip-status'
import type {
  AmbulanceTrip,
  ClearanceStatus,
  PoliceAlert,
  PoliceDecision,
  RouteState,
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

function needsPoliceAttention(trip: AmbulanceTrip) {
  const status = getClearanceStatus(trip)
  return status === 'pending' || status === 'clearing'
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
    const rows = await fetchRecentActivity(supabase, 12)
    if (rows.length === 0) return
    setActivity(
      rows.map((row) => ({
        id: row.id,
        time: formatClock(row.created_at),
        text: row.message,
        tone: activityTone(row.event_type),
      })),
    )
  }, [supabase])

  const loadData = useCallback(async () => {
    const [{ data: activeTripsData }, { data: recentCompletedData }, { data: alertsData }] =
      await Promise.all([
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
      ])

    if (activeTripsData) {
      for (const trip of activeTripsData) {
        knownTripStatuses.current.set(trip.id, trip.status)
      }

      setTrips(activeTripsData)
      setSelectedTrip((prev) => {
        if (!prev) return null
        return activeTripsData.find((trip) => trip.id === prev.id) ?? null
      })
    }

    if (recentCompletedData) {
      for (const trip of recentCompletedData) {
        knownTripStatuses.current.set(trip.id, trip.status)
      }
    }

    if (alertsData) {
      setTodayAlerts(alertsData)
    }

    await loadActivityLogs()
    setLoading(false)
  }, [loadActivityLogs, supabase])

  useEffect(() => {
    loadData()

    const notificationChannel = supabase
      .channel('ambulance-notifications')
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        const eventType = payload?.event_type
        if (!payload || !['dispatch_assigned', 'driver_accepted'].includes(eventType)) return
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

  const handleStartClearing = async (trip: AmbulanceTrip) => {
    setBusyTripId(trip.id)
    const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: trip.route_condition || 'heavy_congestion',
        route_data: {
          ...routeData,
          clearanceStatus: 'clearing' as ClearanceStatus,
          routeState: 'WAITING_FOR_POLICE_RESPONSE' as RouteState,
          policeDecision: 'CLEAR_ROUTE' as PoliceDecision,
          policeDecisionAt: new Date().toISOString(),
          policeMessage: 'Police has begun clearing the emergency corridor.',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    // Move related alerts to waiting/acknowledged
    await supabase
      .from('police_alerts')
      .update({
        alert_status: 'acknowledged',
        updated_at: new Date().toISOString(),
      })
      .eq('trip_id', trip.id)
      .eq('alert_status', 'pending')

    pushActivity(`Traffic clearing started for ${trip.ambulance_id}`, 'warning')
    await loadData()
    setBusyTripId(null)
  }

  const handleMarkCleared = async (trip: AmbulanceTrip) => {
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
          policeMessage: 'Police marked the corridor cleared for the ambulance.',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    const { data: activeAlerts } = await supabase
      .from('police_alerts')
      .select('id, message')
      .eq('trip_id', trip.id)
      .in('alert_status', ['pending', 'acknowledged'])

    if (activeAlerts) {
      for (const alert of activeAlerts) {
        await supabase
          .from('police_alerts')
          .update({
            alert_status: 'resolved',
            message: `${alert.message ?? ''} Decision: Cleared by police coordinator.`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', alert.id)
      }
    }

    pushActivity(`Traffic cleared for ${trip.ambulance_id}`, 'success')
    await loadData()
    setBusyTripId(null)
  }

  const emergencyTrips = useMemo(
    () => trips.filter((trip) => needsPoliceAttention(trip)),
    [trips],
  )

  const activeAlertsCount = emergencyTrips.filter((trip) => getClearanceStatus(trip) === 'pending').length
  const activeAmbulancesNeedingClearance = emergencyTrips.length
  const routesClearedToday = todayAlerts.filter((alert) => {
    const message = (alert.message ?? '').toLowerCase()
    return (
      alert.alert_status === 'resolved' &&
      (message.includes('clear') || message.includes('cleared') || message.includes('preemption'))
    )
  }).length

  const averageResponseTime = useMemo(() => {
    const resolved = todayAlerts.filter((alert) => alert.alert_status === 'resolved')
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
              Receive alerts → Locate ambulance → Clear traffic → Mark route cleared
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

        {/* 2. Large live map */}
        <Card className="glass-card overflow-hidden border-white/10">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-white/10 py-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Navigation className="h-4 w-4 text-primary" />
                Live Tracking Map
              </CardTitle>
              <CardDescription>
                {selectedTrip
                  ? `${selectedTrip.ambulance_id} · ETA ${selectedTrip.eta != null ? `${selectedTrip.eta} min` : '—'} · ${clearanceLabel(getClearanceStatus(selectedTrip))}`
                  : 'Select an alert to focus its route'}
              </CardDescription>
            </div>
            {selectedTrip && (
              <Button size="sm" variant="outline" onClick={() => setSelectedTrip(null)}>
                Show All
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <MapChip label="Ambulance" />
              <MapChip label="Pickup" />
              <MapChip label="Hospital" />
              <MapChip
                label={
                  selectedTrip
                    ? `Clearance: ${clearanceLabel(getClearanceStatus(selectedTrip))}`
                    : 'Clearance status'
                }
              />
              {selectedTrip && (
                <MapChip
                  label={`Route state: ${String(selectedRouteData?.routeState ?? selectedTrip.route_condition)}`}
                />
              )}
            </div>
            <AmbulanceMap
              trips={trips}
              selectedTrip={selectedTrip}
              onTripSelect={setSelectedTrip}
              showAllTrips={!selectedTrip}
              className="h-[420px] rounded-xl border border-white/10 sm:h-[520px]"
            />
          </CardContent>
        </Card>

        {/* 3. Active Emergency Alerts + Recent Activity */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
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
                        exit={{ opacity: 0, y: -8 }}
                        className={cn(
                          'rounded-xl border p-4 transition-colors',
                          isSelected
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20',
                        )}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedTrip(trip)}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs text-primary">
                                EMR-{trip.id.slice(0, 8).toUpperCase()}
                              </p>
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
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={busyTripId === trip.id}
                              onClick={() => handleStartClearing(trip)}
                            >
                              <Navigation className="mr-1.5 h-3.5 w-3.5" />
                              Start Clearing
                            </Button>
                          )}
                          {clearance === 'clearing' && (
                            <Button
                              size="sm"
                              className="flex-1 bg-success text-white hover:bg-success/90"
                              disabled={busyTripId === trip.id}
                              onClick={() => handleMarkCleared(trip)}
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" />
                              Mark Cleared
                            </Button>
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

          <Card className="glass-card border-white/10">
            <CardHeader className="border-b border-white/10 py-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription>Newest events first</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
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
      </div>
    </div>
  )
}

function MapChip({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">{label}</span>
  )
}
