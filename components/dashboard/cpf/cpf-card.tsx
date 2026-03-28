"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowUp, ArrowDown } from "lucide-react"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { createCategoryColorScale } from "@/lib/chart-colors"
import { Card, CardContent, CardCTA } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, cn } from "@/lib/utils"


interface CpfBreakdown {
  oa: number
  sa: number
  ma: number
}

interface CpfCardProps {
  total: number
  breakdown: CpfBreakdown
  /** Dollar amount change vs last month (positive = increase, negative = decrease) */
  delta?: number
  loading?: boolean
}

interface DonutData {
  name: string
  value: number
  percentage: number
}

function CpfDonutChart({
  data,
  width,
  height,
}: {
  data: DonutData[]
  width: number
  height: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<DonutData>()
  const [hoveredArcIndex, setHoveredArcIndex] = useState<number | null>(null)

  const colorScale = useMemo(
    () => createCategoryColorScale(data.map((d) => d.name)),
    [data],
  )

  const chartSize = Math.min(width, height, 100)
  const centerX = chartSize / 2
  const centerY = chartSize / 2
  const radius = chartSize / 2 - 8
  const innerRadius = radius * 0.58

  if (width < 10 || data.length === 0) return null

  return (
    <div className="relative" style={{ width: chartSize, height: chartSize }}>
      <svg width={chartSize} height={chartSize}>
        <Group top={centerY} left={centerX}>
          <Pie
            data={data}
            pieValue={(d) => d.value}
            outerRadius={radius}
            innerRadius={innerRadius}
            padAngle={0.006}
          >
            {(pie) =>
              pie.arcs.map((arc) => {
                const fill = colorScale(arc.data.name)
                const dimmed =
                  hoveredArcIndex !== null && hoveredArcIndex !== arc.index
                return (
                  <g key={`arc-${arc.index}-${arc.data.name}`}>
                    <path
                      d={pie.path(arc) ?? ""}
                      fill={fill}
                      className="cursor-pointer transition-[opacity] duration-150"
                      style={{ opacity: dimmed ? 0.45 : 1 }}
                      onMouseMove={(e) => {
                        setHoveredArcIndex(arc.index)
                        showTooltip({
                          tooltipData: arc.data,
                          tooltipLeft: e.clientX,
                          tooltipTop: e.clientY,
                        })
                      }}
                      onMouseLeave={() => {
                        setHoveredArcIndex(null)
                        hideTooltip()
                      }}
                    />
                  </g>
                )
              })
            }
          </Pie>
        </Group>
      </svg>
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={`${tooltipData.name}-${tooltipLeft}-${tooltipTop}`}
            role="tooltip"
            className="pointer-events-none z-[9999] max-w-[min(280px,calc(100vw-24px))] rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-lg"
            style={{
              position: "fixed",
              left: tooltipLeft,
              top: tooltipTop,
              transform: "translate(12px, 12px)",
              fontSize: 12,
            }}
          >
            <div className="font-medium text-foreground">
              {tooltipData.name} · {tooltipData.percentage.toFixed(1)}%
            </div>
            <div className="mt-0.5 tabular-nums text-muted-foreground">
              ${formatCurrency(tooltipData.value)} of ${formatCurrency(total)}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export function CpfCard({ total, breakdown, delta = 0, loading = false }: CpfCardProps) {
  const donutData = useMemo<DonutData[]>(() => {
    if (total <= 0) return []
    const oa = breakdown.oa ?? 0
    const sa = breakdown.sa ?? 0
    const ma = breakdown.ma ?? 0
    return [
      { name: "OA", value: oa, percentage: (oa / total) * 100 },
      { name: "SA", value: sa, percentage: (sa / total) * 100 },
      { name: "MA", value: ma, percentage: (ma / total) * 100 },
    ].filter((d) => d.value > 0)
  }, [total, breakdown])

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-row items-stretch gap-4">
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col">
            <p className="text-sm text-muted-foreground">CPF Total</p>
            <p className="mt-1 truncate text-2xl font-bold tracking-tight">
              ${formatCurrency(total)}
            </p>
            {delta !== 0 && (
              <div className="mt-1 flex items-center gap-1 text-sm">
                {delta >= 0 ? (
                  <ArrowUp className="size-4 text-emerald-500" />
                ) : (
                  <ArrowDown className="size-4 text-red-500" />
                )}
                <span
                  className={cn(
                    "font-medium",
                    delta >= 0 ? "text-emerald-500" : "text-red-500",
                  )}
                >
                  {delta >= 0 ? "+" : ""}
                  ${formatCurrency(Math.abs(delta))}
                </span>
                <span className="text-muted-foreground">vs last month</span>
              </div>
            )}
          </div>
          <CardCTA href="/dashboard/cpf">View CPF</CardCTA>
        </div>
        {donutData.length > 0 && (
          <div className="flex h-[100px] w-[100px] shrink-0 items-center justify-center">
            <ParentSize>
              {({ width, height }) => (
                <CpfDonutChart
                  data={donutData}
                  width={width}
                  height={height ?? 100}
                />
              )}
            </ParentSize>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
