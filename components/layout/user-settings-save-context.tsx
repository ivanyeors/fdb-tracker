"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export type UserSettingsSaveEntry = {
  isDirty: () => boolean
  save: () => Promise<void>
}

type UserSettingsSaveContextValue = {
  register: (id: string, entry: UserSettingsSaveEntry) => void
  unregister: (id: string) => void
  bumpDirty: () => void
  aggregateDirty: boolean
  saveAll: () => Promise<void>
  isSaving: boolean
}

const UserSettingsSaveContext = createContext<UserSettingsSaveContextValue | null>(null)

export function UserSettingsSaveProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const registry = useRef(new Map<string, UserSettingsSaveEntry>())
  const [generation, setGeneration] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  const bumpDirty = useCallback(() => {
    setGeneration((g) => g + 1)
  }, [])

  const register = useCallback((id: string, entry: UserSettingsSaveEntry) => {
    registry.current.set(id, entry)
    setGeneration((g) => g + 1)
  }, [])

  const unregister = useCallback((id: string) => {
    registry.current.delete(id)
    setGeneration((g) => g + 1)
  }, [])

  const aggregateDirty = useMemo(() => {
    void generation
    for (const e of registry.current.values()) {
      if (e.isDirty()) return true
    }
    return false
  }, [generation])

  const saveAll = useCallback(async () => {
    const sorted = [...registry.current.entries()].sort(([a], [b]) => a.localeCompare(b))
    const toRun = sorted.filter(([, e]) => e.isDirty())
    if (toRun.length === 0) return

    setIsSaving(true)
    try {
      for (const [, e] of toRun) {
        await e.save()
      }
      toast.success("Saved")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setIsSaving(false)
    }
  }, [router])

  const value = useMemo(
    () => ({
      register,
      unregister,
      bumpDirty,
      aggregateDirty,
      saveAll,
      isSaving,
    }),
    [register, unregister, bumpDirty, aggregateDirty, saveAll, isSaving]
  )

  return (
    <UserSettingsSaveContext.Provider value={value}>{children}</UserSettingsSaveContext.Provider>
  )
}

export function useUserSettingsSave() {
  const ctx = useContext(UserSettingsSaveContext)
  if (!ctx) {
    throw new Error("useUserSettingsSave must be used within UserSettingsSaveProvider")
  }
  return ctx
}

export function useOptionalUserSettingsSave() {
  return useContext(UserSettingsSaveContext)
}

export function useUserSettingsSaveRegistration(id: string, isDirty: boolean, save: () => Promise<void>) {
  const ctx = useOptionalUserSettingsSave()
  const register = ctx?.register
  const unregister = ctx?.unregister
  const bumpDirty = ctx?.bumpDirty

  const isDirtyRef = useRef(isDirty)
  const saveRef = useRef(save)

  useEffect(() => {
    isDirtyRef.current = isDirty
    saveRef.current = save
  }, [isDirty, save])

  useEffect(() => {
    if (!register || !unregister) return
    register(id, {
      isDirty: () => isDirtyRef.current,
      save: () => saveRef.current(),
    })
    return () => unregister(id)
  }, [id, register, unregister])

  useEffect(() => {
    bumpDirty?.()
  }, [isDirty, bumpDirty])
}
