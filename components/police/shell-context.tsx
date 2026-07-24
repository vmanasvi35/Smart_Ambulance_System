'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type PoliceShellContextValue = {
  collapsed: boolean
  toggleCollapsed: () => void
  setCollapsed: (value: boolean) => void
}

const PoliceShellContext = createContext<PoliceShellContextValue | null>(null)

export function PoliceShellProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), [])

  return (
    <PoliceShellContext.Provider value={{ collapsed, toggleCollapsed, setCollapsed }}>
      {children}
    </PoliceShellContext.Provider>
  )
}

export function usePoliceShell() {
  const ctx = useContext(PoliceShellContext)
  if (!ctx) {
    return {
      collapsed: false,
      toggleCollapsed: () => {},
      setCollapsed: () => {},
    }
  }
  return ctx
}
