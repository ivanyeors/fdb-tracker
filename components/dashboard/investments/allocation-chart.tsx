"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { createCategoryColorScale } from "@/lib/chart-colors"

interface AllocationData {
  name: string
  value: number
  percentage: number
}

interface AllocationChartProps {
  data: AllocationData[]
  title?: string
  /** If set, only this many rows are shown in the legend (data should be pre-sorted by value). */
  legendMaxItems?: number
  /** Outer container height for ParentSize (default 280). */
  height?: number
}

function AllocationChartInner({
  data,
  title,
  legendMaxItems,
  width,
  height,
}: AllocationChartProps & { width: number; height: number }) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<AllocationData>()

  const [hoveredName, setHoveredName] = useState<string | null>(null)

  const colorScale = useMemo(
    () => createCategoryColorScale(data.map((d) => d.name)),
    [data],
  )

  const titleBudget = title ? 28 : 0
  const legendRowCount =
    legendMaxItems != null
      ? Math.min(legendMaxItems, data.length)
      : data.length
  const legendBudget = Math.min(100, 8 + legendRowCount * 28)
  const innerWidth = width
  const chartVertical = Math.max(
    96,
    height - titleBudget - legendBudget - 10,
  )
  const chartSize = Math.min(innerWidth - 8, chartVertical)
  const donutHeight = chartSize
  const size = chartSize
  const centerX = size / 2
  const centerY = donutHeight / 2
  const radius = Math.min(size, donutHeight) / 2 - 12
  const innerRadius = radius * 0.58

  if (width < 10 || data.length === 0) return null

  const legendData =
    legendMaxItems != null
      ? data.slice(0, Math.min(legendMaxItems, data.length))
      : data

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      )}
      <div
        className="relative mx-auto shrink-0"
        style={{ width: size, height: donutHeight }}
      >
        <svg width={size} height={donutHeight}>
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
                  const { startAngle, endAngle } = arc
                  const midAngle = (startAngle + endAngle) / 2
                  const RADIAN = Math.PI / 180
                  const labelRadius = innerRadius + (radius - innerRadius) * 0.5
                  const labelX = labelRadius * Math.cos(-midAngle * RADIAN)
                  const labelY = labelRadius * Math.sin(-midAngle * RADIAN)
                  const percentage =
                    data.find((d) => d.name === arc.data.name)?.percentage ?? 0
                  const fill = colorScale(arc.data.name)
                  const dimmed = hoveredName !== null && hoveredName !== arc.data.name

                  return (
                    <g key={arc.data.name}>
                      <path
                        d={pie.path(arc) ?? ""}
                        fill={fill}
                        className="cursor-pointer transition-[opacity] duration-150"
                        style={{ opacity: dimmed ? 0.45 : 1 }}
                        onMouseMove={(e) => {
                          setHoveredName(arc.data.name)
                          showTooltip({
                            tooltipData: arc.data,
                            tooltipLeft: e.clientX,
                            tooltipTop: e.clientY,
                          })
                        }}
                        onMouseLeave={() => {
                          setHoveredName(null)
                          hideTooltip()
                        }}
                      />
                      {percentage >= 8 && (
                        <text
                          x={labelX}
                          y={labelY}
                          fill="white"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="text-xs font-medium"
                          style={{ opacity: dimmed ? 0.5 : 1 }}
                        >
                          {percentage.toFixed(percentage >= 10 ? 0 : 1)}%
                        </text>
                      )}
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
              {formatMoney(total)}
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
                {formatMoney(tooltipData.value)} of {formatMoney(total)}
              </div>
            </div>,
            document.body,
          )}
      </div>

      <ul className="mx-auto w-full max-w-md space-y-1 pt-1">
        {legendData.map((d) => (
          <li key={d.name}>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/25 sm:gap-3 sm:px-3 sm:py-2 sm:text-sm">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: colorScale(d.name) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {d.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {d.percentage.toFixed(1)}%
              </span>
              <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
                {formatMoney(d.value)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AllocationChart({
  data,
  title,
  legendMaxItems,
  height: containerHeight = 280,
}: AllocationChartProps) {
  return (
    <div className="w-full" style={{ height: containerHeight }}>
      <ParentSize>
        {({ width, height }) => (
          <AllocationChartInner
            data={data}
            title={title}
            legendMaxItems={legendMaxItems}
            width={width}
            height={height ?? containerHeight}
          />
        )}
      </ParentSize>
    </div>
  )
}
