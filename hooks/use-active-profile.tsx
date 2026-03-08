"use client"

import * as React from "react"

export type Profile = {
  id: string
  name: string
  birth_year: number
}

type ActiveProfileContextValue = {
  activeProfileId: string | null
  setActiveProfileId: (id: string | null) => void
  profiles: Profile[]
}

const ActiveProfileContext = React.createContext<ActiveProfileContextValue | null>(null)

export function ActiveProfileProvider({
  children,
  profiles,
}: {
  children: React.ReactNode
  profiles: Profile[]
}) {
  const [activeProfileId, setActiveProfileId] = React.useState<string | null>(null)

  const value = React.useMemo<ActiveProfileContextValue>(
    () => ({ activeProfileId, setActiveProfileId, profiles }),
    [activeProfileId, profiles],
  )

  return (
    <ActiveProfileContext.Provider value={value}>
      {children}
    </ActiveProfileContext.Provider>
  )
}

export function useActiveProfile() {
  const ctx = React.useContext(ActiveProfileContext)
  if (!ctx) {
    throw new Error("useActiveProfile must be used within an ActiveProfileProvider.")
  }
  return ctx
}
