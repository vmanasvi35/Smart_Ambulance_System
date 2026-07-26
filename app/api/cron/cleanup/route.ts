import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function performCleanup() {
  const supabase = await createClient()

  // Calculate the date 30 days ago
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thresholdISO = thirtyDaysAgo.toISOString()

  // 1. Delete police alerts older than 30 days (deleted first to prevent FK constraint issues)
  const { error: alertsError, count: alertsCount } = await supabase
    .from('police_alerts')
    .delete({ count: 'exact' })
    .lt('created_at', thresholdISO)

  // 2. Resolve duplicate active police alerts for the same trip before deleting old data
  const { data: duplicateAlerts } = await supabase
    .from('police_alerts')
    .select('id, trip_id, created_at')
    .in('alert_status', ['pending', 'acknowledged'])
    .order('trip_id', { ascending: true })
    .order('created_at', { ascending: false })

  if (duplicateAlerts && duplicateAlerts.length > 0) {
    const alertsByTrip = duplicateAlerts.reduce<Record<string, { id: string; created_at: string }[]>>(
      (acc, alert) => {
        acc[alert.trip_id] = acc[alert.trip_id] ?? []
        acc[alert.trip_id].push(alert)
        return acc
      },
      {},
    )

    const alertsToResolve: string[] = []
    for (const tripId in alertsByTrip) {
      const alerts = alertsByTrip[tripId]
      if (alerts.length > 1) {
        alerts.slice(1).forEach((alert) => alertsToResolve.push(alert.id))
      }
    }

    if (alertsToResolve.length) {
      await supabase
        .from('police_alerts')
        .update({
          alert_status: 'resolved',
          message: 'Duplicate active alert merged during scheduled cleanup.',
          updated_at: new Date().toISOString(),
        })
        .in('id', alertsToResolve)
    }
  }

  // 3. Delete completed or cancelled trips older than 30 days
  const { error: tripsError, count: tripsCount } = await supabase
    .from('ambulance_trips')
    .delete({ count: 'exact' })
    .lt('created_at', thresholdISO)
    .in('status', ['completed', 'cancelled'])

  if (alertsError || tripsError) {
    return {
      success: false,
      error: { alertsError, tripsError },
    }
  }

  return {
    success: true,
    deletedAlerts: alertsCount ?? 0,
    deletedTrips: tripsCount ?? 0,
    message: 'Monthly database cleanup completed successfully.',
  }
}

export async function GET() {
  const result = await performCleanup()
  if (!result.success) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}

export async function POST() {
  const result = await performCleanup()
  if (!result.success) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}
