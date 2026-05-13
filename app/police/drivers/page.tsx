'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { Users, User, Clock, Navigation, RefreshCw, Ambulance } from 'lucide-react'
import type { Profile, AmbulanceTrip } from '@/lib/types'

interface DriverWithTrip extends Profile {
  active_trip?: AmbulanceTrip | null
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverWithTrip[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadDrivers()

    const channel = supabase
      .channel('driver-status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ambulance_trips',
        },
        () => {
          loadDrivers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadDrivers = async () => {
    // Get all drivers
    const { data: driversData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'driver')
      .order('full_name')

    if (driversData) {
      // Get active trips for each driver
      const driversWithTrips = await Promise.all(
        driversData.map(async (driver) => {
          const { data: tripData } = await supabase
            .from('ambulance_trips')
            .select('*')
            .eq('driver_id', driver.id)
            .in('status', ['pending', 'in_progress'])
            .limit(1)
            .single()

          return {
            ...driver,
            active_trip: tripData,
          }
        })
      )

      setDrivers(driversWithTrips)
    }
    setLoading(false)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const activeDrivers = drivers.filter(d => d.active_trip)
  const availableDrivers = drivers.filter(d => !d.active_trip)

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
            <h1 className="text-xl font-semibold text-foreground">Active Drivers</h1>
            <p className="text-sm text-muted-foreground">
              Monitor all registered ambulance drivers
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-red-400">
              <Ambulance className="h-4 w-4" />
              <span className="text-sm font-medium">{activeDrivers.length} On Duty</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-green-400">
              <User className="h-4 w-4" />
              <span className="text-sm font-medium">{availableDrivers.length} Available</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {drivers.length === 0 ? (
          <Card className="glass-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">No Drivers</h3>
              <p className="text-center text-muted-foreground">
                No drivers have registered yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Active Drivers */}
            {activeDrivers.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  On Active Duty
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {activeDrivers.map((driver) => (
                    <Card key={driver.id} className="glass-card border-red-500/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                            <User className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{driver.full_name}</CardTitle>
                            <CardDescription>{driver.email}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {driver.active_trip && (
                          <div className="space-y-3 rounded-lg bg-secondary/50 p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                {driver.active_trip.ambulance_id}
                              </span>
                              <StatusBadge status={driver.active_trip.status} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {driver.active_trip.source} → {driver.active_trip.destination}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {driver.active_trip.eta ? `${driver.active_trip.eta} min` : '--'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Navigation className="h-3 w-3" />
                                {driver.active_trip.distance
                                  ? `${driver.active_trip.distance.toFixed(1)} km`
                                  : '--'}
                              </span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Available Drivers */}
            {availableDrivers.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  Available
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {availableDrivers.map((driver) => (
                    <Card key={driver.id} className="glass-card border-border/50">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-400">
                            <User className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{driver.full_name}</CardTitle>
                            <CardDescription>{driver.email}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Joined {formatDate(driver.created_at)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
