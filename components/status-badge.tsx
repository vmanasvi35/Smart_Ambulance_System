import { cn } from '@/lib/utils'
import type { TripStatus, RouteCondition, AlertStatus } from '@/lib/types'

interface StatusBadgeProps {
  status: TripStatus | RouteCondition | AlertStatus
  className?: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  // Trip statuses
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  in_progress: { label: 'In Progress', className: 'bg-red-500/20 text-red-400 border-red-500/30 status-emergency' },
  completed: { label: 'Completed', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  
  // Route conditions
  unknown: { label: 'Unknown', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  clear: { label: 'Clear', className: 'bg-green-500/20 text-green-400 border-green-500/30 status-active' },
  moderate_traffic: { label: 'Moderate Traffic', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  heavy_congestion: { label: 'Heavy Congestion', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  road_blocked: { label: 'Road Blocked', className: 'bg-red-500/20 text-red-400 border-red-500/30 status-emergency' },
  
  // Alert statuses
  acknowledged: { label: 'Acknowledged', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  resolved: { label: 'Resolved', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-500/20 text-gray-400' }
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
