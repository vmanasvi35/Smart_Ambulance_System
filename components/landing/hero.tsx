'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Ambulance, ArrowRight, Hospital, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmergencyDashboardVisual } from '@/components/landing/emergency-dashboard-visual'
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/landing/scroll-reveal'

const STATS = [
  {
    label: 'Active Ambulances',
    value: '24',
    icon: Ambulance,
    tone: 'text-emergency',
    glow: 'glow-icon-emergency',
  },
  {
    label: 'Connected Police Units',
    value: '12',
    icon: Shield,
    tone: 'text-info',
    glow: 'glow-icon-info',
  },
  {
    label: 'Hospitals Coordinated',
    value: '8',
    icon: Hospital,
    tone: 'text-success',
    glow: 'glow-icon-success',
  },
] as const

export function LandingHero() {
  const scrollToWorkflow = () => {
    document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      id="home"
      className="relative overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-20 lg:pt-32 lg:pb-24"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute -right-20 top-40 h-96 w-96 rounded-full bg-emergency/8 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-info/10 blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emergency" />
            Emergency Response Platform
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="max-w-xl text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]"
          >
            Smart Ambulance Coordination System
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Reducing emergency response time through real-time ambulance tracking,
            traffic coordination, and intelligent route management.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Button
              asChild
              size="lg"
              className="glow-cta bg-emergency text-white transition-all duration-300 hover:bg-emergency/90"
            >
              <Link href="/auth/login">
                Start Simulation
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="border-white/15 bg-transparent text-foreground hover:bg-white/5"
              onClick={scrollToWorkflow}
            >
              View Workflow
            </Button>
          </motion.div>

          <StaggerContainer className="mt-10 grid gap-4 sm:grid-cols-3" stagger={0.1}>
            {STATS.map((stat) => (
              <StaggerItem key={stat.label}>
                <div className="glass-card glass-card-hover group rounded-2xl p-4">
                  <span
                    className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ${stat.tone} ${stat.glow}`}
                  >
                    <stat.icon className="h-4 w-4" />
                  </span>
                  <p className="text-2xl font-bold tabular-nums text-foreground">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>

        <ScrollReveal delay={0.15}>
          <EmergencyDashboardVisual />
        </ScrollReveal>
      </div>
    </section>
  )
}
