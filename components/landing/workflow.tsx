'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ambulance,
  Bell,
  CheckCircle2,
  Hospital,
  MapPin,
  Navigation,
  Shield,
  Siren,
} from 'lucide-react'
import { ScrollReveal } from '@/components/landing/scroll-reveal'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    title: 'Emergency Request',
    detail: 'An emergency call initiates coordination across connected units.',
    icon: Siren,
  },
  {
    title: 'Ambulance Trip Created',
    detail: 'A driver creates a trip with pickup, destination, and live tracking.',
    icon: Bell,
  },
  {
    title: 'Driver Starts Journey',
    detail: 'GPS simulation begins and the route becomes visible to responders.',
    icon: Ambulance,
  },
  {
    title: 'Police Receives Route Information',
    detail: 'Control room sees the active corridor and prepares clearance.',
    icon: Shield,
  },
  {
    title: 'Traffic / Roadblock Detected',
    detail: 'Congestion or barriers are flagged along the ambulance path.',
    icon: MapPin,
  },
  {
    title: 'Police Clears Route',
    detail: 'Officers manage traffic and open a priority corridor.',
    icon: Navigation,
  },
  {
    title: 'Hospital Receives ETA',
    detail: 'Receiving facility prepares teams based on live arrival estimates.',
    icon: Hospital,
  },
  {
    title: 'Ambulance Arrives',
    detail: 'Patient handover completes with synchronized status updates.',
    icon: CheckCircle2,
  },
] as const

export function LandingWorkflow() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = window.setInterval(() => {
      setActive((prev) => (prev + 1) % STEPS.length)
    }, 3200)
    return () => window.clearInterval(timer)
  }, [paused])

  return (
    <section
      id="workflow"
      className="relative scroll-mt-20 border-y border-white/5 bg-[#07111f]/50 py-20 sm:py-24"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emergency/5 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Emergency Workflow
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            End-to-end response timeline
          </h2>
          <p className="mt-3 text-muted-foreground">
            Follow how an emergency moves from request to hospital arrival.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <ScrollReveal>
            <ol
              className="relative space-y-0"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onFocusCapture={() => setPaused(true)}
              onBlurCapture={() => setPaused(false)}
            >
              <div className="absolute bottom-4 left-[19px] top-4 w-px bg-gradient-to-b from-emergency via-primary/50 to-success" />

              {STEPS.map((step, index) => {
                const Icon = step.icon
                const isActive = active === index

                return (
                  <li key={step.title}>
                    <button
                      type="button"
                      onClick={() => setActive(index)}
                      onMouseEnter={() => setActive(index)}
                      className={cn(
                        'group relative flex w-full items-start gap-4 rounded-xl px-2 py-3 text-left transition-colors duration-300',
                        isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]',
                      )}
                    >
                      <span
                        className={cn(
                          'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                          isActive
                            ? 'border-emergency bg-emergency text-white glow-icon-emergency'
                            : 'border-white/15 bg-[#0a1628] text-muted-foreground group-hover:border-primary/40 group-hover:text-primary',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {isActive && (
                          <span className="absolute inset-0 animate-pulse-emergency rounded-full" />
                        )}
                      </span>
                      <span className="min-w-0 pt-1.5">
                        <span
                          className={cn(
                            'block text-sm font-semibold transition-colors sm:text-base',
                            isActive ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {step.title}
                        </span>
                        <span className="mt-0.5 hidden text-xs text-muted-foreground/80 sm:block">
                          Step {index + 1} of {STEPS.length}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </ScrollReveal>

          <ScrollReveal delay={0.1} className="lg:sticky lg:top-24">
            <div className="animate-float-card">
              <div className="glass-card glow-workflow-active relative min-h-[280px] overflow-hidden rounded-2xl p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Active Stage
                  </span>
                  <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-xs text-foreground/80">
                    {String(active + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
                  </span>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                  >
                    {(() => {
                      const Icon = STEPS[active].icon
                      return (
                        <>
                          <div className="glow-icon-emergency mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emergency/30 bg-emergency/10 text-emergency">
                            <Icon className="h-7 w-7" />
                          </div>
                          <h3 className="text-2xl font-bold text-foreground">
                            {STEPS[active].title}
                          </h3>
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                            {STEPS[active].detail}
                          </p>
                        </>
                      )
                    })()}
                  </motion.div>
                </AnimatePresence>

                <div className="mt-8 flex gap-1.5">
                  {STEPS.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`Go to step ${index + 1}`}
                      onClick={() => setActive(index)}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors duration-300',
                        index <= active ? 'bg-emergency' : 'bg-white/10',
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
