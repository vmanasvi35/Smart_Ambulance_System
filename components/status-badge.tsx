import { cn } from '@/lib/utils'
import type { TripStatus, RouteCondition, AlertStatus, RouteState } from '@/lib/types'
import { TRIP_WORKFLOW_STATUS, normalizeTripWorkflowStatus } from '@/lib/trip-status'

interface StatusBadgeProps {
  status: TripStatus | RouteCondition | AlertStatus | RouteState | string
  className?: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  // Trip statuses
  pending: { label: TRIP_WORKFLOW_STATUS.assigned, className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  in_progress: { label: TRIP_WORKFLOW_STATUS.patientOnboard, className: 'bg-amber-500/20 text-amber-400 border-amber-500/30 status-emergency' },
  completed: { label: TRIP_WORKFLOW_STATUS.completed, className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  cancelled: { label: TRIP_WORKFLOW_STATUS.cancelled, className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  
  // Standardized lifecycle statuses
  [TRIP_WORKFLOW_STATUS.available]: { label: TRIP_WORKFLOW_STATUS.available, className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  [TRIP_WORKFLOW_STATUS.assigned]: { label: TRIP_WORKFLOW_STATUS.assigned, className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  [TRIP_WORKFLOW_STATUS.accepted]: { label: TRIP_WORKFLOW_STATUS.accepted, className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  [TRIP_WORKFLOW_STATUS.goingToPickup]: { label: TRIP_WORKFLOW_STATUS.goingToPickup, className: 'bg-purple-500/20 text-purple-400 border-purple-500/30 status-emergency' },
  [TRIP_WORKFLOW_STATUS.patientOnboard]: { label: TRIP_WORKFLOW_STATUS.patientOnboard, className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  [TRIP_WORKFLOW_STATUS.enRouteHospital]: { label: TRIP_WORKFLOW_STATUS.enRouteHospital, className: 'bg-orange-500/20 text-orange-400 border-orange-500/30 status-emergency' },
  [TRIP_WORKFLOW_STATUS.completed]: { label: TRIP_WORKFLOW_STATUS.completed, className: 'bg-green-500/20 text-green-400 border-green-500/30 font-bold' },
  
  // Route conditions
  unknown: { label: 'Unknown', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  clear: { label: 'Clear', className: 'bg-green-500/20 text-green-400 border-green-500/30 status-active' },
  moderate_traffic: { label: 'Moderate Traffic', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  heavy_congestion: { label: 'Heavy Congestion', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  road_blocked: { label: 'Road Blocked', className: 'bg-red-500/20 text-red-400 border-red-500/30 status-emergency' },
  
  // Alert statuses
  acknowledged: {
    label: 'Waiting for Clearance',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  resolved: { label: 'Resolved', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  alert_pending: {
    label: 'Pending',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },

  // Route decision states
  NORMAL: { label: 'Normal', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  CONGESTION_DETECTED: { label: 'Congestion Detected', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  ROADBLOCK_DETECTED: { label: 'Roadblock Detected', className: 'bg-red-500/20 text-red-400 border-red-500/30 status-emergency' },
  WAITING_FOR_POLICE_RESPONSE: { label: 'Waiting for Police', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  REROUTING: { label: 'Rerouting', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  CLEARED: { label: 'Cleared', className: 'bg-green-500/20 text-green-400 border-green-500/30 status-active' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const stringStatus = String(status)
  let config = statusConfig[stringStatus]
  if (!config) {
    const normalizedStatus = normalizeTripWorkflowStatus(stringStatus)
    config = statusConfig[normalizedStatus]
  }
  const finalConfig = config ?? { label: stringStatus, className: 'bg-gray-500/20 text-gray-400' }
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        finalConfig.className,
        className
      )}
    >
      {finalConfig.label}
    </span>
  )
}
