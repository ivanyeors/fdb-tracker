"use client"

import { useMemo } from "react"
import { ArrowUp, ArrowDown } from "lucide-react"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleOrdinal } from "@visx/scale"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { Card, CardContent, CardCTA } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, cn } from "@/lib/utils"

// CPF account colors: OA (blue), SA (green), MA (orange)
const CPF_COLORS: Record<string, string> = {
  OA: "oklch(0.55 0.15 250)",
  SA: "oklch(0.55 0.15 145)",
  MA: "oklch(0.65 0.15 45)",
}

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
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<DonutData>()

  const colorScale = useMemo(
    () =>
      scaleOrdinal<string, string>({
        domain: data.map((d) => d.name),
        range: data.map((d) => CPF_COLORS[d.name] ?? "var(--color-chart-neutral)"),
      }),
    [data],
  )

  const chartSize = Math.min(width, height, 100)
  const centerX = chartSize / 2
  const centerY = chartSize / 2
  const radius = chartSize / 2 - 8
  const innerRadius = radius * 0.55

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
            padAngle={0.02}
            cornerRadius={4}
          >
            {(pie) =>
              pie.arcs.map((arc) => {
                const fill = colorScale(arc.data.name)
                return (
                  <path
                    key={arc.data.name}
                    d={pie.path(arc) ?? ""}
                    fill={fill}
                    onMouseMove={(e) => {
                      const rect = (e.target as SVGElement).getBoundingClientRect()
                      showTooltip({
                        tooltipData: arc.data,
                        tooltipLeft: rect.left + rect.width / 2,
                        tooltipTop: rect.top,
                      })
                    }}
                    onMouseLeave={hideTooltip}
                  />
                )
              })
            }
          </Pie>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-xs font-semibold"
          >
            ${formatCurrency(data.reduce((s, d) => s + d.value, 0))}
          </text>
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.name}-${tooltipLeft}-${tooltipTop}`}
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            background: "var(--color-card)",
            color: "var(--color-card-foreground)",
            padding: "6px 10px",
            fontSize: 12,
          }}
        >
          <div className="font-medium">
            {tooltipData.name} — {tooltipData.percentage.toFixed(1)}%
          </div>
          <div>${formatCurrency(tooltipData.value)}</div>
        </TooltipWithBounds>
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
            <p className="mt-1 text-2xl font-bold tracking-tight">
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
