'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Route,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { needsPoliceIntervention, respondToRouteAlert } from '@/lib/police-actions'
import type { AmbulanceTrip } from '@/lib/types'

export function PoliceQuickActions({
  trip,
  onDone,
}: {
  trip: AmbulanceTrip
  onDone?: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const supabase = createClient()
  const needsHelp = needsPoliceIntervention(trip)

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try {
      await action()
      onDone?.()
    } finally {
      setBusy(null)
    }
  }

  if (!needsHelp) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-success/30 bg-success/10 p-4"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
          <div>
            <p className="text-sm font-semibold text-foreground">Route is clear</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No police intervention required.
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emergency">
        Quick Actions
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionButton
          label="Clear Route"
          icon={CheckCircle2}
          loading={busy === 'clear'}
          className="border-success/30 bg-success/10 hover:bg-success/20"
          onClick={() =>
            run('clear', () =>
              respondToRouteAlert(supabase, trip, 'CLEAR_ROUTE', 'clear', 'CLEARED', 'Clear Route'),
            )
          }
        />
        <ActionButton
          label="Notify Driver"
          icon={MessageSquare}
          loading={busy === 'notify'}
          className="border-info/30 bg-info/10 hover:bg-info/20"
          onClick={() =>
            run('notify', () =>
              respondToRouteAlert(
                supabase,
                trip,
                'CLEAR_ROUTE',
                trip.route_condition,
                'WAITING_FOR_POLICE_RESPONSE',
                'Notify Driver',
              ),
            )
          }
        />
        <ActionButton
          label="Suggest Alternate Route"
          icon={Route}
          loading={busy === 'reroute'}
          className="border-warning/30 bg-warning/10 hover:bg-warning/20"
          onClick={() =>
            run('reroute', () =>
              respondToRouteAlert(
                supabase,
                trip,
                'REROUTE_REQUIRED',
                'heavy_congestion',
                'REROUTING',
                'Reroute Required',
              ),
            )
          }
        />
        <ActionButton
          label="Mark Resolved"
          icon={CheckCircle2}
          loading={busy === 'resolved'}
          className="border-primary/30 bg-primary/10 hover:bg-primary/20"
          onClick={() =>
            run('resolved', () =>
              respondToRouteAlert(
                supabase,
                trip,
                'CLEAR_ROUTE',
                'clear',
                'CLEARED',
                'Mark Resolved',
              ),
            )
          }
        />
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <AlertTriangle className="h-3 w-3 text-warning" />
        Actions update the live trip and notify the driver dashboard.
      </p>
    </div>
  )
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  loading,
  className,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  loading?: boolean
  className?: string
}) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
      <Button
        type="button"
        variant="outline"
        className={`h-auto w-full justify-start gap-2 px-3 py-3 text-foreground ${className ?? ''}`}
        onClick={onClick}
        disabled={!!loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        <span className="text-left text-xs font-medium">{label}</span>
      </Button>
    </motion.div>
  )
}
