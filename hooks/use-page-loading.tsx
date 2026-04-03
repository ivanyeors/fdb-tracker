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
import { usePathname } from "next/navigation"

type PageLoadingContextValue = {
  register: (key: string) => void
  markComplete: (key: string) => void
  progress: number
  isLoading: boolean
}

const PageLoadingContext = createContext<PageLoadingContextValue>({
  register: () => {},
  markComplete: () => {},
  progress: 0,
  isLoading: false,
})

/** Initial progress shown during skeleton/suspense before useApi hooks mount */
const INITIAL_PROGRESS = 10
/** If no useApi calls register within this window, assume the page has none */
const NAVIGATING_TIMEOUT = 1000

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [entries, setEntries] = useState<Map<string, boolean>>(new Map())
  const [navigating, setNavigating] = useState(false)
  const pathnameRef = useRef(pathname)
  const navTimer = useRef<ReturnType<typeof setTimeout>>(null)

  // Reset on navigation — immediately show the bar
  useEffect(() => {
    if (pathname !== pathnameRef.current) {
      pathnameRef.current = pathname
      setEntries(new Map())
      setNavigating(true)

      // Auto-clear if no useApi calls register (e.g. settings pages)
      if (navTimer.current) clearTimeout(navTimer.current)
      navTimer.current = setTimeout(() => setNavigating(false), NAVIGATING_TIMEOUT)
    }
    return () => {
      if (navTimer.current) clearTimeout(navTimer.current)
    }
  }, [pathname])

  const register = useCallback((key: string) => {
    // useApi calls started mounting — clear the navigating timer
    if (navTimer.current) clearTimeout(navTimer.current)
    setNavigating(false)
    setEntries((prev) => {
      if (prev.has(key)) return prev
      const next = new Map(prev)
      next.set(key, false)
      return next
    })
  }, [])

  const markComplete = useCallback((key: string) => {
    setEntries((prev) => {
      if (prev.get(key) === true) return prev
      const next = new Map(prev)
      next.set(key, true)
      return next
    })
  }, [])

  const { progress, isLoading } = useMemo(() => {
    const total = entries.size

    // No useApi calls registered yet — still in skeleton/suspense phase
    if (total === 0) {
      return navigating
        ? { progress: INITIAL_PROGRESS, isLoading: true }
        : { progress: 0, isLoading: false }
    }

    let completed = 0
    for (const v of entries.values()) {
      if (v) completed++
    }
    return {
      progress: Math.round((completed / total) * 100),
      isLoading: completed < total,
    }
  }, [entries, navigating])

  const value = useMemo(
    () => ({ register, markComplete, progress, isLoading }),
    [register, markComplete, progress, isLoading]
  )

  return (
    <PageLoadingContext value={value}>
      {children}
    </PageLoadingContext>
  )
}

export function usePageLoading() {
  return useContext(PageLoadingContext)
}
