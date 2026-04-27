"use client"

import * as React from "react"

const ACTIVE_FAMILY_KEY = "fdb-active-family-id"
const ACTIVE_PROFILE_KEY = "fdb-active-profile-id"

export type Profile = {
  id: string
  name: string
  birth_year: number
  family_id?: string
}

export type Family = {
  id: string
  name: string
  user_count: number
  created_at: string
}

type ActiveProfileContextValue = {
  activeProfileId: string | null
  setActiveProfileId: (id: string | null) => void
  activeFamilyId: string | null
  setActiveFamilyId: (id: string | null) => void
  families: Family[]
  profiles: Profile[]
}

const ActiveProfileContext = React.createContext<ActiveProfileContextValue | null>(null)

export function ActiveProfileProvider({
  children,
  families,
  profiles: allProfiles,
  initialFamilyId,
}: {
  children: React.ReactNode
  families: Family[]
  profiles: Profile[]
  initialFamilyId?: string | null
}) {
  const [activeFamilyId, setActiveFamilyIdState] = React.useState<string | null>(() => {
    if (initialFamilyId) return initialFamilyId
    if (typeof globalThis.window !== "undefined") {
      try {
        const stored = localStorage.getItem(ACTIVE_FAMILY_KEY)
        if (stored) return stored
      } catch {
        // ignore
      }
    }
    return null
  })

  React.useEffect(() => {
    if (initialFamilyId && typeof globalThis.window !== "undefined") {
      try {
        const stored = localStorage.getItem(ACTIVE_FAMILY_KEY)
        if (stored !== initialFamilyId) {
          localStorage.setItem(ACTIVE_FAMILY_KEY, initialFamilyId)
        }
      } catch {
        // ignore
      }
    }
  }, [initialFamilyId])
  const [activeProfileId, setActiveProfileIdState] = React.useState<string | null>(null)

  const setActiveProfileId = React.useCallback((id: string | null) => {
    setActiveProfileIdState(id)
    if (typeof globalThis.window !== "undefined") {
      try {
        if (id) {
          localStorage.setItem(ACTIVE_PROFILE_KEY, id)
          document.cookie = `fdb-active-profile-id=${id}; path=/; max-age=31536000; SameSite=Lax`
        } else {
          localStorage.removeItem(ACTIVE_PROFILE_KEY)
          document.cookie =
            "fdb-active-profile-id=; path=/; max-age=0; SameSite=Lax"
        }
      } catch {
        // ignore
      }
    }
  }, [])

  const setActiveFamilyId = React.useCallback((id: string | null) => {
    setActiveFamilyIdState(id)
    if (id) {
      try {
        localStorage.setItem(ACTIVE_FAMILY_KEY, id)
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem(ACTIVE_FAMILY_KEY)
      } catch {
        // ignore
      }
    }
  }, [])

  const effectiveFamilyId = activeFamilyId ?? families[0]?.id ?? null
  const profiles = React.useMemo(() => {
    if (!effectiveFamilyId) return []
    return allProfiles.filter((p) => (p.family_id ?? effectiveFamilyId) === effectiveFamilyId)
  }, [allProfiles, effectiveFamilyId])

  const profileLsHydratedRef = React.useRef(false)
  React.useEffect(() => {
    if (profileLsHydratedRef.current) return
    if (profiles.length === 0) return
    profileLsHydratedRef.current = true
    try {
      const stored = localStorage.getItem(ACTIVE_PROFILE_KEY)
      if (stored && profiles.some((p) => p.id === stored)) {
        setActiveProfileId(stored)
        document.cookie = `fdb-active-profile-id=${stored}; path=/; max-age=31536000; SameSite=Lax`
      }
    } catch {
      // ignore
    }
  }, [profiles, setActiveProfileId])

  React.useEffect(() => {
    if (families.length > 0 && !effectiveFamilyId) {
      const firstId = families[0].id
      setActiveFamilyIdState(firstId)
      try {
        localStorage.setItem(ACTIVE_FAMILY_KEY, firstId)
        document.cookie = `fdb-active-family-id=${firstId}; path=/; max-age=31536000; SameSite=Lax`
      } catch {
        // ignore
      }
    } else if (families.length > 0 && effectiveFamilyId && !families.some((f) => f.id === effectiveFamilyId)) {
      const firstId = families[0].id
      setActiveFamilyIdState(firstId)
      try {
        localStorage.setItem(ACTIVE_FAMILY_KEY, firstId)
        document.cookie = `fdb-active-family-id=${firstId}; path=/; max-age=31536000; SameSite=Lax`
      } catch {
        // ignore
      }
    }
  }, [families, effectiveFamilyId])

  React.useEffect(() => {
    const profileIds = new Set(profiles.map((p) => p.id))
    if (profiles.length > 0) {
      if (activeProfileId && !profileIds.has(activeProfileId)) {
        setActiveProfileId(null)
      }
    } else {
      setActiveProfileId(null)
    }
  }, [profiles, activeProfileId, setActiveProfileId])

  // Sync active profile/family across tabs via storage events
  React.useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === ACTIVE_FAMILY_KEY && e.newValue) {
        setActiveFamilyIdState(e.newValue)
      } else if (e.key === ACTIVE_PROFILE_KEY) {
        setActiveProfileIdState(e.newValue)
      }
    }
    globalThis.addEventListener("storage", handleStorage)
    return () => globalThis.removeEventListener("storage", handleStorage)
  }, [])

  const value = React.useMemo<ActiveProfileContextValue>(
    () => ({
      activeProfileId,
      setActiveProfileId,
      activeFamilyId: effectiveFamilyId,
      setActiveFamilyId,
      families,
      profiles,
    }),
    [activeProfileId, effectiveFamilyId, families, profiles, setActiveFamilyId, setActiveProfileId],
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

export function getStoredActiveFamilyId(): string | null {
  if (typeof globalThis.window === "undefined") return null
  try {
    return localStorage.getItem(ACTIVE_FAMILY_KEY)
  } catch {
    return null
  }
}

export function getStoredActiveProfileId(): string | null {
  if (typeof globalThis.window === "undefined") return null
  try {
    return localStorage.getItem(ACTIVE_PROFILE_KEY)
  } catch {
    return null
  }
}
