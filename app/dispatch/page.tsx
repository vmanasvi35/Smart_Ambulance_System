'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DispatchSidebar } from '@/components/dispatch/dispatch-sidebar'
import { DispatchTopbar } from '@/components/dispatch/dispatch-topbar'
import { DispatchStatCards } from '@/components/dispatch/dispatch-stat-cards'
import { DispatchAmbulanceList, Ambulance, isAmbulanceAvailable } from '@/components/dispatch/dispatch-ambulance-list'
import { DispatchEmergencyQueue, EmergencyRequest } from '@/components/dispatch/dispatch-emergency-queue'
import { DispatchActivityTimeline, ActivityLog } from '@/components/dispatch/dispatch-activity-timeline'
import { AmbulanceMap } from '@/components/ambulance-map'
import { calculateSmartRoute, findNearestHospital, calculateDistance } from '@/lib/routing'
import { createClient } from '@/lib/supabase/client'
import { BANGALORE_LOCATIONS, HOSPITALS, AmbulanceTrip } from '@/lib/types'
import { ensureUserProfile } from '@/lib/profiles'
import {
  generateIncidentId,
  normalizeTemplatePriority,
  pickRandomEmergencyTemplate,
} from '@/lib/emergency-templates'
import { X, AlertCircle, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { broadcastTripNotification } from '@/lib/notifications'
import { TRIP_WORKFLOW_STATUS, normalizeTripWorkflowStatus } from '@/lib/trip-status'
import { fetchRecentActivity, formatActivityClock } from '@/lib/activity-logs'
import {
  formatGpsRefreshInterval,
  getStoredGpsRefreshInterval,
  GPS_REFRESH_INTERVAL_STORAGE_KEY,
  GPS_REFRESH_INTERVALS,
  type GpsRefreshInterval,
} from '@/lib/dispatch-settings'

const MAPPED_HOSPITALS = HOSPITALS.map((hospital) => ({
  name: hospital.name,
  lat: hospital.lat,
  lng: hospital.lng,
}))

export default function DispatchDashboard() {
  const [activeSection, setActiveSection] = useState('control-room')
  const [ambulances, setAmbulances] = useState<Ambulance[]>([])
  const [emergencies, setEmergencies] = useState<EmergencyRequest[]>([])
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [gpsRefreshInterval, setGpsRefreshInterval] = useState<GpsRefreshInterval>(getStoredGpsRefreshInterval)

  // Supabase states
  const [loading, setLoading] = useState(true)

  // Map-related state
  const [trips, setTrips] = useState<AmbulanceTrip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<AmbulanceTrip | null>(null)
  const [assignmentPreviewTrip, setAssignmentPreviewTrip] = useState<AmbulanceTrip | null>(null)
  const selectedTripIdRef = useRef<string | null>(null)

  // Modal-related state
  const [assigningEmergency, setAssigningEmergency] = useState<EmergencyRequest | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)
  const [isCreatingEmergency, setIsCreatingEmergency] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [ambulanceEtas, setAmbulanceEtas] = useState<Record<string, number>>({})
  const [incidents, setIncidents] = useState<any[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null)
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    selectedTripIdRef.current = selectedTrip?.id ?? null
  }, [selectedTrip])

  // Load drivers & active trips from Supabase
  const loadData = useCallback(async () => {
    // Load current user profile (dispatcher)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { profile, error: profileError } = await ensureUserProfile(supabase, user)
      if (profileError) {
        console.error('Failed to ensure user profile:', profileError)
      }
      if (profile) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()
        if (profileData) {
          setCurrentUserProfile(profileData)
        }
      }
    }

    // Load registered driver profiles (authenticated drivers only)
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'driver')

    const dbDrivers = profilesData ?? []

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
          status,
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
        status: TRIP_WORKFLOW_STATUS.available,
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
        status: activeTrip?.status || (amb.status === TRIP_WORKFLOW_STATUS.available ? 'available' : 'completed'),
        route_condition: activeTrip?.route_condition || 'clear',
        route_data: activeTrip?.route_data || { status: amb.status },
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

    // Keep map focus stable across refreshes (avoid selectedTrip dependency loops)
    const focusedId = selectedTripIdRef.current
    if (focusedId) {
      const currentActiveSelected =
        activeTrips.find((t) => t.id === focusedId) ??
        mapTrips.find((t) => t.id === focusedId && t.status !== 'completed') ??
        null
      setSelectedTrip(currentActiveSelected)
    }

    const activityRows = await fetchRecentActivity(supabase, 20)
    setLogs(
      activityRows.map((row) => {
        const event = row.event_type
        const type: ActivityLog['type'] =
          event.includes('accepted')
            ? 'accepted'
            : event.includes('onboard') || event.includes('pickup')
              ? 'picked_up'
              : event.includes('completed') || event.includes('hospital')
                ? 'completed'
                : event.includes('en_route')
                  ? 'reached'
                  : 'assigned'

        return {
          id: row.id,
          type,
          ambulanceId: row.ambulance_id ?? '—',
          driverName: String(row.metadata?.driverName ?? 'System'),
          location: undefined,
          timestamp: formatActivityClock(row.created_at),
          message: row.message,
        }
      }),
    )

    const { data: emergencyRows, error: emergencyError } = await supabase
      .from('emergency_requests')
      .select('*')
      .in('status', ['pending'])
      .order('created_at', { ascending: false })

    if (!emergencyError && emergencyRows) {
      const normalizedEmergencies = emergencyRows.map((row: any) => ({
        id: String(row.id),
        incidentId: row.incident_id ?? undefined,
        pickupLocation: row.pickup_location ?? 'Unknown location',
        pickupLat: Number(row.pickup_lat ?? 12.9716),
        pickupLng: Number(row.pickup_lng ?? 77.6412),
        destinationHospital: row.destination_hospital ?? 'Apollo Hospital',
        destLat: Number(row.dest_lat ?? 12.9141),
        destLng: Number(row.dest_lng ?? 77.595),
        priority: (row.priority ?? 'critical') as EmergencyRequest['priority'],
        timeAgo: row.created_at ? 'Recently created' : 'Just now',
        status: (row.status ?? 'pending') as EmergencyRequest['status'],
        patientName: row.patient_name ?? undefined,
        age: row.age ?? undefined,
        notes: row.notes ?? undefined,
        emergencyType: row.emergency_type ?? undefined,
        createdAt: row.created_at,
        eta: row.eta ?? undefined,
        distance: row.distance ?? undefined,
      }))
      setEmergencies(normalizedEmergencies)
    } else {
      setEmergencies([])
    }

    const { data: incidentRows } = await supabase
      .from('emergency_requests')
      .select(`
        id,
        incident_id,
        pickup_location,
        destination_hospital,
        status,
        created_at,
        updated_at,
        assigned_trip_id,
        trip:ambulance_trips(
          id,
          ambulance_id,
          status,
          updated_at
        )
      `)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })

    if (incidentRows) {
      setIncidents(incidentRows)
    } else {
      setIncidents([])
    }

    setLoading(false)
  }, [supabase])

  // Setup database real-time subscription
  useEffect(() => {
    loadData()

    const tripsChannel = supabase
      .channel('dispatch-dashboard-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulance_trips' },
        () => {
          loadData()
        },
      )
      .subscribe()

    const emergenciesChannel = supabase
      .channel('dispatch-dashboard-emergencies')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_requests' },
        () => {
          loadData()
        },
      )
      .subscribe()

    const activityChannel = supabase
      .channel('dispatch-dashboard-activity')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_logs' },
        () => {
          loadData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tripsChannel)
      supabase.removeChannel(emergenciesChannel)
      supabase.removeChannel(activityChannel)
    }
  }, [loadData, supabase])

  useEffect(() => {
    window.localStorage.setItem(GPS_REFRESH_INTERVAL_STORAGE_KEY, String(gpsRefreshInterval))
    window.dispatchEvent(new StorageEvent('storage', {
      key: GPS_REFRESH_INTERVAL_STORAGE_KEY,
      newValue: String(gpsRefreshInterval),
    }))
  }, [gpsRefreshInterval])

  // Assign ambulance in Supabase — exactly one ambulance per emergency
  const handleAssign = async (driverName: string) => {
    if (!assigningEmergency || isAssigning) return

    const emergencyId = assigningEmergency.id
    const selectedAmb = ambulances.find((a) => a.driverName === driverName && isAmbulanceAvailable(a))
    if (!selectedAmb) return

    setIsAssigning(true)
    setAssignError(null)

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('full_name', driverName)
        .eq('role', 'driver')
        .maybeSingle()

      if (!profile?.id) {
        throw new Error('Selected driver is not a registered authenticated account.')
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        emergencyId,
      )
      if (!isUuid) {
        throw new Error('Invalid emergency record. Create a new emergency and try again.')
      }

      // Claim the emergency first so a second dispatch cannot race
      const { data: claimed, error: claimError } = await supabase
        .from('emergency_requests')
        .update({
          status: 'assigned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', emergencyId)
        .eq('status', 'pending')
        .is('assigned_trip_id', null)
        .select('id')
        .maybeSingle()

      if (claimError) {
        throw new Error(claimError.message)
      }

      if (!claimed) {
        throw new Error('This emergency is already assigned to an ambulance.')
      }

      // Guard against an existing active trip for this emergency
      const { data: existingTrip } = await supabase
        .from('ambulance_trips')
        .select('id, ambulance_id')
        .eq('emergency_id', emergencyId)
        .in('status', ['pending', 'in_progress'])
        .maybeSingle()

      if (existingTrip) {
        await supabase
          .from('emergency_requests')
          .update({
            status: 'assigned',
            assigned_trip_id: existingTrip.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', emergencyId)

        throw new Error(`Already assigned to ${existingTrip.ambulance_id}.`)
      }

      const routeRes = await calculateSmartRoute({
        source: [selectedAmb.lat, selectedAmb.lng],
        destination: [assigningEmergency.destLat, assigningEmergency.destLng],
        trafficLevel: 'medium',
      })

      const { data: insertedTrip, error: insertError } = await supabase
        .from('ambulance_trips')
        .insert({
          driver_id: profile.id,
          ambulance_id: selectedAmb.id,
          emergency_id: emergencyId,
          source: assigningEmergency.pickupLocation,
          destination: assigningEmergency.destinationHospital,
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
        // Release claim so dispatcher can retry if trip creation failed
        await supabase
          .from('emergency_requests')
          .update({
            status: 'pending',
            assigned_trip_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', emergencyId)
          .eq('status', 'assigned')

        const alreadyTaken =
          insertError.code === '23505' ||
          insertError.message.toLowerCase().includes('duplicate') ||
          insertError.message.toLowerCase().includes('unique')

        throw new Error(
          alreadyTaken
            ? 'This emergency was just assigned to another ambulance.'
            : insertError.message,
        )
      }

      await supabase
        .from('emergency_requests')
        .update({
          status: 'assigned',
          assigned_trip_id: insertedTrip?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', emergencyId)

      // Optimistically remove from pending queue
      setEmergencies((prev) =>
        prev.map((emergency) =>
          emergency.id === emergencyId
            ? {
              ...emergency,
              status: 'assigned',
              assignedAmbulanceId: selectedAmb.id,
            }
            : emergency,
        ),
      )

      await broadcastTripNotification(supabase, {
        event_type: 'dispatch_assigned',
        driver_id: profile.id,
        pickup: assigningEmergency.pickupLocation,
        destination: assigningEmergency.destinationHospital,
        priority: assigningEmergency.priority,
        ambulanceId: selectedAmb.id,
        eta: routeRes.estimatedTime,
        trip_id: insertedTrip?.id,
      })

      setAssigningEmergency(null)
      setAssignmentPreviewTrip(null)
      await loadData()
    } catch (error) {
      setAssignError(error instanceof Error ? error.message : 'Unable to assign ambulance.')
      await loadData()
    } finally {
      setIsAssigning(false)
    }
  }

  const handleCreateEmergency = async () => {
    setIsCreatingEmergency(true)
    setCreateError(null)

    try {
      const template = pickRandomEmergencyTemplate()
      const createdAt = new Date()
      const incidentId = generateIncidentId(createdAt)
      const priority = normalizeTemplatePriority(template.priority)
      const pickup = template.pickupLocation

      let hospital = template.destinationHospital
      if (!hospital) {
        const nearest = await findNearestHospital(pickup.lat, pickup.lng)
        if (!nearest) {
          throw new Error('Unable to resolve a nearby hospital for this emergency.')
        }
        hospital = nearest
      }

      const route = await calculateSmartRoute({
        source: [pickup.lat, pickup.lng],
        destination: [hospital.lat, hospital.lng],
        trafficLevel: priority === 'critical' ? 'high' : priority === 'high' ? 'medium' : 'low',
      })

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be signed in as a dispatcher to create an emergency.')
      }

      const { profile, error: profileError } = await ensureUserProfile(supabase, user)
      if (profileError) {
        throw new Error('Unable to verify dispatcher profile: ' + profileError.message)
      }
      if (!profile || profile.role !== 'dispatcher') {
        throw new Error('Only dispatchers are allowed to create emergencies.')
      }

      const { data: inserted, error } = await supabase
        .from('emergency_requests')
        .insert({
          incident_id: incidentId,
          pickup_location: pickup.name,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          destination_hospital: hospital.name,
          dest_lat: hospital.lat,
          dest_lng: hospital.lng,
          priority,
          status: 'pending',
          patient_name: template.patientName,
          age: template.age,
          emergency_type: template.emergencyType,
          eta: route.estimatedTime,
          distance: route.totalDistance,
          notes: template.destinationHospital
            ? null
            : `Nearest hospital auto-selected near ${pickup.name}`,
          created_by: user?.id ?? null,
          created_at: createdAt.toISOString(),
        })
        .select('*')
        .single()

      if (error) {
        throw new Error(
          error.message.includes('does not exist') || error.code === '42P01'
            ? 'emergency_requests table is missing. Apply the Supabase migrations first.'
            : error.message.includes('incident_id') || error.message.includes('age') || error.message.includes('eta')
              ? 'Apply supabase/migrations/20260725153000_emergency_template_fields.sql to add template columns.'
              : error.message,
        )
      }

      if (inserted) {
        const available = ambulances.filter(isAmbulanceAvailable)
        const isAutoAssigned = autoAssignEnabled && available.length > 0

        if (isAutoAssigned) {
          let nearestAmb = available[0]
          let minDistance = calculateDistance(
            nearestAmb.lat,
            nearestAmb.lng,
            pickup.lat,
            pickup.lng
          )

          for (let i = 1; i < available.length; i++) {
            const amb = available[i]
            const dist = calculateDistance(
              amb.lat,
              amb.lng,
              pickup.lat,
              pickup.lng
            )
            if (dist < minDistance) {
              minDistance = dist
              nearestAmb = amb
            }
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('full_name', nearestAmb.driverName)
            .eq('role', 'driver')
            .maybeSingle()

          if (profile?.id) {
            const routeRes = await calculateSmartRoute({
              source: [nearestAmb.lat, nearestAmb.lng],
              destination: [hospital.lat, hospital.lng],
              trafficLevel: 'medium',
            })

            const { data: insertedTrip } = await supabase
              .from('ambulance_trips')
              .insert({
                driver_id: profile.id,
                ambulance_id: nearestAmb.id,
                emergency_id: inserted.id,
                source: pickup.name,
                destination: hospital.name,
                source_lat: pickup.lat,
                source_lng: pickup.lng,
                dest_lat: hospital.lat,
                dest_lng: hospital.lng,
                current_lat: nearestAmb.lat,
                current_lng: nearestAmb.lng,
                status: 'pending',
                eta: routeRes.estimatedTime,
                distance: routeRes.totalDistance,
                route_condition: 'clear',
                route_data: {
                  ...routeRes,
                  status: TRIP_WORKFLOW_STATUS.assigned,
                  priority,
                  patientName: inserted.patient_name,
                  patientNotes: inserted.notes,
                  patientAge: inserted.age,
                  emergencyType: inserted.emergency_type,
                } as any,
              })
              .select()
              .single()

            if (insertedTrip) {
              await supabase
                .from('emergency_requests')
                .update({
                  status: 'assigned',
                  assigned_trip_id: insertedTrip.id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', inserted.id)

              await broadcastTripNotification(supabase, {
                event_type: 'dispatch_assigned',
                driver_id: profile.id,
                pickup: pickup.name,
                destination: hospital.name,
                priority,
                ambulanceId: nearestAmb.id,
                eta: routeRes.estimatedTime,
                trip_id: insertedTrip.id,
              })
            }
          }
        }

        setEmergencies((prev) => [
          {
            id: String(inserted.id),
            incidentId: inserted.incident_id ?? incidentId,
            pickupLocation: inserted.pickup_location,
            pickupLat: Number(inserted.pickup_lat ?? pickup.lat),
            pickupLng: Number(inserted.pickup_lng ?? pickup.lng),
            destinationHospital: inserted.destination_hospital,
            destLat: Number(inserted.dest_lat ?? hospital.lat),
            destLng: Number(inserted.dest_lng ?? hospital.lng),
            priority: (inserted.priority ?? priority) as EmergencyRequest['priority'],
            timeAgo: 'Just now',
            status: isAutoAssigned ? 'assigned' : 'pending',
            patientName: inserted.patient_name ?? template.patientName,
            age: inserted.age ?? template.age,
            emergencyType: inserted.emergency_type ?? template.emergencyType,
            notes: inserted.notes ?? undefined,
            createdAt: inserted.created_at ?? createdAt.toISOString(),
            eta: inserted.eta ?? route.estimatedTime,
            distance: inserted.distance ?? route.totalDistance,
          },
          ...prev,
        ])
      }

      await loadData()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Unable to create emergency right now.')
    } finally {
      setIsCreatingEmergency(false)
    }
  }

  const openAssignAmbulance = useCallback(async (emergency: EmergencyRequest) => {
    if (emergency.status !== 'pending') return

    setAssignError(null)
    setAssigningEmergency(emergency)
    setSelectedTrip(null)
    setActiveSection('control-room')
    setAmbulanceEtas({})

    // Calculate ETAs for each available ambulance to the pickup location asynchronously
    const activeAvailable = ambulances.filter(isAmbulanceAvailable)
    Promise.all(
      activeAvailable.map(async (amb) => {
        try {
          const route = await calculateSmartRoute({
            source: [amb.lat, amb.lng],
            destination: [emergency.pickupLat, emergency.pickupLng],
            trafficLevel: emergency.priority === 'critical' ? 'high' : 'medium',
          })
          setAmbulanceEtas((prev) => ({
            ...prev,
            [amb.id]: route.estimatedTime,
          }))
        } catch (e) {
          console.error(`Error calculating route for ${amb.id}`, e)
        }
      })
    )

    // Set an initial preview trip immediately with straight-line waypoints to prevent map reset glitch
    setAssignmentPreviewTrip({
      id: `assign-preview-${emergency.id}`,
      ambulance_id: 'PENDING-ASSIGN',
      driver_id: 'pending',
      source: emergency.pickupLocation,
      destination: emergency.destinationHospital,
      source_lat: emergency.pickupLat,
      source_lng: emergency.pickupLng,
      dest_lat: emergency.destLat,
      dest_lng: emergency.destLng,
      current_lat: emergency.pickupLat,
      current_lng: emergency.pickupLng,
      eta: emergency.eta ?? 0,
      distance: emergency.distance ?? 0,
      status: 'pending',
      route_condition: 'clear',
      route_data: {
        waypoints: [
          [emergency.pickupLat, emergency.pickupLng],
          [emergency.destLat, emergency.destLng],
        ],
        estimatedTime: emergency.eta ?? 0,
        totalDistance: emergency.distance ?? 0,
        status: TRIP_WORKFLOW_STATUS.assigned,
        priority: emergency.priority,
      } as any,
      is_offline: false,
      created_at: emergency.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const route = await calculateSmartRoute({
      source: [emergency.pickupLat, emergency.pickupLng],
      destination: [emergency.destLat, emergency.destLng],
      trafficLevel: emergency.priority === 'critical' ? 'high' : 'medium',
    })

    setAssignmentPreviewTrip({
      id: `assign-preview-${emergency.id}`,
      ambulance_id: 'PENDING-ASSIGN',
      driver_id: 'pending',
      source: emergency.pickupLocation,
      destination: emergency.destinationHospital,
      source_lat: emergency.pickupLat,
      source_lng: emergency.pickupLng,
      dest_lat: emergency.destLat,
      dest_lng: emergency.destLng,
      current_lat: emergency.pickupLat,
      current_lng: emergency.pickupLng,
      eta: route.estimatedTime,
      distance: route.totalDistance,
      status: 'pending',
      route_condition: 'clear',
      route_data: {
        ...route,
        status: TRIP_WORKFLOW_STATUS.assigned,
        priority: emergency.priority,
      } as any,
      is_offline: false,
      created_at: emergency.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }, [])

  const closeAssignAmbulance = useCallback(() => {
    if (isAssigning) return
    setAssigningEmergency(null)
    setAssignmentPreviewTrip(null)
    setAssignError(null)
  }, [isAssigning])

  // Shared source of truth for fleet panel + assignment modal
  const availableAmbulances = useMemo(
    () => ambulances.filter(isAmbulanceAvailable),
    [ambulances],
  )

  const mapFocusedTrip = assignmentPreviewTrip ?? selectedTrip
  const activeMapTrips = useMemo(
    () => trips.filter((trip) => trip.status === 'pending' || trip.status === 'in_progress'),
    [trips],
  )

  // Count metrics
  const availableCount = availableAmbulances.length
  const activeCount = ambulances.filter((a) => !isAmbulanceAvailable(a) && a.status !== 'offline').length
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
      <DispatchSidebar activeSection={activeSection} onSectionChange={setActiveSection} dispatcherName={currentUserProfile?.full_name} />

      {/* Main page content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <DispatchTopbar pendingCount={pendingCount} dispatcherName={currentUserProfile?.full_name} />

        <main className="relative flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {/* Subtle glowing elements */}
          <div className="pointer-events-none absolute inset-0 z-0">
            <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-primary/5 blur-[90px]" />
            <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-emergency/5 blur-[100px]" />
          </div>

          <div className="relative z-10 space-y-6">
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

                <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                  <div className="space-y-6 flex flex-col">
                    <div className="glass-card flex flex-col rounded-2xl border border-white/10 bg-[#07111f]/60 overflow-hidden shadow-lg h-[460px]">
                      <div className="p-4 border-b border-white/10 flex items-center justify-between">
                        <h3 className="font-bold text-foreground tracking-wide flex items-center gap-2">
                          Live Fleet Tracking Map
                        </h3>
                        {mapFocusedTrip && (
                          <button
                            onClick={() => {
                              setSelectedTrip(null)
                              if (!assigningEmergency) setAssignmentPreviewTrip(null)
                            }}
                            className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 px-2 py-0.5 rounded-lg hover:bg-red-500/20"
                          >
                            {assignmentPreviewTrip ? 'Clear Route Preview' : 'Reset Map Focus'}
                          </button>
                        )}
                      </div>
                      <div className="flex-1 relative">
                        <AmbulanceMap
                          trips={trips}
                          selectedTrip={mapFocusedTrip}
                          hospitals={MAPPED_HOSPITALS}
                          showAllTrips
                          onTripSelect={(trip) => {
                            if (assigningEmergency) return
                            if (trip.status === 'pending' || trip.status === 'in_progress') {
                              setSelectedTrip(trip)
                            }
                          }}
                          className="h-full w-full absolute inset-0"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-4 shadow-lg">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-foreground">Active Trips Summary</h3>
                          <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                            {activeCount} LIVE
                          </span>
                        </div>
                        <div className="space-y-2">
                          {activeMapTrips.slice(0, 4).map((trip) => (
                            <button
                              key={trip.id}
                              onClick={() => {
                                setAssignmentPreviewTrip(null)
                                setSelectedTrip(trip)
                              }}
                              className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition-colors hover:border-blue-500/25 hover:bg-blue-500/5"
                            >
                              <div>
                                <div className="font-mono text-xs font-bold text-slate-200">{trip.ambulance_id}</div>
                                <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-muted-foreground">
                                  {trip.source} to {trip.destination || 'destination pending'}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold uppercase text-slate-400">{trip.status}</span>
                            </button>
                          ))}
                          {activeMapTrips.length === 0 && (
                            <div className="py-6 text-center text-xs text-muted-foreground">No active trips on the board.</div>
                          )}
                        </div>
                      </div>

                      <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-4 shadow-lg">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-foreground">Current Emergency Overview</h3>
                          <span className="rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                            {pendingCount} PENDING
                          </span>
                        </div>
                        <div className="space-y-2">
                          {emergencies.filter((emergency) => emergency.status === 'pending').slice(0, 4).map((emergency) => (
                            <div key={emergency.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-slate-200">REQ-{emergency.id}</span>
                                <span className="rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300">
                                  {emergency.priority}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-[10px] text-muted-foreground">
                                {emergency.pickupLocation} to {emergency.destinationHospital}
                              </div>
                            </div>
                          ))}
                          {pendingCount === 0 && (
                            <div className="py-6 text-center text-xs text-muted-foreground">No pending emergency requests.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-4 shadow-lg">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-foreground">Live Ambulance Monitoring</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Online</span>
                      </div>
                      <div className="space-y-2">
                        {ambulances.slice(0, 6).map((amb) => (
                          <button
                            key={amb.id}
                            onClick={() => {
                              const matchTrip = trips.find((trip) => trip.ambulance_id === amb.id)
                              if (matchTrip) setSelectedTrip(matchTrip)
                            }}
                            className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.04]"
                          >
                            <div>
                              <div className="font-mono text-xs font-bold text-slate-200">{amb.id}</div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">{amb.driverName} • {amb.locationName}</div>
                            </div>
                            <span className="text-[10px] font-bold uppercase text-slate-400">{amb.status}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <DispatchActivityTimeline logs={logs} />
                  </div>
                </div>
              </>
            )}

            {activeSection === 'dispatch-queue' && (
              <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                <div className="space-y-6">
                  <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-4 shadow-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-foreground tracking-wide">Dispatch Queue</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          One click creates a random emergency from templates, resolves hospital, and calculates route ETA.
                        </p>
                      </div>
                      <Button
                        onClick={handleCreateEmergency}
                        size="sm"
                        disabled={isCreatingEmergency}
                        className="rounded-lg bg-red-600 text-white hover:bg-red-700"
                      >
                        {isCreatingEmergency ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-1.5 h-4 w-4" />
                        )}
                        {isCreatingEmergency ? 'Creating…' : 'Create Emergency'}
                      </Button>
                    </div>
                    {createError && (
                      <p className="mt-3 flex items-center gap-2 text-xs text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {createError}
                      </p>
                    )}
                  </div>

                  <DispatchEmergencyQueue
                    emergencies={emergencies}
                    onAssignAmbulance={openAssignAmbulance}
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
            )}

            {activeSection === 'incidents' && (
              <div className="glass-card rounded-2xl border border-white/10 bg-[#07111f]/60 p-6 space-y-6 shadow-lg max-w-4xl">
                <div>
                  <h2 className="text-xl font-bold text-foreground tracking-wide">Incident log</h2>
                  <p className="text-xs text-muted-foreground mt-1">Detailed review of all dispatched (in-progress) and resolved (completed) incidents in this shift.</p>
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
                        <th className="p-3 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map((item) => {
                        const statusLabel =
                          item.status === 'completed'
                            ? 'Resolved'
                            : item.status === 'assigned'
                              ? 'In Progress'
                              : item.status === 'cancelled'
                                ? 'Cancelled'
                                : item.status

                        const badgeClass =
                          item.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.status === 'assigned'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'

                        return (
                          <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 text-slate-300">
                            <td className="p-3 font-mono font-bold text-slate-400">
                              {item.incident_id ?? `REQ-${item.id.substring(0, 4).toUpperCase()}`}
                            </td>
                            <td className="p-3">{item.pickup_location}</td>
                            <td className="p-3">{item.destination_hospital}</td>
                            <td className="p-3 font-mono">{(item.trip as any)?.ambulance_id ?? '—'}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="p-3 text-right text-muted-foreground font-mono">
                              {formatActivityClock(item.updated_at || item.created_at)}
                            </td>
                          </tr>
                        )
                      })}
                      {incidents.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                            No logged incidents found in this shift.
                          </td>
                        </tr>
                      )}
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
                    <div
                      onClick={() => setAutoAssignEnabled(!autoAssignEnabled)}
                      className={`h-6 w-11 rounded-full p-1 cursor-pointer flex items-center transition-colors duration-200 ${autoAssignEnabled ? 'bg-emerald-500/25 justify-end border border-emerald-500/30' : 'bg-white/10 justify-start border border-white/5'
                        }`}
                    >
                      <div className={`h-4 w-4 rounded-full transition-transform duration-200 ${autoAssignEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-foreground">GPS Refresh Interval</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Current interval: {formatGpsRefreshInterval(gpsRefreshInterval)}
                      </div>
                    </div>
                    <select
                      value={gpsRefreshInterval}
                      onChange={(event) => setGpsRefreshInterval(Number(event.target.value) as GpsRefreshInterval)}
                      className="bg-black/30 border border-white/10 text-foreground text-xs rounded-lg p-1.5 outline-none"
                    >
                      {GPS_REFRESH_INTERVALS.map((interval) => (
                        <option key={interval} value={interval}>
                          {formatGpsRefreshInterval(interval)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Assignment side panel — keeps the live map visible with dotted route */}
      <AnimatePresence>
        {assigningEmergency && (
          <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
            <button
              type="button"
              aria-label="Close assignment panel"
              className="absolute inset-0 bg-black/35 pointer-events-auto"
              onClick={closeAssignAmbulance}
            />
            <motion.div
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              className="relative z-10 m-3 flex h-[calc(100%-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#07111f] p-6 text-foreground shadow-2xl pointer-events-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <AlertCircle className="text-red-500 h-5 w-5" />
                  Assign Dispatch Unit
                </h3>
                <button
                  onClick={closeAssignAmbulance}
                  className="rounded-lg border border-white/10 bg-white/5 p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5 text-xs text-muted-foreground">
                <div>
                  <span className="font-bold text-slate-300">Incident Code:</span> {assigningEmergency.incidentId ?? assigningEmergency.id} ({assigningEmergency.priority.toUpperCase()})
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
                {assignError && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {assignError}
                  </p>
                )}
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {availableAmbulances.map((amb) => (
                    <div
                      key={amb.id}
                      onClick={() => {
                        if (!isAssigning) handleAssign(amb.driverName)
                      }}
                      className={`flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-lg transition-all duration-150 ${isAssigning
                          ? 'cursor-not-allowed opacity-60'
                          : 'hover:bg-emerald-500/10 hover:border-emerald-500/30 cursor-pointer'
                        }`}
                    >
                      <div>
                        <div className="font-mono text-xs font-bold text-foreground">{amb.id}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {amb.driverName} • {amb.locationName}
                          {ambulanceEtas[amb.id] !== undefined && (
                            <span className="ml-1 text-emerald-400 font-bold">
                              • ETA: {ambulanceEtas[amb.id]}m to pickup
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        {isAssigning ? 'Assigning…' : 'Dispatch'}
                      </span>
                    </div>
                  ))}
                  {availableAmbulances.length === 0 && (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No units available in this shift.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-white/5">
                <Button
                  onClick={closeAssignAmbulance}
                  variant="ghost"
                  disabled={isAssigning}
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
