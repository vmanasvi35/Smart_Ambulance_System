'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { History, MapPin, Clock, Navigation, RefreshCw } from 'lucide-react'
import type { AmbulanceTrip } from '@/lib/types'

export default function TripHistoryPage() {
  const [trips, setTrips] = useState<AmbulanceTrip[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadTrips()
  }, [])

  const loadTrips = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('ambulance_trips')
      .select('*')
      .eq('driver_id', user.id)
      .order('created_at', { ascending: false })

    if (data) setTrips(data)
    setLoading(false)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
        <div>
          <h1 className="text-xl font-semibold text-foreground">Trip History</h1>
          <p className="text-sm text-muted-foreground">
            View all your past and current trips
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {trips.length === 0 ? (
          <Card className="glass-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <History className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">No Trips Yet</h3>
              <p className="text-center text-muted-foreground">
                Your trip history will appear here once you complete your first trip.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {trips.map((trip) => (
              <Card key={trip.id} className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">
                      {trip.ambulance_id}
                    </CardTitle>
                    <StatusBadge status={trip.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-3 w-3 rounded-full bg-green-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">From</p>
                        <p className="text-sm font-medium text-foreground">{trip.source}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-3 w-3 rounded-full bg-red-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">To</p>
                        <p className="text-sm font-medium text-foreground">{trip.destination}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Navigation className="h-4 w-4" />
                      <span className="text-sm">
                        {trip.distance ? `${trip.distance.toFixed(1)} km` : '--'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">{formatDate(trip.created_at)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
