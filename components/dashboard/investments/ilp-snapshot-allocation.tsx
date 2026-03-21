"use client"

import { useMemo } from "react"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"

type SnapshotLike = {
  version?: number
  assetAllocation?: Array<{
    label: string
    weightPct: number | null
    categoryPct: number | null
  }>
}

function rowsFromSnapshot(raw: Record<string, unknown> | null | undefined): {
  name: string
  value: number
  percentage: number
}[] {
  if (!raw || typeof raw !== "object") return []
  const s = raw as SnapshotLike
  if (s.version !== 1 || !Array.isArray(s.assetAllocation)) return []
  const total = s.assetAllocation.reduce((sum, r) => {
    const w = r.weightPct
    return sum + (typeof w === "number" && Number.isFinite(w) ? Math.max(0, w) : 0)
  }, 0)
  if (total <= 0) return []
  return s.assetAllocation
    .map((r) => {
      const w =
        typeof r.weightPct === "number" && Number.isFinite(r.weightPct)
          ? Math.max(0, r.weightPct)
          : 0
      return {
        name: r.label,
        value: w,
        percentage: total > 0 ? (w / total) * 100 : 0,
      }
    })
    .filter((d) => d.value > 0)
}

export function IlpSnapshotAllocation({
  snapshot,
  title = "Reported asset allocation",
}: {
  snapshot: Record<string, unknown> | null | undefined
  title?: string
}) {
  const data = useMemo(() => rowsFromSnapshot(snapshot ?? null), [snapshot])
  if (data.length === 0) return null
  return (
    <div className="mt-4 border-t border-border pt-4">
      <AllocationChart data={data} title={title} height={220} legendMaxItems={6} />
    </div>
  )
}
