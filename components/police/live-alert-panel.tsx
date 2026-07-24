'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Siren } from 'lucide-react'
import type { LiveAlertItem } from '@/lib/police-actions'
import { cn } from '@/lib/utils'
import { PoliceEmptyState } from '@/components/police/empty-state'

const levelStyles = {
  critical: {
    border: 'border-emergency/40',
    bg: 'bg-emergency/10',
    icon: 'text-emergency',
    Icon: Siren,
  },
  warning: {
    border: 'border-warning/40',
    bg: 'bg-warning/10',
    icon: 'text-warning',
    Icon: AlertTriangle,
  },
  clear: {
    border: 'border-success/40',
    bg: 'bg-success/10',
    icon: 'text-success',
    Icon: CheckCircle2,
  },
} as const

export function LiveAlertPanel({ alerts }: { alerts: LiveAlertItem[] }) {
  // Sort order: pending (critical) -> monitoring (warning) -> resolved (clear)
  const sortedAlerts = [...alerts].sort((a, b) => {
    const score = { critical: 3, warning: 2, clear: 1 }
    return score[b.level] - score[a.level]
  })

  const hasPendingOrMonitoring = alerts.some((a) => a.level !== 'clear')

  return (
    <div className="glass-card flex h-full min-h-[460px] flex-col rounded-2xl border border-white/10 p-5 shadow-xl bg-[#07111f]/45">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">EOC Alert Desk</h2>
          <p className="text-xs text-muted-foreground">Real-time route bottlenecks</p>
        </div>
        <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-semibold text-muted-foreground shadow-sm">
          {alerts.filter((a) => a.level === 'critical').length} pending
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-auto pr-1">
        <AnimatePresence mode="popLayout">
          {sortedAlerts.length === 0 ? (
            <PoliceEmptyState
              key="empty-alerts"
              title="All ambulance routes are clear. No police assistance required."
              description="No traffic congestion or roadblocks reported on active routes."
              variant="clear"
            />
          ) : (
            sortedAlerts.map((alert) => {
              const statusName = {
                critical: 'Pending',
                warning: 'Monitoring',
                clear: 'Resolved',
              }[alert.level]

              const style = {
                critical: {
                  border: 'border-red-500/25 hover:border-red-500/40 bg-red-950/5',
                  icon: 'text-red-400',
                  badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
                  Icon: Siren,
                },
                warning: {
                  border: 'border-amber-500/25 hover:border-amber-500/40 bg-amber-950/5',
                  icon: 'text-amber-400',
                  badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                  Icon: AlertTriangle,
                },
                clear: {
                  border: 'border-emerald-500/20 hover:border-emerald-500/35 bg-emerald-950/5',
                  icon: 'text-emerald-400',
                  badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                  Icon: CheckCircle2,
                },
              }[alert.level]

              const Icon = style.Icon

              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, x: 50, scale: 0.95 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    backgroundColor: alert.level === 'critical' ? ['rgba(239,68,68,0.15)', 'rgba(12,25,44,0.4)'] : undefined,
                  }}
                  exit={{ opacity: 0, x: -50, scale: 0.9, height: 0, marginBottom: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                >
                  <Link
                    href={`/police/ambulance/${alert.tripId}`}
                    className={cn(
                      'block rounded-xl border p-4 transition-all duration-300 hover:shadow-lg hover:shadow-black/20',
                      style.border,
                    )}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                        <Icon className={cn('h-4.5 w-4.5', style.icon)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-foreground tracking-tight">{alert.title}</p>
                          <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest', style.badge)}>
                            {statusName}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{alert.detail}</p>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/80 border-t border-white/5 pt-2">
                          <span className="font-mono">{alert.ambulanceId}</span>
                          <span className="truncate max-w-[150px]">→ {alert.destination}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
