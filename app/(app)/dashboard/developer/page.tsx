"use client"

import dynamic from "next/dynamic"
import { SectionHeader } from "@/components/dashboard/section-header"
import { Skeleton } from "@/components/ui/skeleton"

const CalculationNetworkGraph = dynamic(
  () =>
    import(
      "@/components/dashboard/developer/calculation-network-graph"
    ).then((m) => m.CalculationNetworkGraph),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-xl" />,
  }
)

export default function DeveloperPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SectionHeader
        title="Developer"
        description="Calculation logic dependency graph — click a connection to see the calculation details."
      />
      <div
        className="rounded-xl border bg-card"
        style={{ height: "calc(100vh - 12rem)" }}
      >
        <CalculationNetworkGraph />
      </div>
    </div>
  )
}
