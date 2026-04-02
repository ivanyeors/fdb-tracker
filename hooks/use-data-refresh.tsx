"use client"

import * as React from "react"
import { useSWRConfig } from "swr"

type DataRefreshContextValue = {
  /** Call after any successful create/update/delete to revalidate SWR caches.
   *  Pass a scope string (e.g. "cashflow", "investments") to only revalidate
   *  matching API paths, or omit for a full revalidation. */
  triggerRefresh: (scope?: string) => void
}

const DataRefreshContext = React.createContext<DataRefreshContextValue | null>(
  null,
)

export function DataRefreshProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { mutate } = useSWRConfig()

  const triggerRefresh = React.useCallback(
    (scope?: string) => {
      if (scope) {
        // Revalidate only keys whose path contains the scope
        mutate(
          (key) => typeof key === "string" && key.includes(scope),
          undefined,
          { revalidate: true },
        )
      } else {
        // Global revalidation: revalidate all keys
        mutate(
          (key) => typeof key === "string" && key.startsWith("/api/"),
          undefined,
          { revalidate: true },
        )
      }
    },
    [mutate],
  )

  const value = React.useMemo(() => ({ triggerRefresh }), [triggerRefresh])

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
