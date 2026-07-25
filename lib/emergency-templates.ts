import emergencyTemplatesJson from '@/src/data/emergencyTemplates.json'

export type TemplateCoordinates = {
  name: string
  lat: number
  lng: number
}

export type EmergencyTemplate = {
  patientName: string
  age: number
  emergencyType: string
  priority: string
  pickupLocation: TemplateCoordinates
  destinationHospital: TemplateCoordinates | null
}

export type TemplatePriority = 'critical' | 'high' | 'medium' | 'low'

const templates = emergencyTemplatesJson as EmergencyTemplate[]

export function getEmergencyTemplates(): EmergencyTemplate[] {
  return templates
}

export function pickRandomEmergencyTemplate(): EmergencyTemplate {
  if (templates.length === 0) {
    throw new Error('No emergency templates configured')
  }
  const index = Math.floor(Math.random() * templates.length)
  return templates[index]
}

export function generateIncidentId(createdAt = new Date()) {
  const stamp = createdAt
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `INC-${stamp}-${suffix}`
}

export function normalizeTemplatePriority(priority: string): TemplatePriority {
  const lowered = priority.trim().toLowerCase()
  if (lowered === 'critical' || lowered === 'high' || lowered === 'medium' || lowered === 'low') {
    return lowered
  }
  return 'critical'
}
