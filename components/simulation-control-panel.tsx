'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  TrafficCone,
  Wifi,
  WifiOff,
  Construction,
  Ambulance,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
} from 'lucide-react'
import type { TrafficLevel } from '@/lib/types'

export interface SimulationState {
  trafficLevel: TrafficLevel
  isOffline: boolean
  roadblockMode: boolean
  roadblocks: Array<{ lat: number; lng: number; id: string }>
  spawnedVehicles: Array<{ lat: number; lng: number; id: string; ambulanceId: string }>
}

interface SimulationControlPanelProps {
  simulationState: SimulationState
  onTrafficChange: (level: TrafficLevel) => void
  onNetworkToggle: (offline: boolean) => void
  onRoadblockModeToggle: (enabled: boolean) => void
  onSpawnVehicle: () => void
  onClearRoadblocks: () => void
  onClearVehicles: () => void
}

export function SimulationControlPanel({
  simulationState,
  onTrafficChange,
  onNetworkToggle,
  onRoadblockModeToggle,
  onSpawnVehicle,
  onClearRoadblocks,
  onClearVehicles,
}: SimulationControlPanelProps) {
  return (
    <Card className="glass-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Signal className="h-4 w-4 text-primary" />
          Simulation Control Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Traffic Simulator */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TrafficCone className="h-4 w-4 text-yellow-500" />
            Traffic Simulator
          </Label>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={simulationState.trafficLevel === 'low' ? 'default' : 'outline'}
              onClick={() => onTrafficChange('low')}
              className="flex-1"
            >
              <SignalLow className="mr-1 h-3 w-3" />
              Low
            </Button>
            <Button
              size="sm"
              variant={simulationState.trafficLevel === 'medium' ? 'default' : 'outline'}
              onClick={() => onTrafficChange('medium')}
              className="flex-1"
            >
              <SignalMedium className="mr-1 h-3 w-3" />
              Medium
            </Button>
            <Button
              size="sm"
              variant={simulationState.trafficLevel === 'high' ? 'default' : 'outline'}
              onClick={() => onTrafficChange('high')}
              className="flex-1"
            >
              <SignalHigh className="mr-1 h-3 w-3" />
              High
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {simulationState.trafficLevel === 'low' && 'Routes clear, minimal delays'}
            {simulationState.trafficLevel === 'medium' && 'Moderate congestion, +5 min ETA'}
            {simulationState.trafficLevel === 'high' && 'Heavy traffic, +15 min ETA'}
          </p>
        </div>

        {/* Offline Simulator */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            {simulationState.isOffline ? (
              <WifiOff className="h-4 w-4 text-red-500" />
            ) : (
              <Wifi className="h-4 w-4 text-green-500" />
            )}
            Offline Simulator
          </Label>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/30 p-3">
            <Button
              size="sm"
              variant={simulationState.isOffline ? 'destructive' : 'outline'}
              onClick={() => onNetworkToggle(!simulationState.isOffline)}
            >
              {simulationState.isOffline ? (
                <Wifi className="mr-1 h-3 w-3" />
              ) : (
                <WifiOff className="mr-1 h-3 w-3" />
              )}
              {simulationState.isOffline ? 'Back Online' : 'Go Offline'}
            </Button>
            {simulationState.isOffline && (
              <span className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                Disconnected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {simulationState.isOffline
              ? 'Live updates paused, data frozen'
              : 'Real-time tracking active'}
          </p>
        </div>

        {/* Roadblock Simulator */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Construction className="h-4 w-4 text-orange-500" />
            Roadblock Simulator
          </Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={simulationState.roadblockMode ? 'default' : 'outline'}
              onClick={() => onRoadblockModeToggle(!simulationState.roadblockMode)}
              className="flex-1"
            >
              <Construction className="mr-1 h-3 w-3" />
              {simulationState.roadblockMode ? 'Click Map to Add' : 'Add Roadblock'}
            </Button>
            {simulationState.roadblocks.length > 0 && (
              <Button size="sm" variant="destructive" onClick={onClearRoadblocks}>
                Clear ({simulationState.roadblocks.length})
              </Button>
            )}
          </div>
          {simulationState.roadblockMode && (
            <p className="text-xs text-amber-400">
              Click anywhere on the map to place a roadblock
            </p>
          )}
        </div>

        {/* Emergency Vehicle Spawner */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Ambulance className="h-4 w-4 text-red-500" />
            Emergency Vehicle Spawner
          </Label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onSpawnVehicle} className="flex-1">
              <Ambulance className="mr-1 h-3 w-3" />
              Spawn Emergency Vehicle
            </Button>
            {simulationState.spawnedVehicles.length > 0 && (
              <Button size="sm" variant="destructive" onClick={onClearVehicles}>
                Clear ({simulationState.spawnedVehicles.length})
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {simulationState.spawnedVehicles.length} simulated vehicle(s) on map
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
