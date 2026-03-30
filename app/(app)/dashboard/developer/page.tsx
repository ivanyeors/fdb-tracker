"use client"

import dynamic from "next/dynamic"
import { SectionHeader } from "@/components/dashboard/section-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ReactFlowProvider } from "@xyflow/react"

const NodeCanvas = dynamic(
  () =>
    import("@/components/dashboard/developer/node-canvas").then(
      (m) => m.NodeCanvas
    ),
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
        description="Calculation logic dependency graph — drag nodes, click connections to see details, and export the graph."
      />
      <div
        className="overflow-hidden rounded-xl border bg-card"
        style={{ height: "calc(100vh - 12rem)" }}
      >
        <ReactFlowProvider>
          <NodeCanvas />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
