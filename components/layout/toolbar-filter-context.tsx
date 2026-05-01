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

type ToolbarFilterContextValue = {
  filter: ReactNode | null
  setFilter: (node: ReactNode | null) => void
}

const ToolbarFilterContext = createContext<ToolbarFilterContextValue | null>(
  null
)

export function ToolbarFilterProvider({
  children,
}: {
  readonly children: ReactNode
}) {
  const [filter, setFilter] = useState<ReactNode | null>(null)
  const value = useMemo(() => ({ filter, setFilter }), [filter])
  return (
    <ToolbarFilterContext.Provider value={value}>
      {children}
    </ToolbarFilterContext.Provider>
  )
}

export function useToolbarFilter(): ToolbarFilterContextValue {
  const ctx = useContext(ToolbarFilterContext)
  if (!ctx) {
    return { filter: null, setFilter: () => {} }
  }
  return ctx
}

/**
 * Register a filter node into the global toolbar's mobile slot for the
 * lifetime of the calling component. Pass `null` (or just unmount) to clear.
 */
export function useRegisterToolbarFilter(node: ReactNode | null): void {
  const { setFilter } = useToolbarFilter()
  const lastRef = useRef<ReactNode | null>(null)
  useEffect(() => {
    setFilter(node)
    lastRef.current = node
    return () => {
      setFilter(null)
    }
    // We intentionally re-run when the rendered node identity changes so the
    // toolbar reflects updates (e.g. selected year).
  }, [node, setFilter])
  // Sync the ref so callers can read what was last registered if needed.
  useEffect(() => {
    lastRef.current = node
  }, [node])
}

/**
 * Convenience hook: returns a stable `register` callback that components
 * can call from event handlers without re-registering on each render.
 */
export function useToolbarFilterSetter(): (node: ReactNode | null) => void {
  const { setFilter } = useToolbarFilter()
  return useCallback((node: ReactNode | null) => setFilter(node), [setFilter])
}
