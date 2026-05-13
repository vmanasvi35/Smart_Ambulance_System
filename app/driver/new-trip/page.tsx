'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPin, Navigation, Loader2, ArrowLeft } from 'lucide-react'
import { BANGALORE_LOCATIONS, HOSPITALS } from '@/lib/types'
import Link from 'next/link'

// Generate a simple route between two points
function generateRoute(
  sourceLat: number,
  sourceLng: number,
  destLat: number,
  destLng: number
): [number, number][] {
  const waypoints: [number, number][] = []
  const steps = 20
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Add some slight randomization for realism
    const jitter = (Math.random() - 0.5) * 0.002
    const lat = sourceLat + (destLat - sourceLat) * t + jitter
    const lng = sourceLng + (destLng - sourceLng) * t + jitter
    waypoints.push([lat, lng])
  }
  
  return waypoints
}

// Calculate distance between two points (Haversine)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function NewTripPage() {
  const [ambulanceId, setAmbulanceId] = useState('')
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated')
      setLoading(false)
      return
    }

    // Check for existing active trip
    const { data: existingTrip } = await supabase
      .from('ambulance_trips')
      .select('id')
      .eq('driver_id', user.id)
      .in('status', ['pending', 'in_progress'])
      .limit(1)
      .single()

    if (existingTrip) {
      setError('You already have an active trip. Complete it before starting a new one.')
      setLoading(false)
      return
    }

    // Get source and destination coordinates
    const sourceLocation = BANGALORE_LOCATIONS.find(l => l.name === source)
    const destLocation = HOSPITALS.find(h => h.name === destination)

    if (!sourceLocation || !destLocation) {
      setError('Invalid source or destination')
      setLoading(false)
      return
    }

    // Generate route and calculate distance
    const routeWaypoints = generateRoute(
      sourceLocation.lat,
      sourceLocation.lng,
      destLocation.lat,
      destLocation.lng
    )
    
    const distance = calculateDistance(
      sourceLocation.lat,
      sourceLocation.lng,
      destLocation.lat,
      destLocation.lng
    )
    
    const eta = Math.round(distance * 3) // ~3 min per km in city traffic

    const { error: insertError } = await supabase.from('ambulance_trips').insert({
      driver_id: user.id,
      ambulance_id: ambulanceId,
      source,
      destination,
      source_lat: sourceLocation.lat,
      source_lng: sourceLocation.lng,
      dest_lat: destLocation.lat,
      dest_lng: destLocation.lng,
      current_lat: sourceLocation.lat,
      current_lng: sourceLocation.lng,
      eta,
      distance,
      status: 'pending',
      route_condition: 'unknown',
      route_data: {
        waypoints: routeWaypoints,
        totalDistance: distance,
        estimatedTime: eta,
      },
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push('/driver/dashboard')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/driver/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">New Trip</h1>
            <p className="text-sm text-muted-foreground">
              Create a new emergency trip
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <Card className="glass-card mx-auto max-w-2xl border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" />
              Trip Details
            </CardTitle>
            <CardDescription>
              Enter the pickup location and destination hospital
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ambulanceId">Ambulance ID</Label>
                <Input
                  id="ambulanceId"
                  placeholder="e.g., AMB-001"
                  value={ambulanceId}
                  onChange={(e) => setAmbulanceId(e.target.value)}
                  required
                  className="bg-input/50"
                />
              </div>

              <div className="space-y-2">
                <Label>Pickup Location</Label>
                <Select value={source} onValueChange={setSource} required>
                  <SelectTrigger className="bg-input/50">
                    <SelectValue placeholder="Select pickup location" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANGALORE_LOCATIONS.map((location) => (
                      <SelectItem key={location.name} value={location.name}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-green-500" />
                          {location.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Destination Hospital</Label>
                <Select value={destination} onValueChange={setDestination} required>
                  <SelectTrigger className="bg-input/50">
                    <SelectValue placeholder="Select hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOSPITALS.map((hospital) => (
                      <SelectItem key={hospital.name} value={hospital.name}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-red-500" />
                          {hospital.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Trip...
                  </>
                ) : (
                  <>
                    <Navigation className="mr-2 h-4 w-4" />
                    Create Trip
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
