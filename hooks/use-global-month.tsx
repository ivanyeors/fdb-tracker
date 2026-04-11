"use client"

import * as React from "react"
import { useActiveProfile } from "@/hooks/use-active-profile"

const STORAGE_KEY = "fdb-global-month"

export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

type GlobalMonthContextValue = {
  selectedMonth: string | null
  setSelectedMonth: (month: string | null) => void
  availableMonths: string[]
  setAvailableMonths: (months: string[]) => void
  effectiveMonth: string
}

const GlobalMonthContext = React.createContext<GlobalMonthContextValue | null>(null)

export function GlobalMonthProvider({ children }: { children: React.ReactNode }) {
  const { activeFamilyId } = useActiveProfile()

  const [selectedMonth, setSelectedMonthState] = React.useState<string | null>(null)
  const [mounted, setMounted] = React.useState(false)

  const [availableMonths, setAvailableMonths] = React.useState<string[]>([])

  const setSelectedMonth = React.useCallback((month: string | null) => {
    setSelectedMonthState(month)
    try {
      if (month) {
        localStorage.setItem(STORAGE_KEY, month)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  }, [])

  // Hydrate from localStorage after mount to avoid SSR mismatch
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setSelectedMonthState(stored)
    } catch {
      // ignore
    }
    setMounted(true)
  }, [])

  // Reset selected month when family changes
  const prevFamilyRef = React.useRef(activeFamilyId)
  React.useEffect(() => {
    if (prevFamilyRef.current !== null && activeFamilyId !== prevFamilyRef.current) {
      setSelectedMonth(null)
      setAvailableMonths([])
    }
    prevFamilyRef.current = activeFamilyId
  }, [activeFamilyId, setSelectedMonth])

  const effectiveMonth = mounted
    ? (selectedMonth ?? getCurrentMonth())
    : ""

  const value = React.useMemo<GlobalMonthContextValue>(
    () => ({
      selectedMonth,
      setSelectedMonth,
      availableMonths,
      setAvailableMonths,
      effectiveMonth,
    }),
    [selectedMonth, setSelectedMonth, availableMonths, effectiveMonth]
  )

  return (
    <GlobalMonthContext.Provider value={value}>
      {children}
    </GlobalMonthContext.Provider>
  )
}

export function useGlobalMonth() {
  const ctx = React.useContext(GlobalMonthContext)
  if (!ctx) {
    throw new Error("useGlobalMonth must be used within a GlobalMonthProvider.")
  }
  return ctx
}
