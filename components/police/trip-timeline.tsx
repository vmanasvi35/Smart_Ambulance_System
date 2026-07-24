'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Circle } from 'lucide-react'
import type { TimelineStep } from '@/lib/police-actions'
import { cn } from '@/lib/utils'

export function TripTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="glass-card rounded-2xl border border-white/10 p-5 shadow-xl bg-[#07111f]/45">
      <h2 className="mb-4 text-base font-bold text-foreground tracking-tight">Trip Progress</h2>
      <ol className="relative space-y-0 pl-1">
        <div className="absolute bottom-5 left-[21px] top-5 w-0.5 bg-white/10" />
        {steps.map((step, index) => (
          <motion.li
            key={step.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08 }}
            className="relative flex items-start gap-4 py-3"
          >
            <span
              className={cn(
                'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                step.completed
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : step.active
                    ? 'border-red-500/40 bg-red-500/10 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                    : 'border-white/10 bg-[#07111f] text-muted-foreground',
              )}
            >
              {step.completed ? (
                <CheckCircle2 className="h-4.5 w-4.5" />
              ) : (
                <Circle className="h-3 w-3 fill-current" />
              )}
            </span>
            <div className="pt-1">
              <p
                className={cn(
                  'text-sm font-bold tracking-tight',
                  step.completed || step.active ? 'text-foreground font-semibold' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </p>
              <p className="text-[11px] text-muted-foreground/75 mt-0.5">
                {step.completed ? 'Completed' : step.active ? 'Active Situation' : 'Pending route progress'}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
