'use client'

import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DispatchSidebar } from '@/components/dispatch/dispatch-sidebar'
import { DispatchTopbar } from '@/components/dispatch/dispatch-topbar'
import { DispatchStatCards } from '@/components/dispatch/dispatch-stat-cards'
import { DispatchAmbulanceList, Ambulance, AmbulanceStatus } from '@/components/dispatch/dispatch-ambulance-list'
import { DispatchEmergencyQueue, EmergencyRequest } from '@/components/dispatch/dispatch-emergency-queue'
import { DispatchActivityTimeline, ActivityLog } from '@/components/dispatch/dispatch-activity-timeline'
import { AmbulanceMap } from '@/components/ambulance-map'
import { calculateSmartRoute } from '@/lib/routing'
import { createClient } from '@/lib/supabase/client'
import { BANGALORE_LOCATIONS, HOSPITALS, AmbulanceTrip } from '@/lib/types'
import { X, AlertCircle, ShieldAlert, LogIn, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import { broadcastTripNotification } from '@/lib/notifications'
import { TRIP_WORKFLOW_STATUS, normalizeTripWorkflowStatus } from '@/lib/trip-status'

// Initial Mock emergencies
const INITIAL_EMERGENCIES: EmergencyRequest[] = [
  {
    id: '501',
    pickupLocation: 'BTM Layout',
    pickupLat: 12.9166,
    pickupLng: 77.6101,
    destinationHospital: 'Apollo Hospital',
    destLat: 12.9141,
    destLng: 77.5950,
    priority: 'critical',
    timeAgo: '2m ago',
    status: 'pending',
  },
  {
    id: '502',
    pickupLocation: 'Marathahalli',
    pickupLat: 12.9591,
    pickupLng: 77.6974,
    destinationHospital: 'Fortis Hospital',
    destLat: 12.9600,
    destLng: 77.6416,
    priority: 'high',
    timeAgo: '5m ago',
    status: 'pending',
  },
  {
    id: '503',
    pickupLocation: 'Electronic City',
    pickupLat: 12.8399,
    pickupLng: 77.6770,
    destinationHospital: 'Narayana Health',
    destLat: 12.8834,
    destLng: 77.5987,
    priority: 'medium',
    timeAgo: '8m ago',
    status: 'pending',
  },
  {
    id: '504',
    pickupLocation: 'Yelahanka',
    pickupLat: 13.1007,
    pickupLng: 77.5963,
    destinationHospital: 'Columbia Asia Hospital',
    destLat: 12.9698,
    destLng: 77.7499,
    priority: 'low',
    timeAgo: '12m ago',
    status: 'pending',
  },
]

// Fallback mock drivers if profiles table is empty
const MOCK_FALLBACK_DRIVERS = [
  { id: 'mock-d1', full_name: 'Rajesh Kumar', email: 'rajesh@ambulance.com' },
  { id: 'mock-d2', full_name: 'Amit Sharma', email: 'amit@ambulance.com' },
  { id: 'mock-d3', full_name: 'Priya Patel', email: 'priya@ambulance.com' },
  { id: 'mock-d4', full_name: 'Sneha Reddy', email: 'sneha@ambulance.com' },
]

const getStoredEmergencies = (): EmergencyRequest[] => {
  if (typeof window === 'undefined') return INITIAL_EMERGENCIES

  try {
    const saved = window.localStorage.getItem('dispatch-emergencies')
    if (!saved) return INITIAL_EMERGENCIES

    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // fall back to seeded data
  }

  return INITIAL_EMERGENCIES
}

const persistEmergencies = (emergencies: EmergencyRequest[]) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem('dispatch-emergencies', JSON.stringify(emergencies))
  } catch {
    // ignore persistence failures
  }
}

