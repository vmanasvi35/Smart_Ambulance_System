'use client'

import { useEffect, useRef, useState } from 'react'
import type { AmbulanceTrip } from '@/lib/types'
import type { Roadblock, SpawnedVehicle } from '@/lib/routing'

export type MapHospital = {
  name: string
  lat: number
  lng: number
}

interface AmbulanceMapProps {
  trips: AmbulanceTrip[]
  selectedTrip?: AmbulanceTrip | null
  onTripSelect?: (trip: AmbulanceTrip) => void
  showAllTrips?: boolean
  hospitals?: MapHospital[]
  trafficLevel?: 'low' | 'medium' | 'high'
  roadblockMode?: boolean
  roadblocks?: Roadblock[]
  spawnedVehicles?: SpawnedVehicle[]
  onRoadblockAdd?: (lat: number, lng: number) => void
  className?: string
  showTrafficCircles?: boolean
}

export function AmbulanceMap({
  trips,
  selectedTrip,
  onTripSelect,
  showAllTrips = true,
  hospitals = [],
  trafficLevel = 'low',
  roadblockMode = false,
  roadblocks = [],
  spawnedVehicles = [],
  onRoadblockAdd,
  className = '',
  showTrafficCircles = false,
}: AmbulanceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const hospitalsRef = useRef<L.LayerGroup | null>(null)
  const routeRef = useRef<L.Polyline | null>(null)
  const trafficLayerRef = useRef<L.LayerGroup | null>(null)
  const simulationLayerRef = useRef<L.LayerGroup | null>(null)
  const lastFittedTripIdRef = useRef<string | null>(null)
  const ambulanceMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const previousPositionsRef = useRef<Map<string, [number, number]>>(new Map())
  const [isReady, setIsReady] = useState(false)
  const [L, setL] = useState<typeof import('leaflet') | null>(null)
  const [mapMoved, setMapMoved] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadLeaflet = async () => {
      const leaflet = await import('leaflet')
      await import('leaflet/dist/leaflet.css')

      if (mounted) {
        setL(leaflet.default as unknown as typeof import('leaflet'))
        setIsReady(true)
      }
    }

    loadLeaflet()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!isReady || !L || !mapRef.current || mapInstanceRef.current) return

    mapInstanceRef.current = L.map(mapRef.current, {
      zoomControl: true,
      preferCanvas: true,
    }).setView([12.9716, 77.5946], 12)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapInstanceRef.current)

    markersRef.current = L.layerGroup().addTo(mapInstanceRef.current)
    hospitalsRef.current = L.layerGroup().addTo(mapInstanceRef.current)
    trafficLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current)
    simulationLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current)

    const map = mapInstanceRef.current
    const invalidate = () => map.invalidateSize({ animate: false })
    const timeoutId = window.setTimeout(invalidate, 80)
    window.addEventListener('resize', invalidate)

    const handleMove = () => {
      const currentCenter = map.getCenter()
      const currentZoom = map.getZoom()
      if (currentCenter) {
        const centerMoved = Math.abs(currentCenter.lat - 12.9716) > 0.005 || Math.abs(currentCenter.lng - 77.5946) > 0.005
        const zoomMoved = currentZoom !== 12
        setMapMoved(centerMoved || zoomMoved)
      }
    }
    map.on('moveend', handleMove)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('resize', invalidate)
      map.off('moveend', handleMove)
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [isReady, L])

  useEffect(() => {
    if (!L || !mapInstanceRef.current || !onRoadblockAdd) return

    const map = mapInstanceRef.current
    const handleClick = (event: L.LeafletMouseEvent) => {
      if (roadblockMode) {
        onRoadblockAdd(event.latlng.lat, event.latlng.lng)
      }
    }

    map.on('click', handleClick)
    map.getContainer().style.cursor = roadblockMode ? 'crosshair' : ''

    return () => {
      map.off('click', handleClick)
      map.getContainer().style.cursor = ''
    }
  }, [L, roadblockMode, onRoadblockAdd])

  useEffect(() => {
    if (!L || !mapInstanceRef.current || !hospitalsRef.current) return

    hospitalsRef.current.clearLayers()

    const hospitalIcon = L.divIcon({
      className: 'custom-hospital-icon',
      html: `
        <div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(34,197,94,0.12); border: 2px solid #22c55e; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(34,197,94,0.25);">
          <span style="font-size: 13px; line-height: 1;">🏥</span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })

    hospitals.forEach((hospital) => {
      L.marker([hospital.lat, hospital.lng], { icon: hospitalIcon })
        .bindPopup(`<strong>Hospital:</strong> ${hospital.name}`)
        .addTo(hospitalsRef.current!)
    })
  }, [L, hospitals])

  useEffect(() => {
    if (!L || !mapInstanceRef.current || !markersRef.current || !trafficLayerRef.current || !simulationLayerRef.current) {
      return
    }

    markersRef.current.clearLayers()
    trafficLayerRef.current.clearLayers()
    simulationLayerRef.current.clearLayers()
    if (routeRef.current) {
      routeRef.current.remove()
      routeRef.current = null
    }

    const tripsToShow = showAllTrips ? trips : selectedTrip ? [selectedTrip] : []
    const focusTrip = selectedTrip ?? null

    const createAmbulanceIcon = (isActive: boolean) =>
      L.divIcon({
        className: 'custom-ambulance-icon',
        html: `
          <div style="position: relative;">
            <div class="${isActive ? 'map-marker-pulse' : ''}" style="width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background-color: ${
              isActive ? '#ef4444' : '#3b82f6'
            }; box-shadow: 0 0 16px ${isActive ? 'rgba(239,68,68,0.55)' : 'rgba(59,130,246,0.35)'}, 0 4px 6px rgba(0,0,0,0.3);">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 10H6"></path>
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
                <path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14"></path>
                <path d="M8 8v4"></path>
                <circle cx="17" cy="18" r="2"></circle>
                <circle cx="7" cy="18" r="2"></circle>
              </svg>
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      })

    const createRoadblockIcon = () =>
      L.divIcon({
        className: 'custom-roadblock-icon',
        html: `
          <div style="width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background-color: #f97316; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
            <span style="color: white; font-weight: 800; font-size: 14px;">🚧</span>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })

    const routeColor =
      focusTrip?.route_condition === 'road_blocked'
        ? '#ef4444'
        : focusTrip?.route_condition === 'heavy_congestion' || trafficLevel === 'high'
          ? '#f97316'
          : focusTrip?.route_condition === 'moderate_traffic' || trafficLevel === 'medium'
            ? '#eab308'
            : '#22c55e'

    const createLocationIcon = (type: 'source' | 'destination') => {
      if (type === 'destination') {
        return L.divIcon({
          className: 'custom-location-icon',
          html: `
            <div class="map-marker-pulse" style="width: 32px; height: 32px; border-radius: 50%; background: rgba(34,197,94,0.15); border: 2px solid #22c55e; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 14px rgba(34,197,94,0.35);">
              <span style="font-size: 14px; line-height: 1;">🏥</span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })
      }

      return L.divIcon({
        className: 'custom-location-icon',
        html: `
          <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #1e293b; border: 2px solid #22c55e; display: flex; align-items: center; justify-content: center;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: #22c55e;"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      })
    }

    tripsToShow.forEach((trip) => {
      const isActive = trip.status === 'pending' || trip.status === 'in_progress'
      const isFocused = focusTrip?.id === trip.id

      const currentPosition =
        trip.current_lat != null && trip.current_lng != null
          ? [trip.current_lat, trip.current_lng] as [number, number]
          : trip.source_lat != null && trip.source_lng != null
            ? [trip.source_lat, trip.source_lng] as [number, number]
            : trip.dest_lat != null && trip.dest_lng != null
              ? [trip.dest_lat, trip.dest_lng] as [number, number]
              : null

      if (currentPosition) {
        const previousPosition = previousPositionsRef.current.get(trip.id)
        
        let marker = ambulanceMarkersRef.current.get(trip.id)
        
        if (!marker) {
          marker = L.marker(currentPosition, {
            icon: createAmbulanceIcon(isActive),
            opacity: focusTrip && !isFocused ? 0.55 : 1,
          }).bindPopup(`
              <div style="font-size: 14px; padding: 4px;">
                <strong>${trip.ambulance_id}</strong><br/>
                ${trip.source}${trip.destination ? ` → ${trip.destination}` : ''}<br/>
                Status: ${trip.status}<br/>
                ${trip.eta ? `ETA: ${trip.eta} min` : ''}
              </div>
            `)

          if (onTripSelect) {
            marker.on('click', () => onTripSelect(trip))
          }

          markersRef.current?.addLayer(marker)
          ambulanceMarkersRef.current.set(trip.id, marker)
        } else {
          // Smooth GPS-like movement animation using custom interpolation
          if (previousPosition) {
            const [prevLat, prevLng] = previousPosition
            const [newLat, newLng] = currentPosition
            
            // Only animate if position changed significantly
            if (Math.abs(prevLat - newLat) > 0.0001 || Math.abs(prevLng - newLng) > 0.0001) {
              // Custom smooth animation
              const duration = 1500 // 1.5 seconds
              const startTime = performance.now()
              
              const animate = (currentTime: number) => {
                const elapsed = currentTime - startTime
                const progress = Math.min(elapsed / duration, 1)
                
                // Ease out cubic function for smooth deceleration
                const easeProgress = 1 - Math.pow(1 - progress, 3)
                
                const interpolatedLat = prevLat + (newLat - prevLat) * easeProgress
                const interpolatedLng = prevLng + (newLng - prevLng) * easeProgress
                
                marker.setLatLng([interpolatedLat, interpolatedLng])
                
                if (progress < 1) {
                  requestAnimationFrame(animate)
                }
              }
              
              requestAnimationFrame(animate)
            }
          } else {
            marker.setLatLng(currentPosition)
          }
          
          // Update icon and opacity based on current state
          marker.setIcon(createAmbulanceIcon(isActive))
          marker.setOpacity(focusTrip && !isFocused ? 0.55 : 1)
        }
        
        previousPositionsRef.current.set(trip.id, currentPosition)
      }
      
      // Clean up markers for trips that no longer exist
      const currentTripIds = new Set(tripsToShow.map(t => t.id))
      for (const [tripId, marker] of ambulanceMarkersRef.current) {
        if (!currentTripIds.has(tripId)) {
          markersRef.current?.removeLayer(marker)
          ambulanceMarkersRef.current.delete(tripId)
          previousPositionsRef.current.delete(tripId)
        }
      }

      if (isFocused) {
        if (trip.source_lat != null && trip.source_lng != null) {
          markersRef.current?.addLayer(
            L.marker([trip.source_lat, trip.source_lng], {
              icon: createLocationIcon('source'),
            }).bindPopup(`<strong>Pickup:</strong> ${trip.source}`),
          )
        }

        if (trip.dest_lat != null && trip.dest_lng != null) {
          markersRef.current?.addLayer(
            L.marker([trip.dest_lat, trip.dest_lng], {
              icon: createLocationIcon('destination'),
            }).bindPopup(`<strong>Hospital:</strong> ${trip.destination}`),
          )
        }
      }
    })

    if (focusTrip && !tripsToShow.some((trip) => trip.id === focusTrip.id)) {
      if (focusTrip.source_lat != null && focusTrip.source_lng != null) {
        markersRef.current?.addLayer(
          L.marker([focusTrip.source_lat, focusTrip.source_lng], {
            icon: createLocationIcon('source'),
          }).bindPopup(`<strong>Pickup:</strong> ${focusTrip.source}`),
        )
      }
      if (focusTrip.dest_lat != null && focusTrip.dest_lng != null) {
        markersRef.current?.addLayer(
          L.marker([focusTrip.dest_lat, focusTrip.dest_lng], {
            icon: createLocationIcon('destination'),
          }).bindPopup(`<strong>Hospital:</strong> ${focusTrip.destination}`),
        )
      }
    }

    roadblocks.forEach((roadblock) => {
      L.marker([roadblock.lat, roadblock.lng], {
        icon: createRoadblockIcon(),
      })
        .bindPopup('<strong>Roadblock:</strong> blocked segment detected')
        .addTo(simulationLayerRef.current!)
    })

    spawnedVehicles.forEach((vehicle) => {
      L.marker([vehicle.lat, vehicle.lng], {
        icon: createAmbulanceIcon(true),
      })
        .bindPopup(`<strong>${vehicle.ambulanceId}</strong><br/>Simulated emergency vehicle`)
        .addTo(simulationLayerRef.current!)
    })

    const waypoints = (focusTrip?.route_data?.waypoints as [number, number][] | undefined) ?? null
    if (focusTrip && waypoints && waypoints.length > 1 && mapInstanceRef.current) {
      routeRef.current = L.polyline(waypoints, {
        color: focusTrip.status === 'in_progress' ? routeColor : '#3b82f6',
        weight: 5,
        opacity: 0.9,
        className: 'map-route-animated',
        dashArray: '12 10',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapInstanceRef.current)

      if (
        showTrafficCircles &&
        (trafficLevel !== 'low' ||
          focusTrip.route_condition === 'heavy_congestion' ||
          focusTrip.route_condition === 'moderate_traffic')
      ) {
        waypoints
          .filter((_, index) => index % 6 === 0)
          .forEach(([lat, lng]) => {
            const high =
              trafficLevel === 'high' || focusTrip.route_condition === 'heavy_congestion'
            L.circle([lat, lng], {
              radius: high ? 320 : 190,
              color: high ? '#f97316' : '#eab308',
              fillColor: high ? '#f97316' : '#eab308',
              fillOpacity: 0.18,
              weight: 1,
            }).addTo(trafficLayerRef.current!)
          })
      }

      if (lastFittedTripIdRef.current !== focusTrip.id) {
        lastFittedTripIdRef.current = focusTrip.id
        mapInstanceRef.current.fitBounds(routeRef.current.getBounds(), {
          padding: [48, 48],
          animate: true,
          duration: 0.45,
          maxZoom: 14,
        })
      }
    } else if (!focusTrip) {
      if (lastFittedTripIdRef.current !== null) {
        lastFittedTripIdRef.current = null
        mapInstanceRef.current.setView([12.9716, 77.5946], 12, { animate: true })
      }
    }
  }, [L, trips, selectedTrip, showAllTrips, onTripSelect, trafficLevel, roadblocks, spawnedVehicles, showTrafficCircles])

  if (!isReady) {
    return (
      <div className={`flex items-center justify-center bg-card border border-border/50 ${className}`}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <span>Loading map...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className={`rounded-lg ${className}`} style={{ zIndex: 0 }} />
      {mapMoved && (
        <button
          onClick={() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setView([12.9716, 77.5946], 12, { animate: true })
              setMapMoved(false)
            }
          }}
          className="absolute top-3 right-3 z-[1000] rounded-lg bg-[#07111f]/90 border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-200 shadow-lg backdrop-blur-md hover:bg-white/10 hover:text-foreground transition-all cursor-pointer"
        >
          Reset Position
        </button>
      )}
    </div>
  )
}
