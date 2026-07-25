'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { AmbulanceMap } from '@/components/ambulance-map'
import { Bell, ClipboardList } from 'lucide-react'
import { PoliceStatCard } from '@/components/police/stat-card'
import { ActivitySummary } from '@/components/police/empty-state'
import { startOfTodayISO } from '@/lib/police-actions'
import type { AmbulanceTrip, PoliceAlert, ClearanceStatus, RouteCondition, PoliceDecision, RouteState, TripWorkflowStatus } from '@/lib/types'
import { TRIP_WORKFLOW_STATUS, normalizeTripWorkflowStatus } from '@/lib/trip-status'
import {
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Radio,
  RefreshCw,
  Siren,
  Shield,
  Clock,
  Gauge,
  MapPin,
  Heart,
  TrendingUp,
  Sliders,
  Check,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function PoliceControlRoom() {
  const [trips, setTrips] = useState<AmbulanceTrip[]>([])
  const [todayAlerts, setTodayAlerts] = useState<PoliceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrip, setSelectedTrip] = useState<AmbulanceTrip | null>(null)
  const [notifications, setNotifications] = useState<Array<{
    id: string
    title: string
    message: string
    pickup: string
    destination: string
    priority: string
    ambulanceId: string
    eta: string | number | null
    createdAt: string
  }>>([])
  
  const supabase = createClient()

  const loadData = useCallback(async () => {
    // Load all active or pending trips
    const { data: tripsData } = await supabase
      .from('ambulance_trips')
      .select('*, driver:profiles!ambulance_trips_driver_id_fkey(*)')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })

    if (tripsData) {
      setTrips(tripsData)
      
      // Update selected trip reference if it is still active
      if (selectedTrip) {
        const match = tripsData.find(t => t.id === selectedTrip.id)
        setSelectedTrip(match || null)
      }
    }

    // Load alerts generated today
    const { data: alertsData } = await supabase
      .from('police_alerts')
      .select('*')
      .gte('created_at', startOfTodayISO())
      .order('created_at', { ascending: false })

    if (alertsData) {
      setTodayAlerts(alertsData)
    }

    setLoading(false)
  }, [supabase, selectedTrip])

  useEffect(() => {
    loadData()

    const notificationChannel = supabase
      .channel('ambulance-notifications')
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        const eventType = payload?.event_type
        if (!payload || !['dispatch_assigned', 'driver_accepted'].includes(eventType)) return

        const entry = {
          id: `${eventType}-${payload.trip_id ?? payload.ambulanceId ?? Date.now()}`,
          title: eventType === 'dispatch_assigned' ? 'Dispatch Assignment' : 'Driver Acceptance',
          message: eventType === 'dispatch_assigned'
            ? 'A new ambulance assignment has been dispatched.'
            : 'The assigned driver has accepted the mission.',
          pickup: payload.pickup ?? 'Unknown pickup',
          destination: payload.destination ?? 'Unknown destination',
          priority: payload.priority ?? 'standard',
          ambulanceId: payload.ambulanceId ?? 'Unknown ambulance',
          eta: payload.eta ?? 'Pending',
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }

        setNotifications((prev) => [entry, ...prev].slice(0, 8))
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

    return () => {
      supabase.removeChannel(notificationChannel)
      supabase.removeChannel(tripsChannel)
      supabase.removeChannel(alertsChannel)
    }
  }, [loadData, supabase])

  function getClearanceStatus(trip: AmbulanceTrip): ClearanceStatus {
    const routeData = (trip.route_data as any) || {}

    if (routeData.clearanceStatus) {
      return routeData.clearanceStatus as ClearanceStatus
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

  const handleStartClearing = async (trip: AmbulanceTrip) => {
    const routeData = (trip.route_data as any) || {}

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

    loadData()
  }

  const handleMarkCleared = async (trip: AmbulanceTrip) => {
    const routeData = (trip.route_data as any) || {}

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

    loadData()
  }

  const activeTripsCount = trips.filter(t => t.status === 'in_progress').length
  const pendingAssistanceCount = trips.filter(t => ['heavy_congestion', 'road_blocked'].includes(t.route_condition)).length
  const routesCleared = todayAlerts.filter(a =>
    (a.message ?? '').toLowerCase().includes('clear') || (a.message ?? '').toLowerCase().includes('preemption')
  ).length

  if (loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-[#060e1a]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-red-500" />
          <p className="text-sm font-semibold tracking-wider text-muted-foreground/80 uppercase">
            Initializing Police Control Room Console…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#060e1a]">
      <header className="border-b border-white/10 bg-[#07111f]/80 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-red-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              Police Lane Preemption Center
            </div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              Traffic Coordination Control Room
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor active emergency vehicles, resolve priority lane traffic bottlenecks, and command reroutes.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
              <Radio className="h-4 w-4 animate-pulse" />
              {activeTripsCount} Active Ambulances
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-auto p-6">
        {/* Statistics Widgets */}
        <div className="grid gap-4 sm:grid-cols-3">
          <PoliceStatCard
            label="Heavy Congestions"
            value={pendingAssistanceCount}
            icon={AlertTriangle}
            tone="warning"
            hint="Awaiting lane clearance"
            delay={0.05}
          />
          <PoliceStatCard
            label="Total Alerts Handled"
            value={todayAlerts.length}
            icon={Siren}
            tone="info"
            hint="System alerts registered today"
            delay={0.1}
          />
          <PoliceStatCard
            label="Cleared Pathways Today"
            value={routesCleared}
            icon={CheckCircle2}
            tone="success"
            hint="Cleared by police preemption"
            delay={0.15}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <Card className="border border-white/10 bg-[#07111f]/60 backdrop-blur-xl">
              <CardHeader className="border-b border-white/5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <Bell className="h-4.5 w-4.5 text-red-400" />
                  Live Dispatch Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {notifications.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                      Waiting for dispatch and acceptance activity.
                    </div>
                  ) : (
                    notifications.map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-white">{item.title}</p>
                          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{item.createdAt}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{item.message}</p>
                        <div className="mt-2 grid gap-1 text-[11px] text-slate-300 sm:grid-cols-2">
                          <p>Pickup: <span className="font-semibold text-slate-100">{item.pickup}</span></p>
                          <p>Destination: <span className="font-semibold text-slate-100">{item.destination}</span></p>
                          <p>Priority: <span className="font-semibold text-slate-100">{item.priority}</span></p>
                          <p>Ambulance: <span className="font-semibold text-slate-100">{item.ambulanceId}</span></p>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400">ETA: <span className="font-semibold text-slate-100">{item.eta ? `${item.eta} min` : 'Pending'}</span></p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border border-white/10 bg-[#07111f]/60 backdrop-blur-xl">
              <CardHeader className="border-b border-white/5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <ClipboardList className="h-4.5 w-4.5 text-blue-400" />
                  Active Ambulance Units
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-sm text-slate-400">
                Updates stream in real time as assignments and acceptance events arrive.
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Layout: Interactive Tracking Map & Live Ambulance Cards */}
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          
          {/* Active Ambulances Cards List */}
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-base font-bold text-foreground tracking-wide flex items-center gap-2">
                <Shield className="text-blue-400 h-4.5 w-4.5" />
                Active Ambulance Units ({trips.length})
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-1">
              {trips.map((trip) => {
                const routeData = (trip.route_data as any) || {}
                const clearanceStatus = getClearanceStatus(trip)
                const needsClearanceAction = clearanceStatus !== 'cleared'
                const isHeavyTraffic = ['heavy_congestion', 'road_blocked'].includes(trip.route_condition)
                const currentStage = normalizeTripWorkflowStatus(routeData.status || TRIP_WORKFLOW_STATUS.assigned) as TripWorkflowStatus
                const speed = currentStage === TRIP_WORKFLOW_STATUS.goingToPickup || currentStage === TRIP_WORKFLOW_STATUS.enRouteHospital
                  ? trip.route_condition === 'clear' ? 75 : trip.route_condition === 'moderate_traffic' ? 44 : 12
                  : 0

                return (
                  <motion.div
                    key={trip.id}
                    layoutId={`trip-card-${trip.id}`}
                    onClick={() => setSelectedTrip(trip)}
                    className={`glass-card rounded-2xl border p-5 cursor-pointer transition-all duration-200 ${
                      selectedTrip?.id === trip.id 
                        ? 'bg-white/[0.07] border-blue-500/40 ring-1 ring-blue-500/20' 
                        : isHeavyTraffic
                          ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
                          : 'bg-[#07111f]/45 border-white/10 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div>
                        <span className="font-mono text-xs font-extrabold text-blue-400 tracking-wider">
                          {trip.ambulance_id}
                        </span>
                        <h3 className="text-sm font-bold text-slate-200 mt-0.5">
                          Driver: {trip.driver?.full_name || 'Active Unit'}
                        </h3>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                        trip.route_condition === 'clear'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : trip.route_condition === 'moderate_traffic'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                            : 'bg-red-500/10 text-red-400 border-red-500/25 animate-pulse'
                      }`}>
                        Traffic: {trip.route_condition.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={
                        `inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                          clearanceStatus === 'pending'
                            ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25'
                            : clearanceStatus === 'clearing'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                        }`
                      }>
                        {clearanceStatus === 'pending'
                          ? 'Clearance Pending'
                          : clearanceStatus === 'clearing'
                            ? 'Clearing'
                            : 'Cleared'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-3.5 mt-3.5 text-xs text-muted-foreground">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Current Stage</span>
                        <span className="text-slate-200 font-bold mt-0.5 block">{currentStage}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide block">ETA / Distance</span>
                        <span className="text-slate-200 font-semibold font-mono mt-0.5 block">
                          {trip.eta ? `${trip.eta} mins` : '--'} ({trip.distance ? `${trip.distance.toFixed(1)} km` : '--'})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Current Speed</span>
                        <span className="text-slate-200 font-semibold font-mono mt-0.5 block flex items-center gap-1">
                          <Gauge className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          {speed} km/h
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Live Location</span>
                        <span className="text-slate-200 font-mono mt-0.5 block truncate max-w-[140px]">
                          {trip.current_lat ? `${trip.current_lat.toFixed(4)}, ${trip.current_lng?.toFixed(4)}` : 'Standby'}
                        </span>
                      </div>
                    </div>

                    {/* Traffic Alert Banner Block */}
                    <AnimatePresence>
                      {needsClearanceAction && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 pt-4 border-t border-red-500/15 overflow-hidden"
                          onClick={(e) => e.stopPropagation()} // Prevent trigger select trip on clicking actions
                        >
                          <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 flex flex-col gap-3">
                            <div className="flex items-start gap-2.5 text-left text-xs">
                              <AlertTriangle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                              <div>
                                <h4 className="font-bold text-red-400 uppercase tracking-wider text-[10px]">Traffic Clearance</h4>
                                <p className="text-[11px] text-slate-300 mt-0.5">Police can begin corridor clearance and then mark the route cleared.</p>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              {clearanceStatus === 'pending' ? (
                                <Button
                                  onClick={() => handleStartClearing(trip)}
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 rounded-lg border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5"
                                >
                                  <Navigation className="mr-1 h-3.5 w-3.5" />
                                  Start Clearing
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => handleMarkCleared(trip)}
                                  size="sm"
                                  className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-white text-xs"
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Mark Cleared
                                </Button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </motion.div>
                )
              })}
              {trips.length === 0 && (
                <div className="py-16 text-center text-xs text-muted-foreground bg-white/[0.01] border border-white/10 rounded-2xl">
                  No active ambulance units currently traveling.
                </div>
              )}
            </div>
          </div>

          {/* Interactive Map Column */}
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-base font-bold text-foreground tracking-wide">
                Live Preemption Map
              </h2>
            </div>
            
            <Card className="bg-[#0a1628]/45 border border-white/10 rounded-2xl overflow-hidden relative shadow-xl">
              <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {selectedTrip ? `Focused: ${selectedTrip.ambulance_id}` : 'Displaying all active units'}
                </span>
                {selectedTrip && (
                  <button
                    onClick={() => setSelectedTrip(null)}
                    className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 rounded hover:bg-blue-500/20"
                  >
                    Show All
                  </button>
                )}
              </div>
              <div className="h-[460px] relative">
                <AmbulanceMap
                  trips={trips}
                  selectedTrip={selectedTrip}
                  showAllTrips={!selectedTrip}
                  className="h-full w-full absolute inset-0"
                />
              </div>
            </Card>
          </div>

        </div>

        <ActivitySummary
          assisted={routesCleared}
          routesCleared={routesCleared}
          alertsHandled={todayAlerts.length}
        />
      </div>
    </div>
  )
}
