'use client'

import { Ambulance, Hospital, MapPin, Shield } from 'lucide-react'
import { motion } from 'framer-motion'

export function EmergencyDashboardVisual() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#07111f]/80 shadow-2xl shadow-black/40 backdrop-blur-xl">
      {/* Grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.06) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Scan line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px animate-scan bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emergency" />
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Live Command View
          </span>
        </div>
        <span className="rounded bg-emergency/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emergency">
          Active
        </span>
      </div>

      {/* Map stage */}
      <div className="relative z-10 h-[calc(100%-2.75rem)] p-4 sm:p-5">
        {/* Route path */}
        <svg
          className="absolute inset-4 sm:inset-5"
          viewBox="0 0 400 280"
          fill="none"
          aria-hidden
        >
          <path
            d="M40 220 C 80 180, 100 120, 160 110 S 240 140, 280 100 S 340 40, 370 55"
            stroke="rgba(56,189,248,0.25)"
            strokeWidth="3"
            strokeDasharray="6 8"
          />
          <motion.path
            d="M40 220 C 80 180, 100 120, 160 110 S 240 140, 280 100 S 340 40, 370 55"
            stroke="rgba(239,68,68,0.7)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="8 10"
            initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity, repeatType: 'loop', repeatDelay: 0.6 }}
          />
        </svg>

        {/* Start marker */}
        <motion.div
          className="absolute bottom-[18%] left-[8%] flex flex-col items-center"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/40">
            <MapPin className="h-4 w-4" />
          </span>
          <span className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">Pickup</span>
        </motion.div>

        {/* Moving ambulance */}
        <motion.div
          className="absolute z-20"
          initial={{ left: '8%', top: '72%' }}
          animate={{
            left: ['8%', '28%', '48%', '68%', '88%'],
            top: ['72%', '42%', '38%', '28%', '16%'],
          }}
          transition={{
            duration: 8,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 0.8,
          }}
        >
          <div className="relative">
            <span className="absolute inset-0 animate-pulse-emergency rounded-full" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emergency text-white glow-icon-emergency">
              <Ambulance className="h-5 w-5" />
            </span>
          </div>
        </motion.div>

        {/* Traffic signal */}
        <motion.div
          className="absolute left-[42%] top-[48%] flex flex-col items-center gap-1"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          <div className="flex flex-col gap-0.5 rounded-md border border-white/15 bg-[#0a1628]/90 p-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emergency animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-warning/40" />
            <span className="h-1.5 w-1.5 rounded-full bg-success/30" />
          </div>
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Clearance</span>
        </motion.div>

        {/* Police unit */}
        <motion.div
          className="absolute bottom-[32%] right-[28%] flex flex-col items-center"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        >
          <span className="glow-icon-info flex h-8 w-8 items-center justify-center rounded-full bg-info/20 text-info ring-1 ring-info/40">
            <Shield className="h-4 w-4" />
          </span>
          <span className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">Police</span>
        </motion.div>

        {/* Hospital destination */}
        <motion.div
          className="absolute right-[4%] top-[10%] flex flex-col items-center"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="glow-icon-success flex h-9 w-9 items-center justify-center rounded-full bg-success/20 text-success ring-1 ring-success/40">
            <Hospital className="h-4 w-4" />
          </span>
          <span className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">Hospital</span>
        </motion.div>

        {/* Status chips */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-2">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
            ETA <span className="font-semibold text-foreground">6m 12s</span>
          </span>
          <span className="rounded-md border border-emergency/30 bg-emergency/10 px-2 py-1 text-[10px] text-emergency">
            Route Priority
          </span>
          <span className="rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[10px] text-success">
            Corridor Clear
          </span>
        </div>
      </div>
    </div>
  )
}
