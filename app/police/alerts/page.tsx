'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bell,
  AlertTriangle,
  WifiOff,
  Navigation,
  Info,
  CheckCircle,
  RefreshCw,
  Clock,
} from 'lucide-react'
import type {
  PoliceAlert,
  AlertStatus,
  AlertType,
  RouteCondition,
  PoliceDecision,
  RouteState,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const alertTypeConfig: Record<AlertType, { icon: React.ElementType; color: string }> = {
  traffic: { icon: AlertTriangle, color: 'text-yellow-500' },
  network_failure: { icon: WifiOff, color: 'text-red-500' },
  route_assessment: { icon: Navigation, color: 'text-blue-500' },
  general: { icon: Info, color: 'text-gray-500' },
}

type AlertFilter = 'all' | 'pending' | 'acknowledged' | 'resolved'

const FILTERS: { id: AlertFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'acknowledged', label: 'Waiting for Clearance' },
  { id: 'resolved', label: 'Resolved' },
]

function alertStatusLabel(status: AlertStatus) {
  if (status === 'acknowledged') return 'Waiting for Clearance'
  if (status === 'pending') return 'Pending'
  return 'Resolved'
}

function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        status === 'pending' && 'border-red-500/40 bg-red-500/15 text-red-400',
        status === 'acknowledged' && 'border-yellow-500/40 bg-yellow-500/15 text-yellow-400',
        status === 'resolved' && 'border-green-500/40 bg-green-500/15 text-green-400',
      )}
    >
      {alertStatusLabel(status)}
    </span>
  )
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<
    (PoliceAlert & {
      trip?: { ambulance_id: string; source: string; destination: string }
    })[]
  >([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AlertFilter>('all')
  const supabase = createClient()

  const loadAlerts = async () => {
    const { data } = await supabase
      .from('police_alerts')
      .select('*, trip:ambulance_trips(ambulance_id, source, destination, route_data)')
      .order('created_at', { ascending: false })

    if (data) setAlerts(data)
    setLoading(false)
  }

  useEffect(() => {
    loadAlerts()

    const channel = supabase
      .channel('police-alerts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'police_alerts',
        },
        () => {
          loadAlerts()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateAlertStatus = async (alertId: string, status: AlertStatus) => {
    await supabase
      .from('police_alerts')
      .update({ alert_status: status, updated_at: new Date().toISOString() })
      .eq('id', alertId)

    loadAlerts()
  }

  const respondToAlert = async (
    alert: PoliceAlert,
    decision: PoliceDecision,
    condition: RouteCondition,
    routeState: RouteState,
    response: string,
  ) => {
    const { data: routeData } = await supabase
      .from('ambulance_trips')
      .select('route_data')
      .eq('id', alert.trip_id)
      .single()

    const nextRouteData = {
      ...(routeData?.route_data ?? {}),
      policeDecision: decision,
      policeDecisionAt: new Date().toISOString(),
      policeMessage: response,
      routeState,
    }

    await supabase
      .from('ambulance_trips')
      .update({
        route_condition: condition,
        route_data: nextRouteData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', alert.trip_id)

    await supabase
      .from('police_alerts')
      .update({
        alert_status: 'resolved',
        message: `${alert.message ?? ''} Police decision: ${response}.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', alert.id)

    loadAlerts()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const filteredAlerts = useMemo(
    () => (filter === 'all' ? alerts : alerts.filter((a) => a.alert_status === filter)),
    [alerts, filter],
  )

  const pendingCount = alerts.filter((a) => a.alert_status === 'pending').length
  const waitingCount = alerts.filter((a) => a.alert_status === 'acknowledged').length
  const resolvedCount = alerts.filter((a) => a.alert_status === 'resolved').length

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Alerts</h1>
            <p className="text-sm text-muted-foreground">
              Realtime Pending → Waiting for Clearance → Resolved
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg bg-red-500/10 px-3 py-1.5 text-sm text-red-400">
              {pendingCount} Pending
            </div>
            <div className="rounded-lg bg-yellow-500/10 px-3 py-1.5 text-sm text-yellow-400">
              {waitingCount} Waiting
            </div>
            <div className="rounded-lg bg-green-500/10 px-3 py-1.5 text-sm text-green-400">
              {resolvedCount} Resolved
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              variant={filter === item.id ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {filteredAlerts.length === 0 ? (
          <Card className="glass-card border-white/10">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">No Alerts</h3>
              <p className="text-center text-muted-foreground">
                {filter === 'all'
                  ? 'No alerts have been created yet.'
                  : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} alerts at the moment.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => {
              const typeConfig = alertTypeConfig[alert.alert_type]
              const TypeIcon = typeConfig.icon

              return (
                <Card key={alert.id} className="glass-card border-white/10">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg bg-secondary ${typeConfig.color}`}
                        >
                          <TypeIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base capitalize">
                            {alert.alert_type.replace('_', ' ')} Alert
                          </CardTitle>
                          <CardDescription>
                            {alert.trip?.ambulance_id || 'Unknown Ambulance'}
                          </CardDescription>
                        </div>
                      </div>
                      <AlertStatusBadge status={alert.alert_status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {alert.trip && (
                        <p className="text-sm text-muted-foreground">
                          Route: {alert.trip.source} → {alert.trip.destination}
                        </p>
                      )}
                      {alert.message && (
                        <p className="text-sm text-foreground">{alert.message}</p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDate(alert.created_at)}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {alert.alert_status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => updateAlertStatus(alert.id, 'acknowledged')}
                              >
                                Mark Waiting for Clearance
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() =>
                                  respondToAlert(
                                    alert,
                                    'CLEAR_ROUTE',
                                    'clear',
                                    'CLEARED',
                                    'Clear Route',
                                  )
                                }
                              >
                                Clear Route
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  respondToAlert(
                                    alert,
                                    'REROUTE_REQUIRED',
                                    'heavy_congestion',
                                    'REROUTING',
                                    'Reroute Required',
                                  )
                                }
                              >
                                Reroute Required
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  respondToAlert(
                                    alert,
                                    'ROAD_BLOCK_CONFIRMED',
                                    'road_blocked',
                                    'REROUTING',
                                    'Road Block Confirmed',
                                  )
                                }
                              >
                                Road Block Confirmed
                              </Button>
                            </>
                          )}
                          {alert.alert_status === 'acknowledged' && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() =>
                                  respondToAlert(
                                    alert,
                                    'CLEAR_ROUTE',
                                    'clear',
                                    'CLEARED',
                                    'Clear Route',
                                  )
                                }
                              >
                                Clear Route
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  respondToAlert(
                                    alert,
                                    'REROUTE_REQUIRED',
                                    'heavy_congestion',
                                    'REROUTING',
                                    'Reroute Required',
                                  )
                                }
                              >
                                Reroute Required
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  respondToAlert(
                                    alert,
                                    'ROAD_BLOCK_CONFIRMED',
                                    'road_blocked',
                                    'REROUTING',
                                    'Road Block Confirmed',
                                  )
                                }
                              >
                                Road Block Confirmed
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateAlertStatus(alert.id, 'resolved')}
                              >
                                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                Mark Resolved
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
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
