'use client'

import { Clock, Hospital, Shield, Zap } from 'lucide-react'
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/landing/scroll-reveal'

const IMPACT = [
  {
    title: 'Faster ambulance movement',
    description: 'Priority corridors and live routing reduce travel friction.',
    icon: Zap,
  },
  {
    title: 'Better police coordination',
    description: 'Shared route visibility enables timely traffic clearance.',
    icon: Shield,
  },
  {
    title: 'Hospital preparedness',
    description: 'ETA alerts help teams ready resources before arrival.',
    icon: Hospital,
  },
  {
    title: 'Reduced response delays',
    description: 'Synchronized status updates cut handoff and waiting time.',
    icon: Clock,
  },
] as const

export function LandingImpact() {
  return (
    <section id="impact" className="relative scroll-mt-20 border-y border-white/5 py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emergency/[0.04] via-transparent to-primary/[0.04]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Impact
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Every minute matters during emergencies.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Coordinated response across ambulance, police, and hospital teams
            shortens the critical window between call and care.
          </p>
        </ScrollReveal>

        <StaggerContainer className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.08}>
          {IMPACT.map((item, index) => (
            <StaggerItem key={item.title}>
              <div
                className="animate-float-card h-full"
                style={{ animationDelay: `${index * 0.32}s` }}
              >
                <div className="glass-card glass-card-hover h-full rounded-2xl p-6">
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mb-2 text-base font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}
