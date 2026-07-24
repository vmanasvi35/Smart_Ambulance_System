'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { usePoliceShell } from '@/components/police/shell-context'
import {
  Shield,
  LayoutDashboard,
  Bell,
  Users,
  LogOut,
  Menu,
  X,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
} from 'lucide-react'
import type { Profile } from '@/lib/types'

interface PoliceSidebarProps {
  profile: Profile
}

const navItems = [
  { href: '/police/dashboard', label: 'Control Room', icon: LayoutDashboard },
  { href: '/police/alerts', label: 'Alerts', icon: Bell },
  { href: '/police/drivers', label: 'Active Drivers', icon: Users },
]

export function PoliceSidebar({ profile }: PoliceSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { collapsed, toggleCollapsed } = usePoliceShell()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const isActivePath = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  const isAmbulanceDetailPage = pathname.startsWith('/police/ambulance/')

  if (isAmbulanceDetailPage) {
    return null
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 border border-white/10 bg-[#0a1628]/90 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/55 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 76 : 256 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className={cn(
          'fixed left-0 top-0 z-40 flex h-full flex-col border-r border-white/10 bg-[#07111f]/95 backdrop-blur-xl transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-3">
          <div className="glow-icon-info flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info ring-1 ring-info/30">
            <Shield className="h-5 w-5" />
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="min-w-0"
              >
                <h2 className="truncate text-sm font-semibold text-foreground">EOC Control</h2>
                <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <Radio className="h-3 w-3 text-emergency" />
                  Police Operations
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden border-b border-white/10 p-2 lg:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="w-full justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="mr-2 h-4 w-4" />
                Collapse
              </>
            )}
          </Button>
        </div>

        <nav className="flex-1 space-y-1.5 p-3">
          {navItems.map((item) => {
            const active =
              item.href === '/police/dashboard'
                ? pathname === item.href || pathname.startsWith('/police/ambulance')
                : isActivePath(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={item.label}
                className={cn(
                  'group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300',
                  active
                    ? 'bg-white/8 text-foreground shadow-[0_0_18px_oklch(0.65_0.2_200_/_0.12)]'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                  collapsed && 'justify-center px-2',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="police-nav-indicator"
                    className="absolute inset-y-1 left-1 w-1 rounded-full bg-emergency shadow-[0_0_10px_oklch(0.55_0.22_25_/_0.6)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <item.icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110',
                    active ? 'text-emergency' : 'text-muted-foreground',
                  )}
                />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5',
              collapsed && 'justify-center',
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <User className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{profile.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            className={cn(
              'mt-2 w-full text-muted-foreground hover:bg-emergency/10 hover:text-emergency',
              collapsed ? 'justify-center px-0' : 'justify-start',
            )}
            onClick={handleLogout}
            title="Sign Out"
          >
            <LogOut className={cn('h-4 w-4', !collapsed && 'mr-2')} />
            {!collapsed && 'Sign Out'}
          </Button>
        </div>
      </motion.aside>
    </>
  )
}
