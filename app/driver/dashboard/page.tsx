'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AmbulanceMap } from '@/components/ambulance-map'
import { StatusBadge } from '@/components/status-badge'
import { 
  Activity, 
  Clock, 
  MapPin, 
  Navigation, 
  AlertTriangle,
  Play,
  Square,
  RefreshCw,
} from 'lucide-react'
import type { AmbulanceTrip, Profile } from '@/lib/types'
import Link from 'next/link'

export default function DriverDashboard() {
  const [activeTrip, setActiveTrip] = useState<AmbulanceTrip | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadData()
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('driver-trips')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ambulance_trips',
        },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (profileData) setProfile(profileData)

    // Load active trip
    const { data: tripData } = await supabase
      .from('ambulance_trips')
      .select('*')
      .eq('driver_id', user.id)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    setActiveTrip(tripData)
    setLoading(false)
  }

  const startTrip = async () => {
    if (!activeTrip) return
    
    await supabase
      .from('ambulance_trips')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', activeTrip.id)
    
    loadData()
  }

  const completeTrip = async () => {
    if (!activeTrip) return
    
    await supabase
      .from('ambulance_trips')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', activeTrip.id)
    
    loadData()
  }

  const simulateMovement = async () => {
    if (!activeTrip || !activeTrip.route_data?.waypoints || simulating) return
    
    setSimulating(true)
    const waypoints = activeTrip.route_data.waypoints as [number, number][]
    
    for (let i = 0; i < waypoints.length; i += 3) {
      const [lat, lng] = waypoints[i]
      const remainingDistance = ((waypoints.length - i) / waypoints.length) * (activeTrip.distance || 10)
      const remainingEta = Math.round(remainingDistance * 3) // ~3 min per km
      
      await supabase
        .from('ambulance_trips')
        .update({
          current_lat: lat,
          current_lng: lng,
          eta: remainingEta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTrip.id)
      
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    setSimulating(false)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Driver Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {profile?.full_name}
            </p>
          </div>
          {!activeTrip && (
            <Button asChild>
              <Link href="/driver/new-trip">
                <MapPin className="mr-2 h-4 w-4" />
                Start New Trip
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {activeTrip ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Active Trip Card */}
            <Card className="glass-card border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Active Trip
                  </CardTitle>
                  <StatusBadge status={activeTrip.status} />
                </div>
                <CardDescription>{activeTrip.ambulance_id}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Route Info */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-green-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Pickup Location</p>
                      <p className="font-medium text-foreground">{activeTrip.source}</p>
                    </div>
                  </div>
                  <div className="ml-1.5 h-8 w-px bg-border" />
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-red-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Hospital</p>
                      <p className="font-medium text-foreground">{activeTrip.destination}</p>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-secondary/50 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs">ETA</span>
                    </div>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {activeTrip.eta ? `${activeTrip.eta} min` : '--'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Navigation className="h-4 w-4" />
                      <span className="text-xs">Distance</span>
                    </div>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {activeTrip.distance ? `${activeTrip.distance.toFixed(1)} km` : '--'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs">Route</span>
                    </div>
                    <StatusBadge status={activeTrip.route_condition} className="mt-1" />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {activeTrip.status === 'pending' && (
                    <Button onClick={startTrip} className="flex-1">
                      <Play className="mr-2 h-4 w-4" />
                      Start Trip
                    </Button>
                  )}
                  {activeTrip.status === 'in_progress' && (
                    <>
                      <Button onClick={simulateMovement} disabled={simulating} variant="secondary" className="flex-1">
                        <Navigation className="mr-2 h-4 w-4" />
                        {simulating ? 'Simulating...' : 'Simulate Movement'}
                      </Button>
                      <Button onClick={completeTrip} variant="default" className="flex-1">
                        <Square className="mr-2 h-4 w-4" />
                        Complete Trip
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Map */}
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Live Tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AmbulanceMap
                  trips={[activeTrip]}
                  selectedTrip={activeTrip}
                  showAllTrips={false}
                  className="h-[400px]"
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="glass-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">No Active Trip</h3>
              <p className="mb-6 text-center text-muted-foreground">
                Start a new trip to begin tracking your route and coordinate with police.
              </p>
              <Button asChild>
                <Link href="/driver/new-trip">
                  <MapPin className="mr-2 h-4 w-4" />
                  Start New Trip
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
