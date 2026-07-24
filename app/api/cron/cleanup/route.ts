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

  // 2. Delete completed or cancelled trips older than 30 days
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
