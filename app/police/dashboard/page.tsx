'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AmbulanceMap } from '@/components/ambulance-map'
import { StatusBadge } from '@/components/status-badge'
import {
  Activity,
  AlertTriangle,
  Clock,
  Navigation,
  RefreshCw,
  Ambulance,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import type { AmbulanceTrip, RouteCondition } from '@/lib/types'

export default function PoliceControlRoom() {
  const [trips, setTrips] = useState<AmbulanceTrip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<AmbulanceTrip | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadTrips()
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('police-trips')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ambulance_trips',
        },
        () => {
          loadTrips()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadTrips = async () => {
    const { data } = await supabase
      .from('ambulance_trips')
      .select('*, driver:profiles!ambulance_trips_driver_id_fkey(*)')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })

    if (data) {
      setTrips(data)
      // Update selected trip if it exists
      if (selectedTrip) {
        const updated = data.find(t => t.id === selectedTrip.id)
        setSelectedTrip(updated || null)
      }
    }
    setLoading(false)
  }

  const respondToRouteAlert = async (trip: AmbulanceTrip, condition: RouteCondition, response: string) => {
    const { data: { user } } = await supabase.auth.getUser()

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: condition,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)
    
    await supabase.from('police_alerts').insert({
      trip_id: trip.id,
      alert_type: condition === 'clear' ? 'route_assessment' : 'traffic',
      message: `${response} response issued for ${trip.ambulance_id}. Driver dashboard will handle navigation updates.`,
      assigned_police: user?.id,
      alert_status: 'resolved',
    })

    loadTrips()
  }

  const activeTrips = trips.filter(t => t.status === 'in_progress')
  const pendingTrips = trips.filter(t => t.status === 'pending')

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
            <h1 className="text-xl font-semibold text-foreground">Control Room</h1>
            <p className="text-sm text-muted-foreground">
              Real-time ambulance monitoring and coordination
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-red-400">
              <Activity className="h-4 w-4 animate-pulse" />
              <span className="text-sm font-medium">{activeTrips.length} Active</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-3 py-1.5 text-yellow-400">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">{pendingTrips.length} Pending</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Map - Takes 2 columns */}
          <Card className="glass-card border-border/50 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Navigation className="h-5 w-5 text-primary" />
                Live Map
              </CardTitle>
              <CardDescription>
                All active ambulances in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AmbulanceMap
                trips={trips}
                selectedTrip={selectedTrip}
                onTripSelect={setSelectedTrip}
                showAllTrips={true}
                className="h-[500px]"
              />
            </CardContent>
          </Card>

          {/* Trip List */}
          <div className="space-y-4">
            <Card className="glass-card border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ambulance className="h-4 w-4 text-primary" />
                  Active Ambulances
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trips.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No active trips at the moment
                  </p>
                ) : (
                  <div className="space-y-3">
                    {trips.map((trip) => (
                      <div
                        key={trip.id}
                        onClick={() => setSelectedTrip(trip)}
                        className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                          selectedTrip?.id === trip.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border/50 hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">
                            {trip.ambulance_id}
                          </span>
                          <StatusBadge status={trip.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {trip.source} → {trip.destination}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {trip.eta ? `${trip.eta} min` : '--'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Navigation className="h-3 w-3" />
                            {trip.distance ? `${trip.distance.toFixed(1)} km` : '--'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Trip Details */}
            {selectedTrip && (
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{selectedTrip.ambulance_id}</span>
                    <StatusBadge status={selectedTrip.status} />
                  </CardTitle>
                  <CardDescription>Trip Details & Actions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Route Info */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="mt-1 h-2 w-2 rounded-full bg-green-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">From</p>
                        <p className="text-sm font-medium">{selectedTrip.source}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">To</p>
                        <p className="text-sm font-medium">{selectedTrip.destination}</p>
                      </div>
                    </div>
                  </div>

                  {/* Police Response Actions */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Police Response</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => respondToRouteAlert(selectedTrip, 'clear', 'Route Cleared')}
                      >
                        <CheckCircle className="mr-1 h-3 w-3 text-green-500" />
                        Route Cleared
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => respondToRouteAlert(selectedTrip, 'heavy_congestion', 'Heavy Congestion')}
                      >
                        <AlertTriangle className="mr-1 h-3 w-3 text-orange-500" />
                        Heavy Congestion
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => respondToRouteAlert(selectedTrip, 'heavy_congestion', 'Cannot Clear')}
                      >
                        <XCircle className="mr-1 h-3 w-3 text-yellow-500" />
                        Cannot Clear
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => respondToRouteAlert(selectedTrip, 'road_blocked', 'Road Blocked')}
                      >
                        <XCircle className="mr-1 h-3 w-3 text-red-500" />
                        Road Blocked
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 text-xs text-muted-foreground">
                    Traffic is detected automatically from ambulance telemetry and simulations. Police responses only confirm the condition; rerouting is handled by the driver dashboard.
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      disabled
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Auto Traffic Alerts
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      disabled
                    >
                      <Navigation className="mr-1 h-3 w-3" />
                      Driver Rerouting
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
