"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Pie } from "@visx/shape"
import { useChartHeight } from "@/hooks/use-chart-height"
import { Group } from "@visx/group"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { formatCurrency } from "@/lib/utils"
import { createCategoryColorScale } from "@/lib/chart-colors"

type CpfRow = {
  month: string
  oa: number
  sa: number
  ma: number
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
  const [hoveredArcIndex, setHoveredArcIndex] = useState<number | null>(null)

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
    () => createCategoryColorScale(donutData.map((d) => d.name)),
    [donutData],
  )

  if (width < 10 || donutData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No contribution data for the last 6 months.
      </div>
    )
  }

  const size = Math.min(width - 8, height - 10, 220)
  const centerX = size / 2
  const centerY = size / 2
  const radius = size / 2 - 8
  const innerRadius = radius * 0.58

  return (
    <div className="flex w-full min-h-0 flex-col items-center justify-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <Group top={centerY} left={centerX}>
            <Pie
              data={donutData}
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
            <text
              x={0}
              y={-8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wide"
            >
              Total
            </text>
            <text
              x={0}
              y={10}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground text-sm font-semibold tabular-nums"
            >
              ${formatCurrency(total)}
            </text>
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
      <ul className="mx-auto w-full max-w-[11rem] shrink-0 space-y-0.5 pt-0.5 sm:mx-0 sm:w-auto sm:min-w-[6.5rem]">
        {donutData.map((d, i) => (
          <li key={`${i}-${d.name}`}>
            <div className="flex items-center gap-1 text-[11px] leading-tight sm:text-xs">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: colorScale(d.name) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {d.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {d.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="truncate pl-3 text-[10px] tabular-nums text-muted-foreground">
              ${formatCurrency(d.value)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CpfOverviewChart({ data }: { data: CpfRow[] }) {
  const chartHeight = useChartHeight(280, 200)
  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ParentSize>
        {({ width, height }) => (
          <CpfOverviewChartInner data={data} width={width} height={height ?? chartHeight} />
        )}
      </ParentSize>
    </div>
  )
}
