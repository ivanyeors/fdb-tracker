import { Skeleton } from "@/components/ui/skeleton"

interface ChartSkeletonProps {
  /** Height of the chart placeholder (default: 300) */
  readonly height?: number
  readonly className?: string
}

const BAR_HEIGHTS = [45, 62, 38, 55, 70, 48, 58, 42, 65, 52, 60, 35]

export function ChartSkeleton({ height = 300, className }: ChartSkeletonProps) {
  return (
    <div
      className={`flex w-full items-end justify-between gap-2 px-2 pb-2 ${className ?? ""}`}
      style={{ height }}
    >
      {/* Bar-like shapes to suggest a chart */}
      {BAR_HEIGHTS.map((pct, i) => (
        <Skeleton
          key={`bar-${i}-${pct}`}
          className="min-w-2 flex-1"
          style={{
            height: `${pct}%`,
            minHeight: 24,
          }}
        />
      ))}
    </div>
  )
}
