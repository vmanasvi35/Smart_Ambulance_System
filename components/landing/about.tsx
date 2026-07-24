'use client'

import { AlertTriangle, Link2, Timer } from 'lucide-react'
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/landing/scroll-reveal'

const ITEMS = [
  {
    title: 'Problem',
    description: 'Traffic congestion delays emergency vehicles.',
    icon: AlertTriangle,
    accent: 'border-emergency/40 bg-emergency/10 text-emergency',
  },
  {
    title: 'Solution',
    description:
      'Connect ambulance drivers, police officers, and hospitals through a real-time coordination platform.',
    icon: Link2,
    accent: 'border-info/40 bg-info/10 text-info',
  },
  {
    title: 'Result',
    description: 'Faster route clearance and reduced emergency response time.',
    icon: Timer,
    accent: 'border-success/40 bg-success/10 text-success',
  },
] as const

export function LandingAbout() {
  return (
    <section id="about" className="relative scroll-mt-20 border-y border-white/5 py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">About</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From delay to coordinated response
          </h2>
        </ScrollReveal>

        <StaggerContainer className="mt-12 grid gap-5 md:grid-cols-3" stagger={0.12}>
          {ITEMS.map((item, index) => (
            <StaggerItem key={item.title}>
              <div
                className="animate-float-card h-full"
                style={{ animationDelay: `${index * 0.35}s` }}
              >
                <div className="glass-card glass-card-hover group relative h-full overflow-hidden rounded-2xl p-6 sm:p-7">
                  <div className="mb-5 flex items-center justify-between">
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105 ${item.accent}`}
                    >
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground/60">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">{item.title}</h3>
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
