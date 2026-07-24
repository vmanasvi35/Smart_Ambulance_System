import type { TripWorkflowStatus } from '@/lib/types'

export const TRIP_RECORD_STATUS = {
  pending: 'pending',
  inProgress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
} as const

export const TRIP_WORKFLOW_STATUS = {
  available: 'Available',
  assigned: 'Assigned',
  accepted: 'Accepted',
  goingToPickup: 'Going to Pickup',
  patientOnboard: 'Patient Onboard',
  enRouteHospital: 'En Route Hospital',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const

export type TripRecordStatus = (typeof TRIP_RECORD_STATUS)[keyof typeof TRIP_RECORD_STATUS]

export const TRIP_WORKFLOW_ORDER: TripWorkflowStatus[] = [
  TRIP_WORKFLOW_STATUS.available,
  TRIP_WORKFLOW_STATUS.assigned,
  TRIP_WORKFLOW_STATUS.accepted,
  TRIP_WORKFLOW_STATUS.goingToPickup,
  TRIP_WORKFLOW_STATUS.patientOnboard,
  TRIP_WORKFLOW_STATUS.enRouteHospital,
  TRIP_WORKFLOW_STATUS.completed,
]

export function normalizeTripWorkflowStatus(status?: string | null): TripWorkflowStatus {
  if (!status) return TRIP_WORKFLOW_STATUS.assigned

  const normalized = status.trim()
  const directMap: Record<string, TripWorkflowStatus> = {
    [TRIP_WORKFLOW_STATUS.available.toLowerCase()]: TRIP_WORKFLOW_STATUS.available,
    [TRIP_WORKFLOW_STATUS.assigned.toLowerCase()]: TRIP_WORKFLOW_STATUS.assigned,
    [TRIP_WORKFLOW_STATUS.accepted.toLowerCase()]: TRIP_WORKFLOW_STATUS.accepted,
    [TRIP_WORKFLOW_STATUS.goingToPickup.toLowerCase()]: TRIP_WORKFLOW_STATUS.goingToPickup,
    [TRIP_WORKFLOW_STATUS.patientOnboard.toLowerCase()]: TRIP_WORKFLOW_STATUS.patientOnboard,
    [TRIP_WORKFLOW_STATUS.enRouteHospital.toLowerCase()]: TRIP_WORKFLOW_STATUS.enRouteHospital,
    [TRIP_WORKFLOW_STATUS.completed.toLowerCase()]: TRIP_WORKFLOW_STATUS.completed,
    [TRIP_WORKFLOW_STATUS.cancelled.toLowerCase()]: TRIP_WORKFLOW_STATUS.cancelled,
  }

  const legacyMap: Record<string, TripWorkflowStatus> = {
    'waiting assignment': TRIP_WORKFLOW_STATUS.assigned,
    'waiting_assignment': TRIP_WORKFLOW_STATUS.assigned,
    'en route to pickup': TRIP_WORKFLOW_STATUS.goingToPickup,
    'patient picked up': TRIP_WORKFLOW_STATUS.patientOnboard,
    'en route to hospital': TRIP_WORKFLOW_STATUS.enRouteHospital,
    'completed status': TRIP_WORKFLOW_STATUS.completed,
    pending: TRIP_WORKFLOW_STATUS.assigned,
    in_progress: TRIP_WORKFLOW_STATUS.accepted,
    completed: TRIP_WORKFLOW_STATUS.completed,
    cancelled: TRIP_WORKFLOW_STATUS.cancelled,
  }

  const lowered = normalized.toLowerCase()
  return directMap[lowered] ?? legacyMap[lowered] ?? TRIP_WORKFLOW_STATUS.assigned
}

export function getTripWorkflowLabel(status?: string | null): string {
  return normalizeTripWorkflowStatus(status)
}

export function isWorkflowStatus(value?: string | null): value is TripWorkflowStatus {
  if (!value) return false
  return Object.values(TRIP_WORKFLOW_STATUS).includes(value as TripWorkflowStatus)
}

export function isTripRecordStatus(value?: string | null): value is TripRecordStatus {
  if (!value) return false
  return Object.values(TRIP_RECORD_STATUS).includes(value as TripRecordStatus)
}
