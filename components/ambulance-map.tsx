'use client'

import { useEffect, useRef, useState } from 'react'
import type { AmbulanceTrip } from '@/lib/types'
import type { Roadblock, SpawnedVehicle } from '@/lib/routing'

interface AmbulanceMapProps {
  trips: AmbulanceTrip[]
  selectedTrip?: AmbulanceTrip | null
  onTripSelect?: (trip: AmbulanceTrip) => void
  showAllTrips?: boolean
  trafficLevel?: 'low' | 'medium' | 'high'
  roadblockMode?: boolean
  roadblocks?: Roadblock[]
  spawnedVehicles?: SpawnedVehicle[]
  onRoadblockAdd?: (lat: number, lng: number) => void
  className?: string
}

export function AmbulanceMap({
  trips,
  selectedTrip,
  onTripSelect,
  showAllTrips = true,
  trafficLevel = 'low',
  roadblockMode = false,
  roadblocks = [],
  spawnedVehicles = [],
  onRoadblockAdd,
  className = '',
}: AmbulanceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const routeRef = useRef<L.Polyline | null>(null)
  const trafficLayerRef = useRef<L.LayerGroup | null>(null)
  const simulationLayerRef = useRef<L.LayerGroup | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [L, setL] = useState<typeof import('leaflet') | null>(null)

  // Dynamically import Leaflet on client side only
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

    // Initialize map centered on Bangalore
    mapInstanceRef.current = L.map(mapRef.current).setView([12.9716, 77.5946], 12)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapInstanceRef.current)

    markersRef.current = L.layerGroup().addTo(mapInstanceRef.current)
    trafficLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current)
    simulationLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current)

    return () => {
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
    if (!L || !mapInstanceRef.current || !markersRef.current || !trafficLayerRef.current || !simulationLayerRef.current) return

    // Clear existing markers
    markersRef.current.clearLayers()
    trafficLayerRef.current.clearLayers()
    simulationLayerRef.current.clearLayers()
    if (routeRef.current) {
      routeRef.current.remove()
      routeRef.current = null
    }

    const tripsToShow = showAllTrips ? trips : selectedTrip ? [selectedTrip] : []

    // Custom ambulance icon creator
    const createAmbulanceIcon = (isActive: boolean) => {
      return L.divIcon({
        className: 'custom-ambulance-icon',
        html: `
          <div style="position: relative;">
            <div style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background-color: ${
              isActive ? '#ef4444' : '#3b82f6'
            }; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 10H6"></path>
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
                <path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14"></path>
                <path d="M8 8v4"></path>
                <circle cx="17" cy="18" r="2"></circle>
                <circle cx="7" cy="18" r="2"></circle>
              </svg>
            </div>
            ${isActive ? '<div style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background-color: #ef4444; border-radius: 50%; animation: ping 1s infinite;"></div>' : ''}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })
    }

    const createRoadblockIcon = () => {
      return L.divIcon({
        className: 'custom-roadblock-icon',
        html: `
          <div style="width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background-color: #f97316; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
            <span style="color: white; font-weight: 800; font-size: 16px;">!</span>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
    }

    const routeColor =
      selectedTrip?.route_condition === 'road_blocked'
        ? '#ef4444'
        : selectedTrip?.route_condition === 'heavy_congestion' || trafficLevel === 'high'
          ? '#f97316'
          : selectedTrip?.route_condition === 'moderate_traffic' || trafficLevel === 'medium'
            ? '#eab308'
            : '#22c55e'

    const createLocationIcon = (type: 'source' | 'destination') => {
      const color = type === 'source' ? '#22c55e' : '#ef4444'
      return L.divIcon({
        className: 'custom-location-icon',
        html: `
          <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #1e293b; border: 2px solid ${color}; display: flex; align-items: center; justify-content: center;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${color};"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      })
    }

    tripsToShow.forEach((trip) => {
      const isActive = trip.status === 'in_progress'
      
      // Add ambulance marker at current position
      if (trip.current_lat && trip.current_lng) {
        const marker = L.marker([trip.current_lat, trip.current_lng], {
          icon: createAmbulanceIcon(isActive),
        })
          .bindPopup(`
            <div style="font-size: 14px; padding: 4px;">
              <strong>${trip.ambulance_id}</strong><br/>
              ${trip.source} → ${trip.destination}<br/>
              Status: ${trip.status}<br/>
              ${trip.eta ? `ETA: ${trip.eta} min` : ''}
            </div>
          `)
        
        if (onTripSelect) {
          marker.on('click', () => onTripSelect(trip))
        }
        
        markersRef.current?.addLayer(marker)
      }

      // Add source marker
      if (trip.source_lat && trip.source_lng) {
        const sourceMarker = L.marker([trip.source_lat, trip.source_lng], {
          icon: createLocationIcon('source'),
        }).bindPopup(`<strong>Pickup:</strong> ${trip.source}`)
        markersRef.current?.addLayer(sourceMarker)
      }

      // Add destination marker
      if (trip.dest_lat && trip.dest_lng) {
        const destMarker = L.marker([trip.dest_lat, trip.dest_lng], {
          icon: createLocationIcon('destination'),
        }).bindPopup(`<strong>Hospital:</strong> ${trip.destination}`)
        markersRef.current?.addLayer(destMarker)
      }
    })

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

    // Draw route for selected trip
    if (selectedTrip?.route_data?.waypoints && mapInstanceRef.current) {
      const waypoints = selectedTrip.route_data.waypoints as [number, number][]
      routeRef.current = L.polyline(waypoints, {
        color: selectedTrip.status === 'in_progress' ? routeColor : '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: selectedTrip.status === 'in_progress' ? undefined : '10, 10',
      }).addTo(mapInstanceRef.current)

      if (trafficLevel !== 'low' || selectedTrip.route_condition === 'heavy_congestion') {
        const trafficPoints = waypoints.filter((_, index) => index % 6 === 0)
        trafficPoints.forEach(([lat, lng]) => {
          L.circle([lat, lng], {
            radius: trafficLevel === 'high' ? 320 : 190,
            color: trafficLevel === 'high' ? '#f97316' : '#eab308',
            fillColor: trafficLevel === 'high' ? '#f97316' : '#eab308',
            fillOpacity: 0.18,
            weight: 1,
          }).addTo(trafficLayerRef.current!)
        })
      }

      // Fit bounds to show the route
      mapInstanceRef.current.fitBounds(routeRef.current.getBounds(), { padding: [50, 50] })
    }
  }, [L, trips, selectedTrip, showAllTrips, onTripSelect, trafficLevel, roadblocks, spawnedVehicles])

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

  return <div ref={mapRef} className={`rounded-lg ${className}`} style={{ zIndex: 0 }} />
}
