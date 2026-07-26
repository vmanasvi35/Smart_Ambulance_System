'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams as useNextParams, useRouter as useNextRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Clock,
  Gauge,
  Hospital,
  MapPin,
  Navigation,
  RefreshCw,
  User,
  Ambulance,
  Shield,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Activity,
  Heart,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { AmbulanceMap } from '@/components/ambulance-map'
import { priorityForTrip } from '@/lib/police-actions'
import { calculateSmartRoute } from '@/lib/routing'
import type { AmbulanceTrip, Profile, ActivityLogRow, ClearanceStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

function getClearanceStatus(trip: AmbulanceTrip): ClearanceStatus {
  const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}
  if (
    routeData.clearanceStatus === 'pending' ||
    routeData.clearanceStatus === 'clearing' ||
    routeData.clearanceStatus === 'cleared'
  ) {
    return routeData.clearanceStatus as ClearanceStatus
  }
  return 'pending'
}

export default function AmbulanceDetailsPage() {
  const params = useNextParams<{ tripId: string }>()
  const router = useNextRouter()
  const tripId = params.tripId
  const [trip, setTrip] = useState<AmbulanceTrip | null>(null)
  const [logs, setLogs] = useState<ActivityLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [policeProfile, setPoliceProfile] = useState<Profile | null>(null)
  const supabase = createClient()

  const loadTrip = async () => {
    const { data } = await supabase
      .from('ambulance_trips')
      .select('*, driver:profiles!ambulance_trips_driver_id_fkey(*)')
      .eq('id', tripId)
      .single()

    if (data) setTrip(data)
    setLoading(false)
  }

  const loadLogs = async () => {
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    if (data) setLogs(data)
  }

  const getPoliceProfile = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setPoliceProfile(data)
    }
  }

  useEffect(() => {
    if (!tripId) return
    loadTrip()
    loadLogs()
    getPoliceProfile()

    // Realtime update triggers for trip and logs
    const tripChannel = supabase
      .channel(`police-details-trip-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ambulance_trips',
          filter: `id=eq.${tripId}`,
        },
        () => {
          loadTrip()
        },
      )
      .subscribe()

    const logsChannel = supabase
      .channel(`police-details-logs-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_logs',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          loadLogs()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tripChannel)
      supabase.removeChannel(logsChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  // Operation Actions
  const handleRoadCleared = async () => {
    if (!trip) return
    setBusy(true)
    
    const nextRouteData = {
      ...(trip.route_data as unknown as Record<string, unknown> ?? {}),
      clearanceStatus: 'cleared',
      policeDecision: 'CLEAR_ROUTE',
      policeDecisionAt: new Date().toISOString(),
      routeState: 'CLEARED',
    }

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: 'clear',
        route_data: nextRouteData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    await supabase.from('activity_logs').insert({
      trip_id: trip.id,
      event_type: 'police_cleared',
      message: 'Police cleared traffic corridor: route is now clear.',
    })

    await supabase
      .from('police_alerts')
      .update({
        alert_status: 'resolved',
        message: 'Police successfully cleared traffic corridor.',
        updated_at: new Date().toISOString(),
      })
      .eq('trip_id', trip.id)
      .in('alert_status', ['pending', 'acknowledged'])

    await loadTrip()
    await loadLogs()
    setBusy(false)
  }

  const handleTrafficManaged = async () => {
    if (!trip) return
    setBusy(true)
    
    const nextRouteData = {
      ...(trip.route_data as unknown as Record<string, unknown> ?? {}),
      clearanceStatus: 'clearing',
      policeDecision: 'TRAFFIC_MANAGED',
      policeDecisionAt: new Date().toISOString(),
      routeState: 'MANAGED',
    }

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: 'moderate_traffic',
        route_data: nextRouteData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    await supabase.from('activity_logs').insert({
      trip_id: trip.id,
      event_type: 'police_managed',
      message: 'Police managed traffic corridor: slow but manageable.',
    })

    await supabase
      .from('police_alerts')
      .update({
        alert_status: 'resolved',
        message: 'Police managed traffic corridor.',
        updated_at: new Date().toISOString(),
      })
      .eq('trip_id', trip.id)
      .in('alert_status', ['pending', 'acknowledged'])

    await loadTrip()
    await loadLogs()
    setBusy(false)
  }

  const handleRequestReroute = async () => {
    if (!trip) return
    setBusy(true)

    // Simulate roadblock avoid point at current coordinates
    const newRoadblock = {
      id: `rb-${Date.now()}`,
      lat: trip.current_lat ?? trip.source_lat ?? 12.9716,
      lng: trip.current_lng ?? trip.source_lng ?? 77.5946,
    }

    const existingRoadblocks = (trip.route_data as unknown as Record<string, unknown> | null)?.roadblocks as any[] | undefined ?? []
    const avoidPoints = [...existingRoadblocks, newRoadblock]

    // Optimal reroute request
    const routeRes = await calculateSmartRoute({
      source: [(trip.current_lat ?? trip.source_lat ?? 12.9716) as number, (trip.current_lng ?? trip.source_lng ?? 77.5946) as number],
      destination: [(trip.dest_lat ?? 12.9716) as number, (trip.dest_lng ?? 77.5946) as number],
      avoidPoints,
      trafficLevel: 'medium',
    })

    const nextRerouteCount = ((trip.route_data as unknown as Record<string, unknown> | null)?.rerouteCount as number ?? 0) + 1

    const nextRouteData = {
      ...(trip.route_data as unknown as Record<string, unknown> ?? {}),
      waypoints: routeRes.waypoints,
      estimatedTime: routeRes.estimatedTime,
      totalDistance: routeRes.totalDistance,
      clearanceStatus: 'pending',
      policeDecision: 'REROUTE_REQUIRED',
      policeDecisionAt: new Date().toISOString(),
      routeState: 'REROUTING',
      rerouteCount: nextRerouteCount,
      roadblocks: avoidPoints,
    }

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: 'heavy_congestion',
        route_data: nextRouteData,
        eta: routeRes.estimatedTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)

    await supabase.from('activity_logs').insert({
      trip_id: trip.id,
      event_type: 'police_rerouted',
      message: `Police requested optimal route recalculation (Reroute #${nextRerouteCount}).`,
    })

    await supabase
      .from('police_alerts')
      .update({
        alert_status: 'resolved',
        message: 'Police requested route recalculation.',
        updated_at: new Date().toISOString(),
      })
      .eq('trip_id', trip.id)
      .in('alert_status', ['pending', 'acknowledged'])

    await loadTrip()
    await loadLogs()
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060e1a]">
        <RefreshCw className="h-8 w-8 animate-spin text-red-500" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 bg-[#060e1a]">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="text-sm text-muted-foreground">Ambulance trip not found.</p>
        <Button onClick={() => router.push('/police/alerts')}>Back to Alerts</Button>
      </div>
    )
  }

  const priority = priorityForTrip(trip)
  const routeData = (trip.route_data as Record<string, unknown> | null) ?? {}
  const patientName = String(routeData.patientName ?? 'Not provided')
  const emergencyType = String(routeData.emergencyType ?? 'Not provided')
  const clearance = getClearanceStatus(trip)
  const distanceRemaining = typeof routeData.totalDistance === 'number' ? routeData.totalDistance : 0

  return (
    <div className="flex h-screen flex-col bg-[#060e1a] text-foreground overflow-hidden">
      {/* Dynamic Header */}
      <header className="border-b border-white/10 bg-[#07111f]/90 px-6 py-3.5 backdrop-blur-xl shrink-0 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/police/alerts')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground cursor-pointer"
            title="Back to Alerts workspace"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Shield className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider text-red-500 block leading-none">
                Emergency Command
              </span>
              <h1 className="text-sm font-bold text-foreground mt-0.5 uppercase tracking-wide">
                Console Room · EMR-{trip.id.slice(0, 8).toUpperCase()}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-bold text-slate-200">{policeProfile?.full_name ?? 'Police Officer'}</p>
            <span className="text-[10px] text-muted-foreground font-semibold">{policeProfile?.police_station ?? 'Traffic Headquarters'}</span>
          </div>
        </div>
      </header>

      {/* Main Split Layout: 70% Map | 30% Panel */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row bg-[#060e1a]">
        
        {/* Left Side: Map Overlay (70% width) */}
        <div className="flex-1 h-full relative bg-[#060e1a] border-r border-white/10">
          <AmbulanceMap
            trips={[trip]}
            selectedTrip={trip}
            showAllTrips={false}
            className="absolute inset-0 w-full h-full"
          />

          {/* Map Overlays */}
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
            <div className="rounded-xl border border-white/10 bg-[#07111f]/85 px-3 py-2 backdrop-blur-md shadow-lg flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 animate-pulse"></span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
                GPS Feed Live
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#07111f]/85 p-3.5 backdrop-blur-md shadow-lg min-w-[200px] space-y-1.5">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Remaining ETA</span>
                <p className="text-sm font-bold text-slate-200">{trip.eta != null ? `${trip.eta} Min` : '—'}</p>
              </div>
              <div className="border-t border-white/5 pt-1.5">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Distance Remaining</span>
                <p className="text-sm font-bold text-slate-200">{distanceRemaining > 0 ? `${distanceRemaining.toFixed(2)} km` : 'Calculating...'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Command Controls & Info (30% width, min-width 380px) */}
        <div className="w-full lg:w-[400px] flex flex-col shrink-0 h-full overflow-hidden bg-[#07111f]/20">
          
          {/* Scrollable details container */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* 1. Ambulance details card */}
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Ambulance Details</h2>
              <div className="p-4 rounded-xl border border-white/10 bg-[#07111f]/45 space-y-3">
                <InfoRow icon={Ambulance} label="Ambulance ID" value={trip.ambulance_id} />
                <InfoRow icon={User} label="Driver Name" value={trip.driver?.full_name ?? 'Driver Account'} />
                <InfoRow icon={Gauge} label="Driver Status" value={trip.driver ? 'Active' : 'Offline'} />
                <InfoRow icon={Heart} label="Patient Name" value={patientName} />
                <InfoRow icon={AlertTriangle} label="Emergency Type" value={emergencyType} />
                <InfoRow icon={TrendingUp} label="Corridor Priority" value={priority} />
                
                <div className="border-t border-white/5 pt-3 space-y-2 text-xs">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Pickup location</span>
                      <p className="font-semibold text-slate-200 truncate">{trip.source}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5 min-w-0">
                    <Hospital className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Destination Hospital</span>
                      <p className="font-semibold text-slate-200 truncate">{trip.destination}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Traffic Analysis Panel */}
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Traffic Analysis</h2>
              <div className="p-4 rounded-xl border border-white/10 bg-[#07111f]/45 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Live Conditions</span>
                <span className="flex items-center gap-2">
                  {trip.route_condition === 'clear' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      🟢 Road Clear
                    </span>
                  )}
                  {trip.route_condition === 'moderate_traffic' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-bold text-yellow-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                      🟡 Moderate Traffic
                    </span>
                  )}
                  {trip.route_condition === 'heavy_congestion' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-xs font-bold text-orange-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                      🟠 Heavy Traffic
                    </span>
                  )}
                  {trip.route_condition === 'road_blocked' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-400 animate-bounce">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                      🔴 Road Blocked
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* 3. Traffic Action Buttons */}
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Traffic Actions</h2>
              <div className="space-y-2">
                <Button
                  size="default"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold cursor-pointer"
                  disabled={busy}
                  onClick={handleRoadCleared}
                >
                  Road Cleared
                </Button>
                
                <Button
                  size="default"
                  variant="secondary"
                  className="w-full bg-yellow-600/20 border border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-400 font-extrabold cursor-pointer"
                  disabled={busy}
                  onClick={handleTrafficManaged}
                >
                  Traffic Managed
                </Button>
                
                <Button
                  size="default"
                  variant="destructive"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold cursor-pointer"
                  disabled={busy}
                  onClick={handleRequestReroute}
                >
                  Request Reroute
                </Button>
              </div>
            </div>

            {/* 4. Activity Timeline */}
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Activity Timeline</h2>
              <div className="relative border-l border-white/10 ml-2 space-y-4">
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-4">No events registered yet.</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="relative pl-6">
                      <span className="absolute -left-1 flex h-2 w-2 items-center justify-center rounded-full bg-blue-500 ring-2 ring-[#060e1a]">
                        <span className="h-1 w-1 rounded-full bg-blue-300" />
                      </span>
                      <time className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </time>
                      <p className="text-xs font-semibold text-slate-200 leading-relaxed">{log.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#0c192c]/20 px-3.5 py-2.5">
      <Icon className="h-4.5 w-4.5 shrink-0 text-blue-400" />
      <div className="min-w-0 flex-1 flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-bold">
          {label}
        </span>
        <span className="text-xs font-bold text-foreground truncate pl-2">{value}</span>
      </div>
    </div>
  )
}
