'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  AlertOctagon, 
  Activity,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ListChecks,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface DispatchSidebarProps {
  activeSection?: string
  onSectionChange?: (section: string) => void
  dispatcherName?: string
}

export function DispatchSidebar({ activeSection = 'control-room', onSectionChange, dispatcherName }: DispatchSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const navItems = [
    { id: 'control-room', label: 'Control Room', icon: Activity },
    { id: 'dispatch-queue', label: 'Dispatch Queue', icon: ListChecks },
    { id: 'incidents', label: 'Incident Log', icon: AlertOctagon },
  ]

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-xl border border-white/10 bg-[#0a1628]/90 p-2.5 text-foreground shadow-lg backdrop-blur-md lg:hidden hover:bg-white/10 transition-colors"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Panel */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 260 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-white/10 bg-[#07111f]/95 backdrop-blur-xl transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand / Title */}
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emergency/15 text-emergency ring-1 ring-emergency/30">
              <ShieldAlert className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </div>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="min-w-0"
              >
                <h2 className="text-sm font-bold tracking-wider text-foreground uppercase">
                  Ambulance
                </h2>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-red-500">
                  Dispatch Center
                </p>
              </motion.div>
            )}
          </div>

          {/* Collapse toggle (desktop only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 p-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (onSectionChange) onSectionChange(item.id)
                  setMobileOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold tracking-wide transition-all duration-200",
                  isActive
                    ? "bg-emergency/10 text-red-400 border border-emergency/25 shadow-[0_0_15px_rgba(239,68,68,0.08)]"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-red-400" : "text-muted-foreground")} />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="truncate"
                  >
                    {item.label}
                  </motion.span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Telemetry info box at bottom */}
        {!collapsed && (
          <div className="p-4 border-t border-white/10 bg-black/20 m-3 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Channel status</span>
              <span className="text-green-500 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Online
              </span>
            </div>
             <div className="text-[10px] text-muted-foreground/75 leading-relaxed">
              Operator Shift: <strong>B</strong><br />
              Supervisor: <strong>{dispatcherName || 'C. Reynolds'}</strong><br />
              Emergency Broadcast: <strong>Active</strong>
            </div>
          </div>
        )}
        {/* Sign Out Button at bottom */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold tracking-wide text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 border border-transparent cursor-pointer"
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Sign Out
              </motion.span>
            )}
          </button>
        </div>
      </motion.aside>
    </>
  )
}