export default function DispatchDashboard() {
  const [activeSection, setActiveSection] = useState('control-room')
  const [ambulances, setAmbulances] = useState<Ambulance[]>([])
  const [emergencies, setEmergencies] = useState<EmergencyRequest[]>(getStoredEmergencies)
  const [logs, setLogs] = useState<ActivityLog[]>([])

  // Supabase states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Map-related state
  const [trips, setTrips] = useState<AmbulanceTrip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<AmbulanceTrip | null>(null)

  // Modal-related state
  const [assigningEmergency, setAssigningEmergency] = useState<EmergencyRequest | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreatingEmergency, setIsCreatingEmergency] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    emergencyType: '',
    patientName: '',
    pickupLocation: '',
    destinationHospital: '',
    notes: '',
    priority: 'critical' as EmergencyRequest['priority'],
  })

  const supabase = createClient()

  const resetCreateForm = useCallback(() => {
    setCreateForm({
      emergencyType: '',
      patientName: '',
      pickupLocation: '',
      destinationHospital: '',
      notes: '',
      priority: 'critical',
    })
  }, [])

  const getCoordinatesForRequest = useCallback((pickupLocation: string, destinationHospital: string) => {
    const pickupMatch = BANGALORE_LOCATIONS.find((place) => place.name.toLowerCase() === pickupLocation.trim().toLowerCase())
    const hospitalMatch = HOSPITALS.find((hospital) => hospital.name.toLowerCase() === destinationHospital.trim().toLowerCase())

    return {
      pickupLat: pickupMatch?.lat ?? 12.9716,
      pickupLng: pickupMatch?.lng ?? 77.6412,
      destLat: hospitalMatch?.lat ?? 12.9592,
      destLng: hospitalMatch?.lng ?? 77.6489,
    }
  }, [])

  // Load drivers & active trips from Supabase
  const loadData = useCallback(async () => {
    // Check Auth
    const { data: { user } } = await supabase.auth.getUser()
    setIsAuthenticated(!!user)
    setUserEmail(user?.email ?? null)

    // Load registered driver profiles
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'driver')

    const dbDrivers = profilesData && profilesData.length > 0 ? profilesData : MOCK_FALLBACK_DRIVERS

    // Load active trips
    const { data: tripsData } = await supabase
      .from('ambulance_trips')
      .select('*, driver:profiles!ambulance_trips_driver_id_fkey(*)')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })

    const activeTrips = tripsData || []

    // Map Bangalore locations based on index to distribute available drivers
    const mappedAmbulances: Ambulance[] = dbDrivers.map((driver, index) => {
      // Check if driver has an active trip
      const activeTrip = activeTrips.find((t) => t.driver_id === driver.id)
      const locationPreset = BANGALORE_LOCATIONS[index % BANGALORE_LOCATIONS.length]

      const ambId = `AMB-${driver.full_name.substring(0, 3).toUpperCase()}-${driver.id.substring(0, 3).toUpperCase()}`

      if (activeTrip) {
        const tripRouteData = (activeTrip.route_data as any) || {}
        const status = normalizeTripWorkflowStatus(tripRouteData.status || TRIP_WORKFLOW_STATUS.assigned)
        const clearanceStatus = tripRouteData.clearanceStatus as 'pending' | 'clearing' | 'cleared' | undefined

        return {
          id: activeTrip.ambulance_id || ambId,
          driverName: driver.full_name,
          status: status as any, // Cast to any to accept new lifecycle strings
          locationName: activeTrip.source || locationPreset.name,
          lat: activeTrip.current_lat ?? activeTrip.source_lat ?? locationPreset.lat,
          lng: activeTrip.current_lng ?? activeTrip.source_lng ?? locationPreset.lng,
          eta: activeTrip.eta ?? undefined,
          clearanceStatus,
        }
      }

      return {
        id: ambId,
        driverName: driver.full_name,
        status: TRIP_WORKFLOW_STATUS.available as any,
        locationName: locationPreset.name,
        lat: locationPreset.lat,
        lng: locationPreset.lng,
      }
    })

    setAmbulances(mappedAmbulances)

    // Set trips for Leaflet map to show active routes
    const mapTrips = mappedAmbulances.map((amb) => {
      const activeTrip = activeTrips.find((t) => t.ambulance_id === amb.id || t.driver_id === amb.id)

      return {
        id: activeTrip?.id || `trip-${amb.id}`,
        ambulance_id: amb.id,
        driver_id: activeTrip?.driver_id || amb.id,
        source: activeTrip?.source || amb.locationName,
        destination: activeTrip?.destination || '',
        source_lat: activeTrip?.source_lat ?? null,
        source_lng: activeTrip?.source_lng ?? null,
        dest_lat: activeTrip?.dest_lat ?? null,
        dest_lng: activeTrip?.dest_lng ?? null,
        current_lat: amb.lat,
        current_lng: amb.lng,
        status: activeTrip?.status || 'completed',
        route_condition: activeTrip?.route_condition || 'clear',
        route_data: activeTrip?.route_data || null,
        is_offline: amb.status === 'offline',
        created_at: activeTrip?.created_at || new Date().toISOString(),
        updated_at: activeTrip?.updated_at || new Date().toISOString(),
        driver: {
          id: amb.id,
          full_name: amb.driverName,
          email: '',
          role: 'driver',
          created_at: new Date().toISOString(),
        },
      } as AmbulanceTrip
    })

    setTrips(mapTrips)

    // Focus map on the selected trip if it's still active
    if (selectedTrip) {
      const currentActiveSelected = activeTrips.find((t) => t.id === selectedTrip.id)
      if (currentActiveSelected) {
        setSelectedTrip(currentActiveSelected)
      } else {
        setSelectedTrip(null)
      }
    }

    // Load recent activity logs from active trips
    const generatedLogs: ActivityLog[] = []
    activeTrips.forEach((trip) => {
      const timeStr = new Date(trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      
      generatedLogs.push({
        id: `log-${trip.id}-assigned`,
        type: 'assigned',
        ambulanceId: trip.ambulance_id,
        driverName: trip.driver?.full_name || 'Driver',
        location: trip.source,
        timestamp: timeStr,
        message: `Ambulance assigned to incident at ${trip.source}`,
      })

      if (trip.status === 'in_progress') {
        generatedLogs.push({
          id: `log-${trip.id}-accepted`,
          type: 'accepted',
          ambulanceId: trip.ambulance_id,
          driverName: trip.driver?.full_name || 'Driver',
          timestamp: timeStr,
          message: `Driver accepted dispatch`,
        })
      }
    })
    setLogs(generatedLogs)

    try {
      const { data: emergencyRows, error: emergencyError } = await supabase
        .from('emergency_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (!emergencyError && emergencyRows && emergencyRows.length > 0) {
        const normalizedEmergencies = emergencyRows.map((row: any) => ({
          id: String(row.id ?? `REQ-${Math.random().toString(36).slice(2, 8)}`),
          pickupLocation: row.pickup_location ?? row.pickupLocation ?? 'Unknown location',
          pickupLat: Number(row.pickup_lat ?? row.pickupLat ?? 12.9716),
          pickupLng: Number(row.pickup_lng ?? row.pickupLng ?? 77.6412),
          destinationHospital: row.destination_hospital ?? row.destinationHospital ?? 'Apollo Hospital',
          destLat: Number(row.dest_lat ?? row.destLat ?? 12.9141),
          destLng: Number(row.dest_lng ?? row.destLng ?? 77.595),
          priority: (row.priority ?? 'critical') as EmergencyRequest['priority'],
          timeAgo: row.created_at ? 'Recently created' : 'Just now',
          status: (row.status ?? 'pending') as EmergencyRequest['status'],
          patientName: row.patient_name ?? row.patientName,
          notes: row.notes,
          emergencyType: row.emergency_type ?? row.emergencyType,
          createdAt: row.created_at,
        }))

        setEmergencies(normalizedEmergencies)
        persistEmergencies(normalizedEmergencies)
      } else {
        const storedEmergencies = getStoredEmergencies()
        setEmergencies(storedEmergencies)
        persistEmergencies(storedEmergencies)
      }
    } catch {
      const storedEmergencies = getStoredEmergencies()
      setEmergencies(storedEmergencies)
      persistEmergencies(storedEmergencies)
    }

    setLoading(false)
  }, [supabase, selectedTrip])

  // Setup database real-time subscription
  useEffect(() => {
    loadData()

    const channel = supabase
      .channel('dispatch-dashboard-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulance_trips' },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData, supabase])

  // Assign ambulance in Supabase
  const handleAssign = async (driverName: string) => {
    if (!assigningEmergency) return

    // Find the ambulance/driver card selected
    const selectedAmb = ambulances.find((a) => a.driverName === driverName && (a.status as string) === TRIP_WORKFLOW_STATUS.available)
    if (!selectedAmb) return
 
    // Find the actual driver profile ID from database or mock ID
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('full_name', driverName)
      .eq('role', 'driver')
      .single()
 
    const driverId = profiles?.id || selectedAmb.id
 
    const pickupLoc = assigningEmergency.pickupLocation
    const destHospital = assigningEmergency.destinationHospital
 
    // 1. Calculate route coordinates
    const routeRes = await calculateSmartRoute({
      source: [selectedAmb.lat, selectedAmb.lng],
      destination: [assigningEmergency.destLat, assigningEmergency.destLng],
      trafficLevel: 'medium',
    })
 
    // 2. Insert into Supabase
    const { data: insertedTrip, error: insertError } = await supabase
      .from('ambulance_trips')
      .insert({
        driver_id: driverId,
        ambulance_id: selectedAmb.id,
        source: pickupLoc,
        destination: destHospital,
        source_lat: assigningEmergency.pickupLat,
        source_lng: assigningEmergency.pickupLng,
        dest_lat: assigningEmergency.destLat,
        dest_lng: assigningEmergency.destLng,
        current_lat: selectedAmb.lat,
        current_lng: selectedAmb.lng,
        status: 'pending',
        eta: routeRes.estimatedTime,
        distance: routeRes.totalDistance,
        route_condition: 'clear',
        route_data: {
          ...routeRes,
          status: TRIP_WORKFLOW_STATUS.assigned,
          priority: assigningEmergency.priority,
        },
      })
      .select()
      .single()

    if (insertError) {
      alert(`Supabase Insert Error: ${insertError.message}`)
      return
    }

    await broadcastTripNotification(supabase, {
      event_type: 'dispatch_assigned',
      driver_id: driverId,
      pickup: pickupLoc,
      destination: destHospital,
      priority: assigningEmergency.priority,
      ambulanceId: selectedAmb.id,
      eta: routeRes.estimatedTime,
      trip_id: insertedTrip?.id,
    })

    // Remove emergency from simulated local queue
    setEmergencies((prev) => prev.filter((e) => e.id !== assigningEmergency.id))
    setAssigningEmergency(null)
    loadData()
  }

  const handleCreateEmergency = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!createForm.emergencyType.trim() || !createForm.pickupLocation.trim() || !createForm.destinationHospital.trim() || !createForm.patientName.trim()) {
      setCreateError('Please complete the emergency type, patient name, pickup location, and destination hospital fields.')
      return
    }

    setIsCreatingEmergency(true)
    setCreateError(null)

    const coordinates = getCoordinatesForRequest(createForm.pickupLocation, createForm.destinationHospital)
    const newEmergency: EmergencyRequest = {
      id: `REQ-${Date.now().toString().slice(-6)}`,
      pickupLocation: createForm.pickupLocation.trim(),
      pickupLat: coordinates.pickupLat,
      pickupLng: coordinates.pickupLng,
      destinationHospital: createForm.destinationHospital.trim(),
      destLat: coordinates.destLat,
      destLng: coordinates.destLng,
      priority: createForm.priority,
      timeAgo: 'Just now',
      status: 'pending',
      patientName: createForm.patientName.trim(),
      notes: createForm.notes.trim(),
      emergencyType: createForm.emergencyType.trim(),
      createdAt: new Date().toISOString(),
    }

    const optimisticEmergencies = [newEmergency, ...emergencies]
    setEmergencies(optimisticEmergencies)
    persistEmergencies(optimisticEmergencies)

    try {
      const { error } = await supabase.from('emergency_requests').insert({
        pickup_location: newEmergency.pickupLocation,
        pickup_lat: newEmergency.pickupLat,
        pickup_lng: newEmergency.pickupLng,
        destination_hospital: newEmergency.destinationHospital,
        dest_lat: newEmergency.destLat,
        dest_lng: newEmergency.destLng,
        priority: newEmergency.priority,
        status: newEmergency.status,
        patient_name: newEmergency.patientName,
        notes: newEmergency.notes,
        emergency_type: newEmergency.emergencyType,
        created_at: newEmergency.createdAt,
      }).select('*').single()

      if (error) {
        const isMissingTableError = error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation')
        if (!isMissingTableError) {
          setCreateError(error.message)
          setEmergencies(emergencies)
          persistEmergencies(emergencies)
          setIsCreatingEmergency(false)
          return
        }
      }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Unable to save emergency request right now.')
      setEmergencies(emergencies)
      persistEmergencies(emergencies)
      setIsCreatingEmergency(false)
      return
    }

    resetCreateForm()
    setIsCreateModalOpen(false)
    setIsCreatingEmergency(false)
    await loadData()
  }

  // Count metrics
  const availableCount = ambulances.filter((a) => (a.status as string) === TRIP_WORKFLOW_STATUS.available).length
  const activeCount = ambulances.filter((a) => (a.status as string) !== TRIP_WORKFLOW_STATUS.available && (a.status as string) !== 'offline').length
  const pendingCount = emergencies.filter((e) => e.status === 'pending').length
  const avgResponseTime = 8.2

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#060e1a]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent"></div>
          <span className="font-bold text-sm tracking-wider uppercase">Loading Dispatch Operations...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#060e1a] text-foreground">
      {/* Sidebar navigation */}
      <DispatchSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* Main page content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <DispatchTopbar pendingCount={pendingCount} />

        <main className="relative flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {/* Subtle glowing elements */}
          <div className="pointer-events-none absolute inset-0 z-0">
            <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-primary/5 blur-[90px]" />
            <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-emergency/5 blur-[100px]" />
          </div>

          <div className="relative z-10 space-y-6">
            {/* Show authentication warning if dispatcher is not logged in */}
            {!isAuthenticated && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-md shadow-lg">
                <div className="flex items-center gap-3 text-left">
                  <ShieldAlert className="h-6 w-6 text-red-500 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-red-400">Database Operations Restricted</h4>
                    <p className="text-xs text-muted-foreground">You are currently unauthenticated. Supabase Row-Level Security (RLS) restricts dispatching trips until signed in.</p>
                  </div>
                </div>
                <Button asChild size="sm" className="bg-red-600 text-white font-semibold hover:bg-red-700">
                  <Link href="/auth/login" className="flex items-center gap-1.5">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Link>
                </Button>
              </div>
            )}

            {/* Render views conditionally based on sidebar selection */}
            {activeSection === 'control-room' && (
              <>
                {/* Statistics Row */}
                <DispatchStatCards
                  availableCount={availableCount}
                  activeCount={activeCount}
                  pendingCount={pendingCount}
                  avgResponseTime={avgResponseTime}
                />

                {/* Layout Grid */}
                <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                  {/* Left Column: Live Map & Activity logs */}
                  <div className="space-y-6 flex flex-col">
                    <div className="glass-card flex flex-col rounded-2xl border border-white/10 bg-[#07111f]/60 overflow-hidden shadow-lg h-[460px]">
                      <div className="p-4 border-b border-white/10 flex items-center justify-between">
                        <h3 className="font-bold text-foreground tracking-wide flex items-center gap-2">
                          Live Incident & Fleet Tracking Map
                        </h3>
                        {selectedTrip && (
                          <button
                            onClick={() => setSelectedTrip(null)}
                            className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 px-2 py-0.5 rounded-lg hover:bg-red-500/20"
                          >
                            Reset Map Focus
                          </button>
                        )}
                      </div>
                      <div className="flex-1 relative">
                        <AmbulanceMap
                          trips={trips}
                          selectedTrip={selectedTrip}
                          className="h-full w-full absolute inset-0"
                        />
                      </div>
                    </div>

                    <DispatchActivityTimeline logs={logs} />
                  </div>

                  {/* Right Column: Queue & Fleet */}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Emergency Intake</h3>
                          <p className="text-xs text-muted-foreground">Log a new request and push it into the active dispatch queue.</p>
                        </div>
                        <Button
                          onClick={() => {
                            resetCreateForm()
                            setCreateError(null)
                            setIsCreateModalOpen(true)
                          }}
                          size="sm"
                          className="rounded-lg bg-red-600 text-white hover:bg-red-700"
                        >
                          <Plus className="mr-1.5 h-4 w-4" />
                          Create Emergency
                        </Button>
                      </div>

                      <DispatchEmergencyQueue
                        emergencies={emergencies}
                        onAssignAmbulance={(req) => setAssigningEmergency(req)}
                      />
                    </div>

                    <DispatchAmbulanceList
                      ambulances={ambulances}
                      selectedAmbulanceId={selectedTrip?.ambulance_id}
                      onSelectAmbulance={(amb) => {
                        const matchTrip = trips.find((t) => t.ambulance_id === amb.id)
                        if (matchTrip) {
                          setSelectedTrip(matchTrip)
                        }
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {activeSection === 'radio' && (
              <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-6 space-y-6 shadow-lg max-w-4xl">
                <div>
                  <h2 className="text-xl font-bold text-foreground tracking-wide">Radio Frequency Control</h2>
                  <p className="text-xs text-muted-foreground mt-1">Monitor active emergency radio streams and dispatch channels.</p>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-300">Active Broadcasters</h3>
                    <div className="space-y-2">
                      {[
                        { name: 'Channel Alpha - Primary Dispatch', freq: '154.280 MHz', active: true },
                        { name: 'Channel Beta - EMS Medical Traffic', freq: '155.340 MHz', active: true },
                        { name: 'Channel Gamma - Police Link', freq: '155.475 MHz', active: false },
                      ].map((ch, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-xl">
                          <div>
                            <div className="text-xs font-bold text-foreground">{ch.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{ch.freq}</div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            ch.active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-muted-foreground border-white/10'
                          }`}>
                            {ch.active ? 'LIVE LINK' : 'STANDBY'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between p-4 bg-black/30 border border-white/10 rounded-2xl h-52">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Frequency Visualizer</div>
                    <div className="flex items-end justify-center gap-1.5 h-28 pb-2">
                      {[30, 60, 45, 80, 95, 40, 65, 85, 30, 50, 75, 90, 45, 60].map((h, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: [`${h * 0.4}%`, `${h}%`, `${h * 0.4}%`] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.08, ease: 'easeInOut' }}
                          className="w-2 rounded-t bg-emerald-500/60"
                        />
                      ))}
                    </div>
                    <div className="text-center font-mono text-xs text-emerald-400 font-bold tracking-widest animate-pulse">
                      SECURE AES-256 CHANNEL ACTIVE
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'incidents' && (
              <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-6 space-y-6 shadow-lg max-w-4xl">
                <div>
                  <h2 className="text-xl font-bold text-foreground tracking-wide">Historical Incident log</h2>
                  <p className="text-xs text-muted-foreground mt-1">Detailed review of all dispatched and resolved incidents in this shift.</p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.01]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-muted-foreground font-bold">
                        <th className="p-3">Incident ID</th>
                        <th className="p-3">Pickup</th>
                        <th className="p-3">Hospital</th>
                        <th className="p-3">Ambulance</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Resolved At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { id: 'REQ-498', pickup: 'Indiranagar', hospital: 'Columbia Asia', unit: 'AMB-103', status: 'Resolved', time: '22:45' },
                        { id: 'REQ-497', pickup: 'HSR Layout', hospital: 'Narayana Health', unit: 'AMB-106', status: 'Resolved', time: '22:12' },
                        { id: 'REQ-496', pickup: 'Koramangala', hospital: 'Manipal Hospital', unit: 'AMB-101', status: 'Resolved', time: '21:30' },
                      ].map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 text-slate-300">
                          <td className="p-3 font-mono font-bold text-slate-400">{item.id}</td>
                          <td className="p-3">{item.pickup}</td>
                          <td className="p-3">{item.hospital}</td>
                          <td className="p-3 font-mono">{item.unit}</td>
                          <td className="p-3">
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                              {item.status}
                            </span>
                          </td>
                          <td className="p-3 text-right text-muted-foreground font-mono">{item.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeSection === 'settings' && (
              <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-6 space-y-6 shadow-lg max-w-2xl">
                <div>
                  <h2 className="text-xl font-bold text-foreground tracking-wide">System Settings</h2>
                  <p className="text-xs text-muted-foreground mt-1">Configure telemetry interfaces, automation rules, and UI presets.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-foreground">Auto-Assign Nearest Unit</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Use algorithm to assign nearest ambulance to incident.</div>
                    </div>
                    <div className="h-6 w-11 rounded-full bg-white/15 p-1 cursor-pointer flex items-center justify-end">
                      <div className="h-4 w-4 rounded-full bg-red-500" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-foreground">GPS Refresh Interval</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Adjust device tracking refresh intervals.</div>
                    </div>
                    <select className="bg-black/30 border border-white/10 text-foreground text-xs rounded-lg p-1.5 outline-none">
                      <option>1 Second (Realtime)</option>
                      <option>5 Seconds</option>
                      <option>15 Seconds</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Emergency Creation Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl bg-[#07111f] border border-white/15 rounded-2xl shadow-2xl p-6 text-foreground space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-foreground">Create New Emergency</h3>
                  <p className="text-xs text-muted-foreground mt-1">Capture the request details so dispatch can assign the nearest unit quickly.</p>
                </div>
                <button
                  onClick={() => {
                    setIsCreateModalOpen(false)
                    setCreateError(null)
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleCreateEmergency}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emergency Type</label>
                    <Input
                      required
                      value={createForm.emergencyType}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, emergencyType: event.target.value }))}
                      placeholder="Trauma, Cardiac, etc."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient Name</label>
                    <Input
                      required
                      value={createForm.patientName}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, patientName: event.target.value }))}
                      placeholder="Patient name"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pickup Location</label>
                    <Input
                      required
                      value={createForm.pickupLocation}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, pickupLocation: event.target.value }))}
                      placeholder="BTM Layout"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination Hospital</label>
                    <Input
                      required
                      value={createForm.destinationHospital}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, destinationHospital: event.target.value }))}
                      placeholder="Apollo Hospital"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority</label>
                    <select
                      value={createForm.priority}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value as EmergencyRequest['priority'] }))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground outline-none"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
                    <Textarea
                      value={createForm.notes}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
                      placeholder="Add any operational context"
                      className="min-h-9"
                    />
                  </div>
                </div>

                {createError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    {createError}
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 rounded-lg text-xs font-semibold hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setIsCreateModalOpen(false)
                      setCreateError(null)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="h-8 rounded-lg bg-red-600 text-white hover:bg-red-700" disabled={isCreatingEmergency}>
                    {isCreatingEmergency ? 'Creating…' : 'Save Emergency'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Assignment Modal Pop-up */}
      <AnimatePresence>
        {assigningEmergency && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[#07111f] border border-white/15 rounded-2xl shadow-2xl p-6 text-foreground space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <AlertCircle className="text-red-500 h-5 w-5" />
                  Assign Dispatch Unit
                </h3>
                <button
                  onClick={() => setAssigningEmergency(null)}
                  className="rounded-lg border border-white/10 bg-white/5 p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5 text-xs text-muted-foreground">
                <div>
                  <span className="font-bold text-slate-300">Incident Code:</span> REQ-{assigningEmergency.id} ({assigningEmergency.priority.toUpperCase()})
                </div>
                <div>
                  <span className="font-bold text-slate-300">Pickup Location:</span> {assigningEmergency.pickupLocation}
                </div>
                <div>
                  <span className="font-bold text-slate-300">Target Hospital:</span> {assigningEmergency.destinationHospital}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Available Fleet Units</h4>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {ambulances.filter((a) => a.status === 'available').map((amb) => (
                    <div
                      key={amb.id}
                      onClick={() => handleAssign(amb.driverName)}
                      className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-lg hover:bg-emerald-500/10 hover:border-emerald-500/30 cursor-pointer transition-all duration-150"
                    >
                      <div>
                        <div className="font-mono text-xs font-bold text-foreground">{amb.id}</div>
                        <div className="text-[10px] text-muted-foreground">{amb.driverName} • {amb.locationName}</div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        Dispatch
                      </span>
                    </div>
                  ))}
                  {ambulances.filter((a) => a.status === 'available').length === 0 && (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No units available in this shift.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-white/5">
                <Button
                  onClick={() => setAssigningEmergency(null)}
                  variant="ghost"
                  className="h-8 rounded-lg text-xs font-semibold hover:bg-white/5 text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
