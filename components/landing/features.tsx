'use client'

import {
  Ambulance,
  Hospital,
  MapPinned,
  Navigation,
  Radio,
  Route,
  Shield,
} from 'lucide-react'
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/landing/scroll-reveal'

const FEATURES = [
  {
    title: 'Ambulance Driver Dashboard',
    icon: Ambulance,
    color: 'text-emergency bg-emergency/10 border-emergency/30',
    items: [
      'Live route monitoring',
      'Trip management',
      'GPS tracking simulation',
      'ETA updates',
    ],
  },
  {
    title: 'Police Control Dashboard',
    icon: Shield,
    color: 'text-info bg-info/10 border-info/30',
    items: [
      'Monitor active ambulances',
      'Receive emergency alerts',
      'Manage road clearance',
      'Coordinate traffic',
    ],
  },
  {
    title: 'Hospital Dashboard',
    icon: Hospital,
    color: 'text-success bg-success/10 border-success/30',
    items: [
      'Receive incoming ambulance alerts',
      'View ETA',
      'Prepare emergency response',
    ],
  },
  {
    title: 'Live GPS Tracking',
    icon: Navigation,
    color: 'text-primary bg-primary/10 border-primary/30',
    items: [
      'Real-time ambulance location',
      'Interactive map view',
      'Continuous position updates',
      'Shared tracking for responders',
    ],
  },
  {
    title: 'Dynamic Routing',
    icon: Route,
    color: 'text-warning bg-warning/10 border-warning/30',
    items: [
      'Route optimization',
      'Traffic awareness',
      'Alternate route suggestions',
    ],
  },
  {
    title: 'Real-Time Communication',
    icon: Radio,
    color: 'text-info bg-info/10 border-info/30',
    items: [
      'Live updates',
      'Status synchronization',
      'Emergency coordination',
    ],
  },
] as const

export function LandingFeatures() {
  return (
    <section id="features" className="relative scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Coordinated tools for every role
          </h2>
          <p className="mt-3 text-muted-foreground">
            Role-based dashboards and shared live data keep emergency response aligned.
          </p>
        </ScrollReveal>

        <StaggerContainer className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3" stagger={0.08}>
          {FEATURES.map((feature, index) => (
            <StaggerItem key={feature.title}>
              <div
                className="animate-float-card h-full"
                style={{ animationDelay: `${index * 0.3}s` }}
              >
                <article className="glass-card glass-card-hover group h-full rounded-2xl p-6 sm:p-7">
                  <div
                    className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-105 ${feature.color}`}
                  >
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-3 text-lg font-semibold text-foreground">{feature.title}</h3>
                  <ul className="space-y-2">
                    {feature.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}
