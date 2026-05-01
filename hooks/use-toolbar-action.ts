"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"

/**
 * Read the `action` search param dispatched by the global toolbar's per-page
 * CTAs and call the matching handler. The param is consumed (cleared from the
 * URL via router.replace) after dispatch so it doesn't fire again on
 * back/refresh.
 *
 * Handlers are matched by exact value of `action`. Unknown actions are
 * ignored but still cleared, so a stale link doesn't leave the URL dirty.
 */
export function useToolbarAction(
  handlers: Readonly<Record<string, () => void>>
): void {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const action = searchParams.get("action")
    if (!action) return

    const handler = handlers[action]
    if (handler) handler()

    const next = new URLSearchParams(searchParams.toString())
    next.delete("action")
    const query = next.toString()
    router.replace(query ? `?${query}` : "?", { scroll: false })
    // We intentionally only react to changes in the params — handlers may
    // change identity each render and we don't want that to retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
}
