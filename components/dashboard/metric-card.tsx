"use client"

import { ArrowUp, ArrowDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { TOOLTIPS } from "@/lib/tooltips"
import { cn, formatCurrency } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string | number
  prefix?: string
  suffix?: string
  trend?: number
  trendLabel?: string
  tooltipId?: keyof typeof TOOLTIPS
  className?: string
  loading?: boolean
}

export function MetricCard({
  label,
  value,
  prefix,
  suffix,
  trend,
  trendLabel,
  tooltipId,
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
          <p className="text-sm text-muted-foreground">{label}</p>
          {tooltipId && <InfoTooltip id={tooltipId} />}
        </div>
        <p className="mt-1 text-2xl font-bold tracking-tight">
          {prefix}
          {typeof value === "number"
            ? prefix === "$"
              ? formatCurrency(value)
              : value.toLocaleString()
            : value}
          {suffix}
        </p>
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
