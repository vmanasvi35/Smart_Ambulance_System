'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
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
import type { PoliceAlert, AlertStatus, AlertType, RouteCondition, PoliceDecision, RouteState } from '@/lib/types'

const alertTypeConfig: Record<AlertType, { icon: React.ElementType; color: string }> = {
  traffic: { icon: AlertTriangle, color: 'text-yellow-500' },
  network_failure: { icon: WifiOff, color: 'text-red-500' },
  route_assessment: { icon: Navigation, color: 'text-blue-500' },
  general: { icon: Info, color: 'text-gray-500' },
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<(PoliceAlert & { trip?: { ambulance_id: string; source: string; destination: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | AlertStatus>('all')
  const supabase = createClient()

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
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadAlerts = async () => {
    const { data } = await supabase
      .from('police_alerts')
      .select('*, trip:ambulance_trips(ambulance_id, source, destination, route_data)')
      .order('created_at', { ascending: false })

    if (data) setAlerts(data)
    setLoading(false)
  }

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

  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter(a => a.alert_status === filter)

  const pendingCount = alerts.filter(a => a.alert_status === 'pending').length
  const acknowledgedCount = alerts.filter(a => a.alert_status === 'acknowledged').length

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
            <h1 className="text-xl font-semibold text-foreground">Alerts</h1>
            <p className="text-sm text-muted-foreground">
              Manage traffic and network alerts
            </p>
          </div>
          <div className="flex items-center gap-4">
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-red-400">
                <Bell className="h-4 w-4" />
                <span className="text-sm font-medium">{pendingCount} Pending</span>
              </div>
            )}
            {acknowledgedCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-1.5 text-blue-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{acknowledgedCount} In Progress</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2">
          {(['all', 'pending', 'acknowledged', 'resolved'] as const).map((status) => (
            <Button
              key={status}
              variant={filter === status ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setFilter(status)}
              className="capitalize"
            >
              {status === 'all' ? 'All Alerts' : status}
            </Button>
          ))}
        </div>

        {filteredAlerts.length === 0 ? (
          <Card className="glass-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">No Alerts</h3>
              <p className="text-center text-muted-foreground">
                {filter === 'all'
                  ? 'No alerts have been created yet.'
                  : `No ${filter} alerts at the moment.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => {
              const typeConfig = alertTypeConfig[alert.alert_type]
              const TypeIcon = typeConfig.icon

              return (
                <Card key={alert.id} className="glass-card border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-secondary ${typeConfig.color}`}>
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
                      <StatusBadge status={alert.alert_status} />
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
                      <div className="flex items-center justify-between">
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
                                Acknowledge
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => respondToAlert(alert, 'CLEAR_ROUTE', 'clear', 'CLEARED', 'Clear Route')}
                              >
                                Clear Route
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => respondToAlert(alert, 'REROUTE_REQUIRED', 'heavy_congestion', 'REROUTING', 'Reroute Required')}
                              >
                                Reroute Required
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => respondToAlert(alert, 'ROAD_BLOCK_CONFIRMED', 'road_blocked', 'REROUTING', 'Road Block Confirmed')}
                              >
                                Road Block Confirmed
                              </Button>
                            </>
                          )}
                          {alert.alert_status === 'acknowledged' && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => respondToAlert(alert, 'CLEAR_ROUTE', 'clear', 'CLEARED', 'Clear Route')}
                              >
                                Clear Route
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => respondToAlert(alert, 'REROUTE_REQUIRED', 'heavy_congestion', 'REROUTING', 'Reroute Required')}
                              >
                                Reroute Required
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => respondToAlert(alert, 'ROAD_BLOCK_CONFIRMED', 'road_blocked', 'REROUTING', 'Road Block Confirmed')}
                              >
                                Road Block Confirmed
                              </Button>
                            </div>
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
