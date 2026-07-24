'use client'

import { motion } from 'framer-motion'
import { Ambulance, CheckCircle2, MapPinned, Route } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PoliceEmptyState({
  title,
  description,
  variant = 'neutral',
}: {
  title: string
  description?: string
  variant?: 'clear' | 'neutral'
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center"
    >
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border',
          variant === 'clear'
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-primary/30 bg-primary/10 text-primary',
        )}
      >
        {variant === 'clear' ? (
          <CheckCircle2 className="h-7 w-7" />
        ) : (
          <Ambulance className="h-7 w-7" />
        )}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>}
    </motion.div>
  )
}

export function ActivitySummary({
  assisted,
  routesCleared,
  alertsHandled,
}: {
  assisted: number
  routesCleared: number
  alertsHandled: number
}) {
  const items = [
    { label: 'Ambulances Assisted', value: assisted, icon: Ambulance, tone: 'text-blue-400' },
    { label: 'Routes Cleared', value: routesCleared, icon: CheckCircle2, tone: 'text-emerald-400' },
    { label: 'Alerts Handled', value: alertsHandled, icon: Route, tone: 'text-amber-400' },
  ] as const

  return (
    <div className="glass-card rounded-2xl border border-white/10 p-5 shadow-xl bg-[#07111f]/45">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground tracking-tight">Today&apos;s Activity</h2>
        <p className="text-xs text-muted-foreground">Resets daily · Operational summary</p>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {items.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
            className="rounded-xl border border-white/10 bg-[#0c192c]/30 p-4 transition-all hover:bg-white/[0.04]"
          >
            <item.icon className={cn('mb-3.5 h-5 w-5', item.tone)} />
            <p className="text-2xl font-black tabular-nums text-foreground tracking-tight">{item.value}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground/80">{item.label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
