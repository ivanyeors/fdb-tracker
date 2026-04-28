import { Skeleton } from "@/components/ui/skeleton"
import { MetricCard } from "@/components/dashboard/metric-card"
import { ChartSkeleton } from "./chart-skeleton"

const PRIMARY_SKELETON_KEYS = [
  "p-alpha", "p-bravo", "p-charlie", "p-delta", "p-echo",
  "p-foxtrot", "p-golf", "p-hotel", "p-india", "p-juliet",
]
const SECONDARY_SKELETON_KEYS = [
  "s-alpha", "s-bravo", "s-charlie", "s-delta", "s-echo",
  "s-foxtrot", "s-golf", "s-hotel", "s-india", "s-juliet",
]
const ROW_SKELETON_KEYS = [
  "r-alpha", "r-bravo", "r-charlie", "r-delta", "r-echo", "r-foxtrot",
]

interface PageSkeletonProps {
  /** Number of metric cards in the first row (default: 3) */
  readonly metricCount?: number
  /** Number of metric cards in the second row (default: 0) */
  readonly metricCountSecondary?: number
  /** Show a chart skeleton (default: false) */
  readonly showChart?: boolean
  /** Chart skeleton height (default: 300) */
  readonly chartHeight?: number
  /** Show a table skeleton (default: false) */
  readonly showTable?: boolean
  /** Variant: dashboard (default) or settings */
  readonly variant?: "dashboard" | "settings"
}

export function PageSkeleton({
  metricCount = 3,
  metricCountSecondary = 0,
  showChart = false,
  chartHeight = 300,
  showTable = false,
  variant = "dashboard",
}: PageSkeletonProps) {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* SectionHeader placeholder */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Primary metrics grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PRIMARY_SKELETON_KEYS.slice(0, metricCount).map((key) => (
          <MetricCard key={key} label="" value={0} loading />
        ))}
      </div>

      {/* Secondary metrics grid (e.g. 4 cards) */}
      {metricCountSecondary > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECONDARY_SKELETON_KEYS.slice(0, metricCountSecondary).map((key) => (
            <MetricCard key={key} label="" value={0} loading />
          ))}
        </div>
      )}

      {/* Chart skeleton */}
      {showChart && <ChartSkeleton height={chartHeight} />}

      {/* Table skeleton (for OCBC, etc.) */}
      {showTable && (
        <div className="rounded-lg border p-4">
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="space-y-3">
            {ROW_SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-10 w-full" />
            ))}
          </div>
        </div>
      )}

      {/* Settings variant: simpler form-like layout */}
      {variant === "settings" && (
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  )
}
