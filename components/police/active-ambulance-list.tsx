'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Clock, Hospital, MapPin, User } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { PoliceEmptyState } from '@/components/police/empty-state'
import { needsPoliceIntervention, priorityForTrip } from '@/lib/police-actions'
import type { AmbulanceTrip } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ActiveAmbulanceList({ trips }: { trips: AmbulanceTrip[] }) {
  return (
    <div className="glass-card rounded-2xl border border-white/10 p-5 shadow-xl bg-[#07111f]/45">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">Active Ambulances</h2>
          <p className="text-xs text-muted-foreground">Emergency units currently en route</p>
        </div>
        <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-semibold text-muted-foreground shadow-sm">
          {trips.length} units travelling
        </span>
      </div>

      {trips.length === 0 ? (
        <PoliceEmptyState
          title="Currently no active ambulance trips."
          description="New en-route emergencies will appear here automatically."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((trip, index) => {
            const priority = priorityForTrip(trip)
            const needsHelp = needsPoliceIntervention(trip)
            return (
              <motion.div
                key={trip.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -3 }}
              >
                <div
                  className={cn(
                    'block h-full rounded-xl border border-white/10 bg-[#0c192c]/40 p-5 transition-all duration-300 relative overflow-hidden',
                    needsHelp
                      ? 'border-red-500/25 bg-red-950/5 hover:border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.05)]'
                      : 'hover:border-blue-500/25 hover:bg-white/[0.04] hover:shadow-[0_0_20px_rgba(59,130,246,0.05)]',
                  )}
                >
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-foreground tracking-tight">{trip.ambulance_id}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5 text-blue-400" />
                        Driver: <span className="font-semibold text-foreground/80">{trip.driver?.full_name ?? 'Driver'}</span>
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider',
                        priority === 'Critical' && 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]',
                        priority === 'High' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                        priority === 'Normal' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                      )}
                    >
                      {priority}
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs text-muted-foreground border-t border-white/5 pt-3">
                    <p className="flex items-center gap-2 truncate">
                      <Hospital className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      Destination: <span className="font-medium text-foreground/80">{trip.destination}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blue-400" />
                        <span>ETA: <span className="font-semibold text-foreground/95">{trip.eta != null ? `${trip.eta}m` : '—'}</span></span>
                      </div>
                      <div className="flex justify-end">
                        <StatusBadge status={trip.status} />
                      </div>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground/80">
                      Status: <span className="text-foreground/80 font-medium">{formatRoad(trip)}</span>
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
                    <Link
                      href={`/police/ambulance/${trip.id}`}
                      className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 hover:translate-x-0.5 duration-200"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatRoad(trip: AmbulanceTrip) {
  const condition = trip.route_condition
  if (condition === 'road_blocked') return 'Blocked Corridor'
  if (condition === 'heavy_congestion') return 'Heavy Traffic Detected'
  if (condition === 'moderate_traffic') return 'Moderate Traffic'
  if (condition === 'clear') return 'Route Clear'
  return trip.source
}
