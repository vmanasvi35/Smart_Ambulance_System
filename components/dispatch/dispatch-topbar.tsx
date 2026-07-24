'use client'

import { useEffect, useState } from 'react'
import { Bell, Clock, ShieldAlert, User, Wifi, WifiOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface DispatchTopbarProps {
  pendingCount: number
}

export function DispatchTopbar({ pendingCount }: DispatchTopbarProps) {
  const [time, setTime] = useState<string>('')
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setTime(new Date().toLocaleTimeString())
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="border-b border-white/10 bg-[#07111f]/80 px-6 py-4 backdrop-blur-xl flex items-center justify-between z-35 relative">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground hidden sm:block">
          CAD Command Dashboard
          <span className="block text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Computer-Aided Dispatch & Fleet Routing
          </span>
        </h1>
      </div>

      <div className="flex items-center gap-4 ml-auto sm:ml-0">
        {/* Connection status */}
        <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          {isOnline ? (
            <>
              <Wifi className="h-4.5 w-4.5 text-green-500 animate-pulse" />
              <span className="text-green-400">TELEMETRY LINKED</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4.5 w-4.5 text-red-500" />
              <span className="text-red-400">OFFLINE</span>
            </>
          )}
        </div>

        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-mono text-muted-foreground">
          <Clock className="h-4 w-4 text-emerald-500" />
          <span>{time}</span>
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {pendingCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emergency text-[9px] font-extrabold text-white ring-2 ring-[#07111f]">
                  {pendingCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 border-white/10 bg-[#07111f] text-foreground">
            <DropdownMenuLabel className="font-bold">System Alerts</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            {pendingCount > 0 ? (
              <DropdownMenuItem className="text-xs focus:bg-white/5 py-2.5 flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5" />
                <div>
                  <div className="font-semibold text-red-400">Priority Emergencies Waiting</div>
                  <div className="text-muted-foreground text-[10px] mt-0.5">Please dispatch active ambulances immediately.</div>
                </div>
              </DropdownMenuItem>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No active system alerts.
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Operator profile */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10 text-muted-foreground">
            <User className="h-5 w-5" />
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-bold text-foreground">C. Reynolds</div>
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Shift Chief</div>
          </div>
        </div>
      </div>
    </header>
  )
}
