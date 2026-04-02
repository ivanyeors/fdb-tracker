"use client"

import useSWR, { type SWRConfiguration } from "swr"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) return null
    return r.json()
  })

/**
 * Thin wrapper around SWR for dashboard API calls.
 * Revalidation is triggered via `triggerRefresh()` which uses SWR's
 * global mutate with key matching — no version counter needed in the key.
 * Deduplicates identical requests within 30s and caches across page navigations.
 */
export function useApi<T = unknown>(
  path: string | null,
  options?: SWRConfiguration<T>,
) {
  return useSWR<T>(path, () => fetcher(path!) as Promise<T>, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    keepPreviousData: true,
    ...options,
  })
}
