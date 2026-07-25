export const GPS_REFRESH_INTERVALS = [1000, 5000, 15000] as const

export type GpsRefreshInterval = (typeof GPS_REFRESH_INTERVALS)[number]

export const DEFAULT_GPS_REFRESH_INTERVAL: GpsRefreshInterval = 5000
export const GPS_REFRESH_INTERVAL_STORAGE_KEY = 'dispatch-gps-refresh-interval'

export function isGpsRefreshInterval(value: number): value is GpsRefreshInterval {
  return GPS_REFRESH_INTERVALS.includes(value as GpsRefreshInterval)
}

export function formatGpsRefreshInterval(value: GpsRefreshInterval) {
  return value === 1000 ? '1 second' : `${value / 1000} seconds`
}

export function getStoredGpsRefreshInterval() {
  if (typeof window === 'undefined') return DEFAULT_GPS_REFRESH_INTERVAL

  const stored = Number(window.localStorage.getItem(GPS_REFRESH_INTERVAL_STORAGE_KEY))
  return isGpsRefreshInterval(stored) ? stored : DEFAULT_GPS_REFRESH_INTERVAL
}
