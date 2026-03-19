"use client"

import { useMemo } from "react"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleOrdinal } from "@visx/scale"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { formatCurrency } from "@/lib/utils"

type CpfRow = {
  month: string
  oa: number
  sa: number
  ma: number
}

// CPF account colors: OA (blue), SA (green), MA (orange)
const CPF_COLORS: Record<string, string> = {
  OA: "oklch(0.55 0.15 250)",
  SA: "oklch(0.55 0.15 145)",
  MA: "oklch(0.65 0.15 45)",
}

type DonutData = {
  name: string
  value: number
  percentage: number
}

function CpfOverviewChartInner({
  data,
  width,
  height,
}: {
  data: CpfRow[]
  width: number
  height: number
}) {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<DonutData>()

  const donutData = useMemo<DonutData[]>(() => {
    const totalOA = data.reduce((s, d) => s + d.oa, 0)
    const totalSA = data.reduce((s, d) => s + d.sa, 0)
    const totalMA = data.reduce((s, d) => s + d.ma, 0)
    const total = totalOA + totalSA + totalMA
    if (total <= 0) return []
    return [
      { name: "OA", value: totalOA, percentage: (totalOA / total) * 100 },
      { name: "SA", value: totalSA, percentage: (totalSA / total) * 100 },
      { name: "MA", value: totalMA, percentage: (totalMA / total) * 100 },
    ].filter((d) => d.value > 0)
  }, [data])

  const total = donutData.reduce((s, d) => s + d.value, 0)
  const colorScale = useMemo(
    () =>
      scaleOrdinal<string, string>({
        domain: donutData.map((d) => d.name),
        range: donutData.map((d) => CPF_COLORS[d.name] ?? "var(--color-chart-neutral)"),
      }),
    [donutData],
  )

  const innerWidth = Math.min(width, 240)
  const innerHeight = Math.min(height, 240)
  const centerX = innerWidth / 2
  const centerY = innerHeight / 2
  const radius = Math.min(innerWidth, innerHeight) / 2 - 16
  const innerRadius = radius * 0.55

  if (width < 10 || donutData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
        No contribution data for the last 6 months.
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: innerWidth, height: innerHeight }}>
        <svg width={innerWidth} height={innerHeight}>
          <Group top={centerY} left={centerX}>
            <Pie
              data={donutData}
              pieValue={(d) => d.value}
              outerRadius={radius}
              innerRadius={innerRadius}
              padAngle={0.005}
              cornerRadius={4}
            >
              {(pie) =>
                pie.arcs.map((arc) => (
                  <path
                    key={arc.data.name}
                    d={pie.path(arc) ?? ""}
                    fill={colorScale(arc.data.name)}
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
                ))
              }
            </Pie>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground text-sm font-semibold"
            >
              ${formatCurrency(total)}
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
              padding: "8px 12px",
              fontSize: 12,
            }}
          >
            <div className="font-medium">
              {tooltipData.name} — {tooltipData.percentage.toFixed(1)}%
            </div>
            <div>${formatCurrency(tooltipData.value)}</div>
            <div className="text-muted-foreground">
              of ${formatCurrency(total)} total
            </div>
          </TooltipWithBounds>
        )}
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2">
          {donutData.map((d) => (
            <span
              key={d.name}
              className="text-xs"
              style={{ color: colorScale(d.name) }}
            >
              {d.name} ({d.percentage.toFixed(1)}%)
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CpfOverviewChart({ data }: { data: CpfRow[] }) {
  return (
    <div className="h-[300px] w-full">
      <ParentSize>
        {({ width, height }) => (
          <CpfOverviewChartInner data={data} width={width} height={height ?? 300} />
        )}
      </ParentSize>
    </div>
  )
}
