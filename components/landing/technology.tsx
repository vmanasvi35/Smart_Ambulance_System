'use client'

import {
  Code2,
  Database,
  Layers,
  Map,
  Server,
} from 'lucide-react'
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/landing/scroll-reveal'

const STACK = [
  {
    category: 'Frontend',
    icon: Layers,
    accent: 'text-primary bg-primary/10 border-primary/30',
    items: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
  },
  {
    category: 'Backend',
    icon: Server,
    accent: 'text-success bg-success/10 border-success/30',
    items: ['Supabase', 'PostgreSQL'],
  },
  {
    category: 'Services',
    icon: Map,
    accent: 'text-info bg-info/10 border-info/30',
    items: ['Leaflet Maps', 'OpenStreetMap', 'OpenRouteService API'],
  },
] as const

export function LandingTechnology() {
  return (
    <section id="technology" className="relative scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Technology
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built for real-time coordination
          </h2>
          <p className="mt-3 text-muted-foreground">
            Modern web stack with live maps and reliable data services.
          </p>
        </ScrollReveal>

        <StaggerContainer className="mt-12 grid gap-5 md:grid-cols-3" stagger={0.1}>
          {STACK.map((group) => (
            <StaggerItem key={group.category}>
              <div className="glass-card h-full rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30">
                <div className="mb-5 flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border ${group.accent}`}
                  >
                    <group.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">{group.category}</h3>
                    <p className="text-xs text-muted-foreground">Core stack</p>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5 text-sm text-foreground/90"
                    >
                      <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <ScrollReveal delay={0.15} className="mt-8">
          <div className="glass-card flex flex-wrap items-center justify-center gap-3 rounded-xl px-4 py-4 text-sm text-muted-foreground">
            <Database className="h-4 w-4 text-primary" />
            <span>Realtime sync via Supabase</span>
            <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
            <span>Interactive routing on Leaflet</span>
            <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
            <span>Role-based access control</span>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
