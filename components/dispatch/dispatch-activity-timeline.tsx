'use client'

import { cn } from '@/lib/utils'
import { CheckCircle2, ShieldAlert, Truck, UserCheck, Heart } from 'lucide-react'

export interface ActivityLog {
  id: string
  type: 'assigned' | 'accepted' | 'picked_up' | 'reached' | 'completed'
  ambulanceId: string
  driverName: string
  location?: string
  timestamp: string
  message: string
}

interface DispatchActivityTimelineProps {
  logs: ActivityLog[]
}

export function DispatchActivityTimeline({ logs }: DispatchActivityTimelineProps) {
  const iconConfig = {
    assigned: {
      icon: Truck,
      bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
    accepted: {
      icon: UserCheck,
      bg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    },
    picked_up: {
      icon: ShieldAlert,
      bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    },
    reached: {
      icon: Heart,
      bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    },
    completed: {
      icon: CheckCircle2,
      bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
  }

  return (
    <div className="glass-card flex flex-col rounded-2xl border border-white/10 bg-[#07111f]/60 h-full shadow-lg">
      <div className="p-4 border-b border-white/10">
        <h3 className="font-bold text-foreground tracking-wide flex items-center gap-2">
          Recent Dispatch Activity
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[300px] p-4 space-y-4 scrollbar-thin">
        {logs.length > 0 ? (
          <div className="relative pl-6 border-l border-white/10 space-y-5 ml-2.5">
            {logs.map((log) => {
              const config = iconConfig[log.type] || iconConfig.assigned
              const Icon = config.icon

              return (
                <div key={log.id} className="relative group">
                  {/* Timeline point */}
                  <span className={cn(
                    'absolute -left-[35px] top-0 flex h-7 w-7 items-center justify-center rounded-lg border bg-[#07111f] transition-all duration-300',
                    config.bg
                  )}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  {/* Content */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-200">
                        {log.message}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {log.timestamp}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      Ambulance: <span className="font-mono text-slate-300 font-bold">{log.ambulanceId}</span> ({log.driverName})
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-muted-foreground">
            No dispatch logs available yet.
          </div>
        )}
      </div>
    </div>
  )
}
