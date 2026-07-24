'use client'

import { useState } from 'react'
import { Search, User, MapPin, Clock, BadgeCheck, Eye } from 'lucide-react'
import { Input as CustomInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TRIP_WORKFLOW_STATUS } from '@/lib/trip-status'

export type AmbulanceStatus = 'available' | 'assigned' | 'accepted' | 'going_to_pickup' | 'patient_onboard' | 'en_route_hospital' | 'completed' | 'offline'

export interface Ambulance {
  id: string
  driverName: string
  status: AmbulanceStatus
  locationName: string
  lat: number
  lng: number
  eta?: number // in minutes
  clearanceStatus?: 'pending' | 'clearing' | 'cleared'
}

interface DispatchAmbulanceListProps {
  ambulances: Ambulance[]
  selectedAmbulanceId?: string | null
  onSelectAmbulance?: (ambulance: Ambulance) => void
}

export function DispatchAmbulanceList({
  ambulances,
  selectedAmbulanceId,
  onSelectAmbulance,
}: DispatchAmbulanceListProps) {
  const [search, setSearch] = useState('')

  const filteredAmbulances = ambulances.filter(
    (amb) =>
      amb.id.toLowerCase().includes(search.toLowerCase()) ||
      amb.driverName.toLowerCase().includes(search.toLowerCase()) ||
      amb.locationName.toLowerCase().includes(search.toLowerCase())
  )

  const statusConfig = {
    available: {
      label: TRIP_WORKFLOW_STATUS.available,
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
      dotClass: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
    },
    assigned: {
      label: TRIP_WORKFLOW_STATUS.assigned,
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.15)]',
      dotClass: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]',
    },
    accepted: {
      label: TRIP_WORKFLOW_STATUS.accepted,
      badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.15)]',
      dotClass: 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]',
    },
    going_to_pickup: {
      label: TRIP_WORKFLOW_STATUS.goingToPickup,
      badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.15)]',
      dotClass: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]',
    },
    patient_onboard: {
      label: TRIP_WORKFLOW_STATUS.patientOnboard,
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      dotClass: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
    },
    en_route_hospital: {
      label: TRIP_WORKFLOW_STATUS.enRouteHospital,
      badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30 shadow-[0_0_12px_rgba(249,115,22,0.15)]',
      dotClass: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]',
    },
    completed: {
      label: TRIP_WORKFLOW_STATUS.completed,
      badgeClass: 'bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
      dotClass: 'bg-green-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
    },
    offline: {
      label: 'Offline',
      badgeClass: 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]',
      dotClass: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
    },
  }

  return (
    <div className="glass-card flex flex-col rounded-2xl border border-white/10 bg-[#07111f]/60 h-full shadow-lg">
      <div className="p-4 border-b border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground tracking-wide flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Ambulance Fleet Status ({ambulances.length})
          </h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <CustomInput
            placeholder="Search ID, driver, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500/30 rounded-xl"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[460px] p-2 space-y-2 scrollbar-thin">
        {filteredAmbulances.length > 0 ? (
          filteredAmbulances.map((amb) => {
            const config = statusConfig[amb.status] ?? statusConfig.available
            const isSelected = selectedAmbulanceId === amb.id

            return (
              <div
                key={amb.id}
                onClick={() => onSelectAmbulance?.(amb)}
                className={cn(
                  'group flex flex-col gap-2 rounded-xl p-3 border border-transparent bg-white/[0.02] cursor-pointer hover:bg-white/[0.06] hover:border-white/10 transition-all duration-200',
                  isSelected && 'bg-white/[0.08] border-white/20 shadow-md ring-1 ring-white/10'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-slate-300 group-hover:text-foreground transition-colors">
                      {amb.id}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 font-medium">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{amb.driverName}</span>
                    </div>
                  </div>

                  <Badge className={cn('text-[10px] font-bold px-2 py-0.5 border', config.badgeClass)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full mr-1.5 shrink-0', config.dotClass)} />
                    {config.label}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-white/5 pt-2 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1 font-medium">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
                    <span className="truncate max-w-[120px]">{amb.locationName}</span>
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[10px] text-amber-400 font-bold bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 rounded">
                    <Clock className="h-3 w-3 shrink-0 text-amber-500" />
                    <span>{amb.status === 'available' ? 'Immediate' : `${amb.eta ?? 5}m ETA`}</span>
                  </div>
                </div>
                {amb.clearanceStatus && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-semibold text-slate-300">
                    <span className={
                      `inline-flex items-center rounded-full px-2 py-1 border text-[10px] font-bold ${
                        amb.clearanceStatus === 'pending'
                          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25'
                          : amb.clearanceStatus === 'clearing'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                      }`
                    >
                      {amb.clearanceStatus === 'pending' ? 'Clearance Pending' : amb.clearanceStatus === 'clearing' ? 'Clearing' : 'Cleared'}
                    </span>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="py-12 text-center text-xs text-muted-foreground">
            No matching ambulances found.
          </div>
        )}
      </div>
    </div>
  )
}
