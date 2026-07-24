'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Navigation, AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  tone: 'success' | 'info' | 'warning' | 'emergency'
  hint: string
  delay: number
}

function StatCard({ label, value, icon: Icon, tone, hint, delay }: StatCardProps) {
  const tones = {
    success: {
      gradient: 'from-emerald-950/20 via-emerald-950/5 to-transparent',
      icon: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
      dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
      border: 'hover:border-emerald-500/30',
    },
    info: {
      gradient: 'from-blue-950/20 via-blue-950/5 to-transparent',
      icon: 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
      dot: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]',
      border: 'hover:border-blue-500/30',
    },
    warning: {
      gradient: 'from-amber-950/20 via-amber-950/5 to-transparent',
      icon: 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
      dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
      border: 'hover:border-amber-500/30',
    },
    emergency: {
      gradient: 'from-red-950/20 via-red-950/5 to-transparent',
      icon: 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
      dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
      border: 'hover:border-red-500/30',
    },
  }[tone]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -3, scale: 1.005 }}
      className={cn(
        'glass-card relative overflow-hidden rounded-2xl border border-white/10 p-5 shadow-lg shadow-black/20',
        'bg-gradient-to-br transition-all duration-300',
        tones.gradient,
        tones.border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="text-3xl font-extrabold text-foreground tracking-tight tabular-nums">
            {value}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground/80 font-medium">
            <span className={cn('h-1.5 w-1.5 rounded-full', tones.dot)} />
            {hint}
          </p>
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300', tones.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  )
}

interface DispatchStatCardsProps {
  availableCount: number
  activeCount: number
  pendingCount: number
  avgResponseTime: number
}

export function DispatchStatCards({
  availableCount,
  activeCount,
  pendingCount,
  avgResponseTime,
}: DispatchStatCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Available Ambulances"
        value={availableCount}
        icon={CheckCircle2}
        tone="success"
        hint="Ready to dispatch"
        delay={0.05}
      />
      <StatCard
        label="Active Trips"
        value={activeCount}
        icon={Navigation}
        tone="info"
        hint="In transit / on mission"
        delay={0.1}
      />
      <StatCard
        label="Pending Emergencies"
        value={pendingCount}
        icon={AlertTriangle}
        tone="emergency"
        hint="Awaiting allocation"
        delay={0.15}
      />
      <StatCard
        label="Avg Response Time"
        value={`${avgResponseTime.toFixed(1)}m`}
        icon={Clock}
        tone="warning"
        hint="Target under 10 mins"
        delay={0.2}
      />
    </div>
  )
}
