"use client"

import { useEffect } from "react"
import useSWR, { type SWRConfiguration } from "swr"
import { usePageLoading } from "@/hooks/use-page-loading"

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
  const { register, markComplete } = usePageLoading()

  const result = useSWR<T>(path, () => fetcher(path!) as Promise<T>, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    keepPreviousData: true,
    ...options,
  })

  useEffect(() => {
    if (path) register(path)
  }, [path, register])

  useEffect(() => {
    if (path && !result.isValidating) {
      markComplete(path)
    }
  }, [path, result.isValidating, markComplete])

  return result
}
