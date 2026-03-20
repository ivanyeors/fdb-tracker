"use client"

import { useMemo } from "react"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleOrdinal } from "@visx/scale"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { formatCurrency } from "@/lib/utils"
import {
  formatReliefType,
  getReliefCategoryHelp,
} from "@/lib/tax/relief-labels"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-neutral)",
  "oklch(0.55 0.08 280)",
  "oklch(0.60 0.10 200)",
]

export interface ReliefChartItem {
  relief_type: string
  name: string
  value: number
  percentage: number
}

interface TaxReliefDonutProps {
  reliefs: Array<{ relief_type: string; amount: number }>
}

function TaxReliefDonutInner({
  reliefs,
  width,
  height,
}: TaxReliefDonutProps & { width: number; height: number }) {
  const data = useMemo(() => {
    const byType = new Map<string, number>()
    for (const r of reliefs) {
      const current = byType.get(r.relief_type) ?? 0
      byType.set(r.relief_type, current + r.amount)
    }
    const total = [...byType.values()].reduce((s, v) => s + v, 0)
    if (total === 0) return []
    return [...byType.entries()].map(([relief_type, amount]) => ({
      relief_type,
      name: formatReliefType(relief_type),
      value: amount,
      percentage: Math.round((amount / total) * 1000) / 10,
    }))
  }, [reliefs])

  const total = data.reduce((s, d) => s + d.value, 0)
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<ReliefChartItem>()

  const colorScale = useMemo(
    () =>
      scaleOrdinal<string, string>({
        domain: data.map((d) => d.name),
        range: CHART_COLORS.slice(0, data.length),
      }),
    [data]
  )

  const innerWidth = Math.min(width, 260)
  const donutHeight = Math.min(height - 120, 260)
  const centerX = innerWidth / 2
  const centerY = donutHeight / 2
  const radius = Math.min(innerWidth, donutHeight) / 2 - 12
  const innerRadius = radius * 0.55

  if (width < 10 || data.length === 0) return null

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="relative mx-auto" style={{ width: innerWidth, height: donutHeight }}>
        <svg width={innerWidth} height={donutHeight}>
          <Group top={centerY} left={centerX}>
            <Pie
              data={data}
              pieValue={(d) => d.value}
              outerRadius={radius}
              innerRadius={innerRadius}
              padAngle={0.005}
            >
              {(pie) =>
                pie.arcs.map((arc, index) => {
                  const { startAngle, endAngle } = arc
                  const midAngle = (startAngle + endAngle) / 2
                  const RADIAN = Math.PI / 180
                  const labelRadius = innerRadius + (radius - innerRadius) * 0.5
                  const labelX = labelRadius * Math.cos(-midAngle * RADIAN)
                  const labelY = labelRadius * Math.sin(-midAngle * RADIAN)
                  const pct = arc.data.percentage
                  const fill = colorScale(arc.data.name)

                  return (
                    <g key={index}>
                      <title>
                        {arc.data.name}: {pct}% (${formatCurrency(arc.data.value)})
                      </title>
                      <path
                        d={pie.path(arc) ?? ""}
                        fill={fill}
                        className="cursor-pointer"
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
                      {pct >= 8 && (
                        <text
                          x={labelX}
                          y={labelY}
                          fill="white"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="text-xs font-medium"
                        >
                          {pct.toFixed(pct >= 10 ? 0 : 1)}%
                        </text>
                      )}
                    </g>
                  )
                })
              }
            </Pie>
            <text
              x={0}
              y={-6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wide"
            >
              Total reliefs
            </text>
            <text
              x={0}
              y={12}
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
            className="z-[100]"
            style={{
              zIndex: 100,
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-card)",
              color: "var(--color-card-foreground)",
              padding: "8px 12px",
              fontSize: 12,
              maxWidth: 280,
            }}
          >
            <div className="font-medium">
              {tooltipData.name} · {tooltipData.percentage.toFixed(1)}%
            </div>
            <div className="mt-0.5 text-muted-foreground">
              ${formatCurrency(tooltipData.value)} of ${formatCurrency(total)}
            </div>
            <div className="mt-1.5 text-xs leading-snug text-muted-foreground">
              {getReliefCategoryHelp(tooltipData.relief_type)}
            </div>
          </TooltipWithBounds>
        )}
      </div>

      <ul className="mx-auto w-full max-w-md space-y-2">
        {data.map((d) => (
          <li key={d.relief_type}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex cursor-default items-center gap-3 rounded-lg border bg-muted/10 px-3 py-2 text-sm transition-colors hover:bg-muted/25">
                  <span
                    className="size-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: colorScale(d.name) }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.percentage.toFixed(1)}% · ${formatCurrency(d.value)}
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs">
                {getReliefCategoryHelp(d.relief_type)}
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TaxReliefDonut({ reliefs }: TaxReliefDonutProps) {
  return (
    <div className="w-full min-h-[320px]">
      <ParentSize>
        {({ width, height }) => (
          <TaxReliefDonutInner
            reliefs={reliefs}
            width={width}
            height={Math.max(height ?? 380, 380)}
          />
        )}
      </ParentSize>
    </div>
  )
}
