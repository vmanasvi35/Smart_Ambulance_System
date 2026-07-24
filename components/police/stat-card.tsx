'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function CountUp({
  value,
  duration = 0.9,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const from = 0
    const to = value

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / (duration * 1000))
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span className={cn('tabular-nums', className)}>{display}</span>
}

export function PoliceStatCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  delay = 0,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: 'emergency' | 'warning' | 'info' | 'success'
  hint: string
  delay?: number
}) {
  const tones = {
    emergency: {
      gradient: 'from-red-950/20 via-red-950/5 to-transparent',
      icon: 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
      dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
      border: 'hover:border-red-500/30',
    },
    warning: {
      gradient: 'from-amber-950/20 via-amber-950/5 to-transparent',
      icon: 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
      dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
      border: 'hover:border-amber-500/30',
    },
    info: {
      gradient: 'from-blue-950/20 via-blue-950/5 to-transparent',
      icon: 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
      dot: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]',
      border: 'hover:border-blue-500/30',
    },
    success: {
      gradient: 'from-emerald-950/20 via-emerald-950/5 to-transparent',
      icon: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
      dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
      border: 'hover:border-emerald-500/30',
    },
  }[tone]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      whileHover={{ y: -4, scale: 1.01 }}
      className={cn(
        'glass-card relative overflow-hidden rounded-2xl border border-white/10 p-5 shadow-lg shadow-black/20',
        'bg-gradient-to-br transition-all duration-300',
        tones.gradient,
        tones.border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="text-4xl font-extrabold text-foreground tracking-tight">
            <CountUp value={value} />
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground/80">
            <span className={cn('h-2 w-2 animate-pulse rounded-full', tones.dot)} />
            {hint}
          </p>
        </div>
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-300', tones.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  )
}
