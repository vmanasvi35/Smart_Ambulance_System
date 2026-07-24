'use client'

import { AlertTriangle, MapPin, Calendar, Clock, HeartHandshake } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface EmergencyRequest {
  id: string
  pickupLocation: string
  pickupLat: number
  pickupLng: number
  destinationHospital: string
  destLat: number
  destLng: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  timeAgo: string
  status: 'pending' | 'assigned' | 'completed'
  assignedAmbulanceId?: string
  patientName?: string
  emergencyType?: string
  notes?: string
  createdAt?: string
}

interface DispatchEmergencyQueueProps {
  emergencies: EmergencyRequest[]
  onAssignAmbulance: (emergency: EmergencyRequest) => void
}

export function DispatchEmergencyQueue({
  emergencies,
  onAssignAmbulance,
}: DispatchEmergencyQueueProps) {
  const priorityConfig = {
    critical: {
      label: 'CRITICAL',
      badgeClass: 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse',
      cardBorder: 'hover:border-red-500/35 border-l-4 border-l-red-500',
    },
    high: {
      label: 'HIGH',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      cardBorder: 'hover:border-amber-500/35 border-l-4 border-l-amber-500',
    },
    medium: {
      label: 'MEDIUM',
      badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      cardBorder: 'hover:border-yellow-500/35 border-l-4 border-l-yellow-500',
    },
    low: {
      label: 'LOW',
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      cardBorder: 'hover:border-blue-500/35 border-l-4 border-l-blue-500',
    },
  }

  const pendingEmergencies = emergencies.filter((e) => e.status === 'pending')

  return (
    <div className="glass-card flex flex-col rounded-2xl border border-white/10 bg-[#07111f]/60 h-full shadow-lg">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-bold text-foreground tracking-wide flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          Emergency Dispatch Queue ({pendingEmergencies.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[460px] p-4 space-y-3 scrollbar-thin">
        {pendingEmergencies.length > 0 ? (
          pendingEmergencies.map((req) => {
            const config = priorityConfig[req.priority] ?? priorityConfig.critical

            return (
              <div
                key={req.id}
                className={cn(
                  'group flex flex-col gap-3 rounded-xl p-3.5 bg-white/[0.02] border border-white/5 transition-all duration-200',
                  config.cardBorder
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-slate-300">
                      INCIDENT-{req.id}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 font-semibold">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{req.timeAgo}</span>
                    </div>
                  </div>

                  <Badge className={cn('text-[9px] font-extrabold px-1.5 py-0.5 border tracking-wider', config.badgeClass)}>
                    {config.label}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-300">Patient: </span>
                      <span>{req.patientName || 'Unspecified'}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <MapPin className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-300">Pickup: </span>
                      <span>{req.pickupLocation}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <HeartHandshake className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-300">Hospital: </span>
                      <span>{req.destinationHospital}</span>
                    </div>
                  </div>

                  {(req.emergencyType || req.notes) && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[10px] text-slate-300">
                      {req.emergencyType && <div><span className="font-semibold text-slate-200">Type:</span> {req.emergencyType}</div>}
                      {req.notes && <div className="mt-1"><span className="font-semibold text-slate-200">Notes:</span> {req.notes}</div>}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    onClick={() => onAssignAmbulance(req)}
                    size="sm"
                    className="h-8 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 active:scale-95 transition-transform"
                  >
                    Assign Ambulance
                  </Button>
                </div>
              </div>
            )
          })
        ) : (
          <div className="py-16 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <span className="text-3xl">✅</span>
            <span>All emergency incidents have been dispatched.</span>
          </div>
        )}
      </div>
    </div>
  )
}
