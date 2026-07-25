'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, User, RefreshCw, Ambulance, Mail, CircleDot } from 'lucide-react'
import type { Profile, AmbulanceTrip } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DriverWithTrip extends Profile {
  active_trip?: AmbulanceTrip | null
}

/** Exclude placeholder / mock / test profile rows that are not real auth users. */
function isRealAuthenticatedDriver(driver: Profile): boolean {
  if (!driver?.id || !driver.email || !driver.full_name) return false
  if (driver.role !== 'driver') return false
  if (driver.id.startsWith('mock-') || driver.id.startsWith('sample-') || driver.id.startsWith('test-')) {
    return false
  }

  const email = driver.email.toLowerCase().trim()
  const name = driver.full_name.toLowerCase().trim()
  const blockedTokens = [
    'test',
    'dummy',
    'sample',
    'mock',
    'query',
    'placeholder',
    'example.com',
    'fake',
    'demo@',
  ]

  if (blockedTokens.some((token) => email.includes(token) || name.includes(token))) {
    return false
  }

  // Known dispatch fallback mock accounts
  const mockEmails = new Set([
    'rajesh@ambulance.com',
    'amit@ambulance.com',
    'priya@ambulance.com',
    'sneha@ambulance.com',
  ])
  if (mockEmails.has(email)) return false

  return true
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverWithTrip[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadDrivers()

    const tripsChannel = supabase
      .channel('driver-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulance_trips' },
        () => {
          loadDrivers()
        },
      )
      .subscribe()

    const profilesChannel = supabase
      .channel('driver-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          loadDrivers()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tripsChannel)
      supabase.removeChannel(profilesChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadDrivers = async () => {
    const { data: driversData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'driver')
      .order('full_name')

    const realDrivers = (driversData ?? []).filter(isRealAuthenticatedDriver)

    if (realDrivers.length === 0) {
      setDrivers([])
      setLoading(false)
      return
    }

    const driversWithTrips = await Promise.all(
      realDrivers.map(async (driver) => {
        const { data: tripData } = await supabase
          .from('ambulance_trips')
          .select('*')
          .eq('driver_id', driver.id)
          .in('status', ['pending', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        return {
          ...driver,
          active_trip: tripData,
        }
      }),
    )

    setDrivers(driversWithTrips)
    setLoading(false)
  }

  const onDuty = drivers.filter((d) => d.active_trip)
  const available = drivers.filter((d) => !d.active_trip)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/10 bg-[#07111f]/70 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Active Drivers</h1>
            <p className="text-sm text-muted-foreground">
              Authenticated Supabase driver accounts only
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-emergency/10 px-3 py-1.5 text-emergency">
              <Ambulance className="h-4 w-4" />
              <span className="text-sm font-medium">{onDuty.length} On Duty</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-1.5 text-success">
              <User className="h-4 w-4" />
              <span className="text-sm font-medium">{available.length} Available</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {drivers.length === 0 ? (
          <Card className="glass-card border-white/10">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">No drivers available</h3>
              <p className="max-w-md text-center text-sm text-muted-foreground">
                No authenticated driver accounts were found. Drivers appear here after they sign up
                through Supabase Authentication with the Driver role.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {drivers.map((driver) => {
              const isOnDuty = Boolean(driver.active_trip)
              return (
                <Card
                  key={driver.id}
                  className={cn(
                    'glass-card border-white/10',
                    isOnDuty && 'border-emergency/30',
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full',
                          isOnDuty
                            ? 'bg-emergency/15 text-emergency'
                            : 'bg-success/15 text-success',
                        )}
                      >
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-base">{driver.full_name}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-1.5 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          {driver.email}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Current Status</span>
                      <span className="font-medium text-foreground">
                        {isOnDuty
                          ? driver.active_trip?.status === 'in_progress'
                            ? 'On active trip'
                            : 'Assigned'
                          : 'Standby'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Assigned Ambulance</span>
                      <span className="font-medium text-foreground">
                        {driver.active_trip?.ambulance_id ?? 'None'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                      <span className="text-muted-foreground">Availability</span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                          isOnDuty
                            ? 'border-emergency/30 bg-emergency/10 text-emergency'
                            : 'border-success/30 bg-success/10 text-success',
                        )}
                      >
                        <CircleDot className="h-3 w-3" />
                        {isOnDuty ? 'Unavailable' : 'Available'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
