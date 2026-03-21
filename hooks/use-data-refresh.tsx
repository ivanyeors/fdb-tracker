"use client"

import * as React from "react"

type DataRefreshContextValue = {
  /** Monotonically increasing counter — include in useEffect deps to refetch on mutation */
  dataVersion: number
  /** Call after any successful create/update/delete to notify all pages */
  triggerRefresh: () => void
}

const DataRefreshContext = React.createContext<DataRefreshContextValue | null>(
  null,
)

export function DataRefreshProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [dataVersion, setDataVersion] = React.useState(0)

  const triggerRefresh = React.useCallback(() => {
    setDataVersion((v) => v + 1)
  }, [])

  const value = React.useMemo(
    () => ({ dataVersion, triggerRefresh }),
    [dataVersion, triggerRefresh],
  )

  return (
    <DataRefreshContext.Provider value={value}>
      {children}
    </DataRefreshContext.Provider>
  )
}

export function useDataRefresh() {
  const ctx = React.useContext(DataRefreshContext)
  if (!ctx) {
    throw new Error(
      "useDataRefresh must be used within a DataRefreshProvider.",
    )
  }
  return ctx
}
