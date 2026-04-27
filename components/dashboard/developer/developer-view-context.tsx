"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export type DeveloperViewMode = "calculation" | "money-flow"

type DeveloperViewContextValue = {
  viewMode: DeveloperViewMode
  setViewMode: (mode: DeveloperViewMode) => void
}

const DeveloperViewContext = createContext<DeveloperViewContextValue | null>(
  null
)

export function useDeveloperView(): DeveloperViewContextValue {
  const ctx = useContext(DeveloperViewContext)
  if (!ctx) {
    throw new Error(
      "useDeveloperView must be used within a DeveloperViewProvider."
    )
  }
  return ctx
}

export function DeveloperViewProvider({ children }: { readonly children: ReactNode }) {
  const [viewMode, setViewMode] = useState<DeveloperViewMode>("calculation")
  return (
    <DeveloperViewContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </DeveloperViewContext.Provider>
  )
}
