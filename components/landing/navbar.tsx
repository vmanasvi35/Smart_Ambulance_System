'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Ambulance, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#features', label: 'Features' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#technology', label: 'Technology' },
  { href: '#impact', label: 'Impact' },
  { href: '#contact', label: 'Contact' },
] as const

const SECTION_IDS = NAV_LINKS.map((l) => l.href.slice(1))

/** Must match CSS scroll-padding-top / scroll-mt-20 (5rem) */
const HEADER_OFFSET = 80

export function LandingNavbar() {
  const [active, setActive] = useState('home')
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [marker, setMarker] = useState({ left: 0, ready: false })
  const navListRef = useRef<HTMLUListElement>(null)
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const lockedSectionRef = useRef<string | null>(null)
  const unlockTimerRef = useRef<number | null>(null)

  const getActiveSection = useCallback(() => {
    const probe = window.scrollY + HEADER_OFFSET + 1
    let current = SECTION_IDS[0]

    for (const id of SECTION_IDS) {
      const el = document.getElementById(id)
      if (!el) continue
      const top = el.getBoundingClientRect().top + window.scrollY
      if (probe >= top) current = id
    }

    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
    if (atBottom) current = SECTION_IDS[SECTION_IDS.length - 1]

    return current
  }, [])

  const updateActiveFromScroll = useCallback(() => {
    setScrolled(window.scrollY > 24)
    if (lockedSectionRef.current) return
    setActive(getActiveSection())
  }, [getActiveSection])

  const unlockScrollSpy = useCallback(() => {
    lockedSectionRef.current = null
    if (unlockTimerRef.current != null) {
      window.clearTimeout(unlockTimerRef.current)
      unlockTimerRef.current = null
    }
    setActive(getActiveSection())
  }, [getActiveSection])

  useEffect(() => {
    updateActiveFromScroll()
    window.addEventListener('scroll', updateActiveFromScroll, { passive: true })
    window.addEventListener('resize', updateActiveFromScroll)
    return () => {
      window.removeEventListener('scroll', updateActiveFromScroll)
      window.removeEventListener('resize', updateActiveFromScroll)
      if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
    }
  }, [updateActiveFromScroll])

  useLayoutEffect(() => {
    const list = navListRef.current
    const link = linkRefs.current[active]
    if (!list || !link) return

    const listRect = list.getBoundingClientRect()
    const linkRect = link.getBoundingClientRect()
    setMarker({
      left: linkRect.left - listRect.left + linkRect.width / 2 - 10,
      ready: true,
    })
  }, [active, open])

  useEffect(() => {
    const onResize = () => {
      const list = navListRef.current
      const link = linkRefs.current[active]
      if (!list || !link) return
      const listRect = list.getBoundingClientRect()
      const linkRect = link.getBoundingClientRect()
      setMarker({
        left: linkRect.left - listRect.left + linkRect.width / 2 - 10,
        ready: true,
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active])

  const handleNav = (href: string) => {
    setOpen(false)
    const id = href.slice(1)
    const el = document.getElementById(id)
    if (!el) return

    // Keep the clicked item highlighted while smooth-scroll is in progress.
    lockedSectionRef.current = id
    setActive(id)

    if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)

    const targetY = Math.max(
      0,
      el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET,
    )
    window.scrollTo({ top: targetY, behavior: 'smooth' })

    const onScrollEnd = () => unlockScrollSpy()
    window.addEventListener('scrollend', onScrollEnd, { once: true })
    // Fallback for browsers without scrollend
    unlockTimerRef.current = window.setTimeout(() => {
      window.removeEventListener('scrollend', onScrollEnd)
      unlockScrollSpy()
    }, 900)
  }

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-white/10 bg-[#0a1628]/90 shadow-lg shadow-black/20 backdrop-blur-xl'
          : 'bg-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault()
            handleNav('#home')
          }}
          className="group flex min-w-0 items-center gap-2.5"
        >
          <span className="glow-icon-emergency relative flex h-9 w-9 items-center justify-center rounded-lg bg-emergency/15 text-emergency ring-1 ring-emergency/40">
            <Ambulance className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-emergency" />
          </span>
          <span className="hidden text-sm font-semibold tracking-wide text-foreground sm:block">
            Smart Ambulance
            <span className="block text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
              Coordination System
            </span>
          </span>
        </a>

        <ul ref={navListRef} className="relative hidden items-center gap-0.5 pt-4 lg:flex">
          {marker.ready && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute top-0 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emergency text-white shadow-[0_0_12px_oklch(0.55_0.22_25_/_0.55)]"
              initial={false}
              animate={{ left: marker.left }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <Ambulance className="h-3 w-3" />
            </motion.span>
          )}

          {NAV_LINKS.map((link) => {
            const id = link.href.slice(1)
            const isActive = active === id
            return (
              <li key={link.href}>
                <a
                  ref={(node) => {
                    linkRefs.current[id] = node
                  }}
                  data-nav={id}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault()
                    handleNav(link.href)
                  }}
                  className={cn(
                    'relative rounded-md px-2.5 py-2 text-sm transition-all duration-300 xl:px-3',
                    isActive
                      ? 'glow-nav-active bg-white/8 text-foreground'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                  )}
                >
                  {link.label}
                </a>
              </li>
            )
          })}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="hidden text-muted-foreground hover:bg-white/5 hover:text-foreground sm:inline-flex"
          >
            <Link href="/dispatch">Dispatch Center</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="hidden text-muted-foreground hover:bg-white/5 hover:text-foreground sm:inline-flex"
          >
            <Link href="/auth/login">Login</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-white/15 bg-white/5 text-foreground hover:bg-white/10"
          >
            <Link href="/auth/signup">Sign Up</Link>
          </Button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-foreground transition-colors hover:bg-white/5 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-white/10 bg-[#0a1628]/98 backdrop-blur-xl lg:hidden">
          <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => {
              const isActive = active === link.href.slice(1)
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={(e) => {
                      e.preventDefault()
                      handleNav(link.href)
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'glow-nav-active bg-white/8 text-foreground'
                        : 'text-muted-foreground hover:bg-white/5',
                    )}
                  >
                    {isActive && <Ambulance className="h-3.5 w-3.5 text-emergency" />}
                    {link.label}
                  </a>
                </li>
              )
            })}
            <li className="mt-2 border-t border-white/10 pt-3 sm:hidden">
              <Link
                href="/auth/login"
                className="block rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Login
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  )
}
