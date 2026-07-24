'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
  Flag,
  Shield,
  Bell,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AmbulanceMap } from '@/components/ambulance-map'
import { StatusBadge } from '@/components/status-badge'
import { PoliceQuickActions } from '@/components/police/quick-actions'
import { TripTimeline } from '@/components/police/trip-timeline'
import {
  buildTripTimeline,
  estimateSimulatedSpeed,
  getSmartRoute,
  needsPoliceIntervention,
  priorityForTrip,
} from '@/lib/police-actions'
import type { AmbulanceTrip, Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function AmbulanceDetailsPage() {
  const params = useNextParams<{ tripId: string }>()
  const router = useNextRouter()
  const tripId = params.tripId
  const [trip, setTrip] = useState<AmbulanceTrip | null>(null)
  const [loading, setLoading] = useState(true)
  const [policeProfile, setPoliceProfile] = useState<Profile | null>(null)
  const [notifications, setNotifications] = useState<{ id: string; text: string; urgent: boolean }[]>([])
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const supabase = createClient()

  const loadTrip = async () => {
    const { data } = await supabase
      .from('ambulance_trips')
      .select('*, driver:profiles!ambulance_trips_driver_id_fkey(*)')
      .eq('id', tripId)
      .single()

    setTrip(data)
    setLoading(false)
  }

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('ambulance_trips')
      .select('*')
      .in('status', ['pending', 'in_progress'])

    if (data) {
      const list = data
        .map((t) => {
          const needsHelp = needsPoliceIntervention(t)
          if (needsHelp) {
            return { id: `${t.id}-help`, text: `${t.ambulance_id} requires assistance`, urgent: true }
          }
          const route = getSmartRoute(t)
          if (t.route_condition === 'clear' || route?.routeState === 'CLEARED') {
            return { id: `${t.id}-clear`, text: `${t.ambulance_id} route cleared`, urgent: false }
          }
          return null
        })
        .filter((n): n is { id: string; text: string; urgent: boolean } => n !== null)
      setNotifications(list)
    }
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
    loadNotifications()
    getPoliceProfile()

    const channel = supabase
      .channel(`police-trip-${tripId}`)
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
          loadNotifications()
        },
      )
      .subscribe()

    const allTripsChannel = supabase
      .channel('police-all-trips-notif')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ambulance_trips',
        },
        () => {
          loadNotifications()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(allTripsChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060e1a]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-emergency" />
          <p className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
            Loading Incident Console…
          </p>
        </div>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 bg-[#060e1a]">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="text-sm text-muted-foreground">Ambulance trip not found.</p>
        <button
          type="button"
          onClick={() => router.push('/police/dashboard')}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground hover:bg-white/10 transition-all"
        >
          Back to Control Room
        </button>
      </div>
    )
  }

  const route = getSmartRoute(trip)
  const timeline = buildTripTimeline(trip)
  const speed = estimateSimulatedSpeed(trip)
  const priority = priorityForTrip(trip)
  const needsHelp = needsPoliceIntervention(trip)

  const situationTitle = needsHelp
    ? trip.route_condition === 'road_blocked'
      ? 'Road Blocked Detected'
      : 'Heavy Traffic/Congestion Detected'
    : trip.route_condition === 'moderate_traffic'
      ? 'Moderate Traffic Alert'
      : 'Route is Clear'

  return (
    <div className="flex h-screen flex-col bg-[#060e1a] text-foreground overflow-hidden">
      <header className="z-50 border-b border-white/10 bg-[#07111f]/90 px-6 py-3.5 backdrop-blur-xl shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/police/dashboard')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Shield className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500 block leading-none">
                Emergency Console
              </span>
              <h1 className="text-sm font-black tracking-tight text-foreground mt-0.5">
                Active Incident Room
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 relative">
          <button
            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground"
          >
            <Bell className="h-4.5 w-4.5" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                {notifications.length}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifDropdown && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowNotifDropdown(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-14 top-11 z-40 w-72 rounded-2xl border border-white/10 bg-[#07111f]/95 p-4 shadow-2xl backdrop-blur-xl"
                >
                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-3">
                    Live Notifications
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 py-2">
                        No active operational alerts.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={cn(
                            'p-2.5 rounded-xl border text-xs font-semibold flex items-start gap-2',
                            n.urgent
                              ? 'border-red-500/20 bg-red-500/5 text-red-300'
                              : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full shrink-0 mt-1.5',
                              n.urgent ? 'bg-red-400 animate-pulse' : 'bg-emerald-400',
                            )}
                          />
                          <span>{n.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2.5 border-l border-white/10 pl-4">
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs uppercase shadow-[0_0_12px_rgba(59,130,246,0.1)]">
              {policeProfile?.full_name?.charAt(0) ?? 'P'}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-foreground block max-w-[100px] truncate leading-none">
                {policeProfile?.full_name ?? 'Police Officer'}
              </p>
              <span className="text-[9px] text-muted-foreground font-semibold mt-0.5 block leading-none">
                {policeProfile?.police_station ?? 'HQ Division'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden grid lg:grid-cols-[380px_1fr] xl:grid-cols-[400px_1fr] bg-[#060e1a]">
        <div className="border-r border-white/10 p-5 overflow-y-auto space-y-5 bg-[#07111f]/20">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-foreground tracking-tight uppercase">
              Operational Details
            </h2>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest',
                priority === 'Critical' && 'bg-red-500/10 text-red-400 border border-red-500/20',
                priority === 'High' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                priority === 'Normal' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
              )}
            >
              Priority: {priority}
            </span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl border border-white/10 p-4.5 bg-[#07111f]/45 space-y-3"
          >
            <InfoRow icon={Ambulance} label="Ambulance ID" value={trip.ambulance_id} />
            <InfoRow icon={User} label="Driver Name" value={trip.driver?.full_name ?? '—'} />
            <InfoRow icon={MapPin} label="Source" value={trip.source} />
            <InfoRow icon={Hospital} label="Destination Hospital" value={trip.destination} />
            <InfoRow icon={Clock} label="ETA" value={trip.eta != null ? `${trip.eta} minutes` : '—'} />
            <InfoRow icon={Gauge} label="Simulated Speed" value={`${speed} km/h`} />
            <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground/80">
                Route Status
              </span>
              <StatusBadge status={route?.routeState ?? trip.route_condition ?? trip.status} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={cn(
              'glass-card rounded-2xl border p-4.5 shadow-md',
              needsHelp
                ? 'border-red-500/25 bg-red-950/5 shadow-[0_0_15px_rgba(239,68,68,0.05)]'
                : 'border-emerald-500/25 bg-emerald-950/5',
            )}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Current Situation
            </p>
            <p className="mt-2 text-base font-bold text-foreground tracking-tight">
              {situationTitle}
            </p>
            <div className="mt-3.5 space-y-2 text-xs text-muted-foreground/90 border-t border-white/5 pt-3">
              <div className="flex justify-between">
                <span>Location:</span>
                <span className="font-bold text-foreground">
                  {trip.route_condition === 'road_blocked' ? 'Roadblock Corridor' : 'Active Route Corridor'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Delay Impact:</span>
                <span
                  className={cn(
                    'font-bold',
                    needsHelp ? 'text-red-400' : 'text-emerald-400',
                  )}
                >
                  {needsHelp ? '+5 minutes' : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Action Required:</span>
                <span
                  className={cn(
                    'font-extrabold uppercase tracking-wide',
                    needsHelp ? 'text-red-400' : 'text-emerald-400',
                  )}
                >
                  {needsHelp ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card rounded-2xl border border-white/10 p-4.5 bg-[#07111f]/45"
          >
            <AnimatePresence mode="wait">
              {!needsHelp ? (
                <motion.div
                  key="clear-state"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center"
                >
                  <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
                  <p className="mt-2 text-sm font-bold text-foreground">Route is clear</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    No police intervention required at this moment.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="action-state"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                >
                  <PoliceQuickActions trip={trip} onDone={loadTrip} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="flex-1 relative bg-[#060e1a]">
            <AmbulanceMap
              trips={[trip]}
              selectedTrip={trip}
              showAllTrips={false}
              className="absolute inset-0 w-full h-full"
            />
            <div className="absolute top-4 left-4 z-10 rounded-xl border border-white/10 bg-[#07111f]/80 px-3.5 py-2 backdrop-blur-xl shadow-lg flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 animate-pulse"></span>
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                Live GPS Stream Active
              </span>
            </div>
          </div>

          <div className="border-t border-white/10 p-5 shrink-0 bg-[#07111f]/35">
            <TripTimeline steps={timeline} />
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
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold">
          {label}
        </span>
        <span className="text-xs font-bold text-foreground truncate pl-2">{value}</span>
      </div>
    </div>
  )
}
