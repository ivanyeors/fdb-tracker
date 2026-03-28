"use client"

import useSWR, { type SWRConfiguration } from "swr"
import { useDataRefresh } from "@/hooks/use-data-refresh"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) return null
    return r.json()
  })

/**
 * Thin wrapper around SWR for dashboard API calls.
 * Automatically revalidates when `triggerRefresh()` is called (via dataVersion key).
 * Deduplicates identical requests within 30s and caches across page navigations.
 */
export function useApi<T = unknown>(
  path: string | null,
  options?: SWRConfiguration<T>
) {
  const { dataVersion } = useDataRefresh()

  // Include dataVersion in the key so SWR revalidates after mutations
  const key = path ? `${path}#v=${dataVersion}` : null

  return useSWR<T>(key, () => fetcher(path!) as Promise<T>, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    ...options,
  })
}
