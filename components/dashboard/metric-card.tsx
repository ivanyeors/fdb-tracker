import { ArrowUp, ArrowDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { SourceBadge } from "@/components/ui/source-badge"
import { TOOLTIPS } from "@/lib/tooltips"
import type { ImpactNodeId } from "@/lib/impact-graph"
import { cn, formatCurrency } from "@/lib/utils"

interface MetricCardProps {
  readonly label: string
  readonly value: string | number
  readonly prefix?: string
  readonly suffix?: string
  readonly subtitle?: string
  readonly trend?: number
  readonly trendLabel?: string
  readonly tooltipId?: keyof typeof TOOLTIPS
  /** Show an "Auto" or "Manual" source badge next to the label */
  readonly source?: "auto" | "manual"
  /** Impact graph node for tooltip lookup on the source badge */
  readonly sourceNodeId?: ImpactNodeId
  readonly className?: string
  readonly loading?: boolean
}

export function MetricCard({
  label,
  value,
  prefix,
  suffix,
  subtitle,
  trend,
  trendLabel,
  tooltipId,
  source,
  sourceNodeId,
  className,
  loading = false,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardContent>
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardContent>
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          {tooltipId && <InfoTooltip id={tooltipId} />}
          {source && <SourceBadge source={source} nodeId={sourceNodeId} />}
        </div>
        <p className="mt-1 truncate text-2xl font-bold tracking-tight">
          {prefix}
          {typeof value === "number"
            ? prefix === "$"
              ? formatCurrency(value)
              : value.toLocaleString()
            : value}
          {suffix}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend !== undefined && (
          <div className="mt-1 flex items-center gap-1 text-sm">
            {trend >= 0 ? (
              <ArrowUp className="size-4 text-emerald-500" />
            ) : (
              <ArrowDown className="size-4 text-red-500" />
            )}
            <span
              className={cn(
                "font-medium",
                trend >= 0 ? "text-emerald-500" : "text-red-500",
              )}
            >
              {Math.abs(trend)}%
            </span>
            {trendLabel && (
              <span className="text-muted-foreground">{trendLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
