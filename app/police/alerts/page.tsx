'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bell,
  AlertTriangle,
  WifiOff,
  Navigation,
  Info,
  Clock,
  User,
  MapPin,
  Ambulance,
  Hospital,
  Shield,
  Search,
  RefreshCw,
} from 'lucide-react'
import type {
  PoliceAlert,
  AlertStatus,
  AlertType,
  AmbulanceTrip,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { priorityForTrip } from '@/lib/police-actions'

const alertTypeConfig: Record<AlertType, { icon: React.ElementType; color: string }> = {
  traffic: { icon: AlertTriangle, color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  network_failure: { icon: WifiOff, color: 'text-red-500 bg-red-500/10 border-red-500/20' },
  route_assessment: { icon: Navigation, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  general: { icon: Info, color: 'text-gray-500 bg-gray-500/10 border-gray-500/20' },
}

type AlertFilter = 'all' | 'pending' | 'active' | 'cleared' | 'rerouted' | 'completed'

const FILTERS: { id: AlertFilter; label: string }[] = [
  { id: 'all', label: 'All Alerts' },
  { id: 'pending', label: 'Pending' },
  { id: 'active', label: 'Active (Cleared/Managed/Reroute Req)' },
  { id: 'cleared', label: 'Cleared' },
  { id: 'rerouted', label: 'Rerouted' },
  { id: 'completed', label: 'Completed' },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<
    (PoliceAlert & {
      trip?: AmbulanceTrip | null
    })[]
  >([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AlertFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const supabase = createClient()

  const loadAlerts = async () => {
    const { data } = await supabase
      .from('police_alerts')
      .select('*, trip:ambulance_trips(*)')
      .order('created_at', { ascending: false })

    if (data) {
      // Fetch full driver profiles for each trip
      const alertsWithDrivers = await Promise.all(
        data.map(async (alert) => {
          if (alert.trip?.driver_id) {
            const { data: driverData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', alert.trip.driver_id)
              .single()
            if (driverData && alert.trip) {
              alert.trip.driver = driverData
            }
          }
          return alert
        })
      )
      setAlerts(alertsWithDrivers)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAlerts()

    const channel = supabase
      .channel('police-alerts-page')
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Search filter matching ID, driver, source, destination
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const ambId = alert.trip?.ambulance_id?.toLowerCase() || ''
        const driverName = alert.trip?.driver?.full_name?.toLowerCase() || ''
        const source = alert.trip?.source?.toLowerCase() || ''
        const dest = alert.trip?.destination?.toLowerCase() || ''
        const incidentId = `EMR-${alert.id.slice(0, 8)}`.toLowerCase()

        if (
          !ambId.includes(query) &&
          !driverName.includes(query) &&
          !source.includes(query) &&
          !dest.includes(query) &&
          !incidentId.includes(query)
        ) {
          return false
        }
      }

      if (filter === 'all') return true
      if (filter === 'pending') return alert.alert_status === 'pending'
      if (filter === 'active') return alert.alert_status === 'acknowledged'
      
      const routeData = (alert.trip?.route_data as Record<string, unknown> | null) ?? {}
      if (filter === 'cleared') {
        return alert.trip?.route_condition === 'clear' || routeData.policeDecision === 'CLEAR_ROUTE'
      }
      if (filter === 'rerouted') {
        return routeData.policeDecision === 'REROUTE_REQUIRED'
      }
      if (filter === 'completed') {
        return alert.trip?.status === 'completed'
      }
      return true
    })
  }, [alerts, filter, searchQuery])

  // Count summaries
  const pendingCount = alerts.filter((a) => a.alert_status === 'pending').length
  const activeCount = alerts.filter((a) => a.alert_status === 'acknowledged').length
  const clearedCount = alerts.filter((a) => {
    const rData = (a.trip?.route_data as Record<string, unknown> | null) ?? {}
    return a.trip?.route_condition === 'clear' || rData.policeDecision === 'CLEAR_ROUTE'
  }).length
  const reroutedCount = alerts.filter((a) => {
    const rData = (a.trip?.route_data as Record<string, unknown> | null) ?? {}
    return rData.policeDecision === 'REROUTE_REQUIRED'
  }).length
  const completedCount = alerts.filter((a) => a.trip?.status === 'completed').length

  return (
    <div className="flex h-screen flex-col bg-[#060e1a] text-foreground overflow-hidden">
      <header className="border-b border-white/10 bg-[#07111f]/90 px-6 py-4 backdrop-blur-xl shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wider uppercase text-foreground">Police Command Center</h1>
            <p className="text-xs text-muted-foreground">Emergency Corridor Clearance Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 border border-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.05)]">
            {pendingCount} Pending
          </div>
          <div className="rounded-lg bg-yellow-500/10 px-3 py-1.5 text-xs font-bold text-yellow-400 border border-yellow-500/20">
            {activeCount} Active
          </div>
          <div className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 border border-emerald-500/20">
            {completedCount} Completed
          </div>
        </div>
      </header>

      {/* Primary Workspace */}
      <div className="flex-1 p-6 flex flex-col min-h-0">
        
        {/* Search and Filters Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => {
              let count = 0
              if (item.id === 'all') count = alerts.length
              if (item.id === 'pending') count = pendingCount
              if (item.id === 'active') count = activeCount
              if (item.id === 'cleared') count = clearedCount
              if (item.id === 'rerouted') count = reroutedCount
              if (item.id === 'completed') count = completedCount

              return (
                <Button
                  key={item.id}
                  variant={filter === item.id ? 'default' : 'secondary'}
                  size="sm"
                  className={cn(
                    "text-xs px-3 h-9 rounded-xl border border-transparent font-bold tracking-wide",
                    filter === item.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-[#0b1424]/40 hover:bg-[#0b1424]/80 text-muted-foreground hover:text-foreground hover:border-white/5"
                  )}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label} ({count})
                </Button>
              )
            })}
          </div>

          <div className="relative w-full md:w-80 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search alert ID, driver, routes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-4 rounded-xl border border-white/10 bg-[#07111f]/60 text-sm font-semibold tracking-wide placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        {/* Alerts Cards List Container */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-2">
          {loading ? (
            <div className="flex h-full items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredAlerts.length === 0 ? (
            <Card className="glass-card border-white/10 py-16 flex flex-col items-center justify-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/25">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-base font-bold text-foreground">No alerts match filter</h3>
              <p className="text-sm text-muted-foreground max-w-sm text-center">
                We couldn't find any emergency telemetry alerts matching your current filters or query.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredAlerts.map((alert) => {
                const typeConfig = alertTypeConfig[alert.alert_type] || alertTypeConfig.general
                const TypeIcon = typeConfig.icon
                const isUrgent = alert.alert_status === 'pending' || alert.trip?.route_condition === 'road_blocked'
                const routeData = (alert.trip?.route_data as Record<string, unknown> | null) ?? {}

                return (
                  <Link
                    href={`/police/ambulance/${alert.trip_id}`}
                    key={alert.id}
                    className="block group"
                  >
                    <Card
                      className={cn(
                        "glass-card border-white/10 hover:border-primary/40 transition-all duration-300 h-full flex flex-col cursor-pointer bg-[#07111f]/35 hover:shadow-[0_0_20px_rgba(59,130,246,0.08)]",
                        isUrgent && "border-red-500/20 hover:border-red-500/40"
                      )}
                    >
                      <CardHeader className="pb-3 border-b border-white/5 shrink-0 flex flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", typeConfig.color)}>
                            <TypeIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-200">
                              EMR-{alert.id.slice(0, 8).toUpperCase()}
                            </CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground/80 mt-0.5">
                              {alert.alert_type.replace('_', ' ')}
                            </CardDescription>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
                            alert.alert_status === 'pending' && "border-red-500/30 bg-red-500/10 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.2)]",
                            alert.alert_status === 'acknowledged' && "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
                            alert.alert_status === 'resolved' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          )}
                        >
                          {alert.alert_status === 'acknowledged' ? 'Active' : alert.alert_status}
                        </span>
                      </CardHeader>

                      <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-4 text-xs">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <Ambulance className="h-3.5 w-3.5 text-blue-400" />
                              Ambulance
                            </span>
                            <span className="font-bold text-slate-200">{alert.trip?.ambulance_id || '—'}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-blue-400" />
                              Driver
                            </span>
                            <span className="font-bold text-slate-200 truncate max-w-[150px]">
                              {alert.trip?.driver?.full_name ?? '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Priority</span>
                            <span className={cn(
                              "font-bold uppercase",
                              alert.trip && priorityForTrip(alert.trip) === 'Critical' ? "text-red-400" : "text-slate-300"
                            )}>
                              {alert.trip ? priorityForTrip(alert.trip) : 'High'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Trip Status</span>
                            <span className="font-semibold text-slate-200 capitalize">
                              {alert.trip ? alert.trip.status.replace('_', ' ') : '—'}
                            </span>
                          </div>

                          <div className="border-t border-white/5 pt-2.5 space-y-1.5">
                            <div className="flex items-start gap-2">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                              <div className="min-w-0">
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Pickup</span>
                                <p className="font-medium text-slate-200 truncate">{alert.trip?.source || '—'}</p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Hospital className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                              <div className="min-w-0">
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Hospital</span>
                                <p className="font-medium text-slate-200 truncate">{alert.trip?.destination || '—'}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-3 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(alert.created_at)}
                          </span>
                          <span className="font-bold text-primary group-hover:underline">
                            Open Console →
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
