'use client'

import Link from 'next/link'
import { Ambulance, Github, LogIn, Mail } from 'lucide-react'
import { ScrollReveal } from '@/components/landing/scroll-reveal'

const FOOTER_LINKS = [
  {
    href: 'https://github.com',
    label: 'GitHub Repository',
    icon: Github,
    external: true,
  },
  {
    href: 'mailto:contact@example.com',
    label: 'Contact Email',
    icon: Mail,
    external: true,
  },
  {
    href: '/auth/login',
    label: 'Sign In to Platform',
    icon: LogIn,
    external: false,
  },
] as const

export function LandingFooter() {
  return (
    <footer id="contact" className="scroll-mt-20 border-t border-white/10 bg-[#050d18]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-14">
            <div>
              <div className="mb-4 flex items-center gap-2.5">
                <span className="glow-icon-emergency flex h-9 w-9 items-center justify-center rounded-lg bg-emergency/15 text-emergency ring-1 ring-emergency/40">
                  <Ambulance className="h-5 w-5" />
                </span>
                <span className="font-semibold text-foreground">Smart Ambulance</span>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Smart Ambulance Coordination System — an emergency response
                platform for real-time ambulance, police, and hospital coordination.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Team
              </h4>
              <ul className="space-y-2.5 text-sm text-foreground/85">
                <li>Project demonstration team</li>
                <li>Team name coming soon</li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Links
              </h4>
              <ul className="space-y-3">
                {FOOTER_LINKS.map((link) => {
                  const Icon = link.icon
                  const className =
                    'group inline-flex items-center gap-2.5 text-sm text-foreground/85 transition-colors duration-300 hover:text-primary'

                  if (link.external) {
                    return (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target={link.href.startsWith('http') ? '_blank' : undefined}
                          rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
                          className={className}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground transition-all duration-300 group-hover:border-primary/30 group-hover:text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          {link.label}
                        </a>
                      </li>
                    )
                  }

                  return (
                    <li key={link.label}>
                      <Link href={link.href} className={className}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground transition-all duration-300 group-hover:border-primary/30 group-hover:text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        {link.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </ScrollReveal>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Smart Ambulance Coordination System</p>
          <p>Emergency Response Platform · Project Demonstration</p>
        </div>
      </div>
    </footer>
  )
}
