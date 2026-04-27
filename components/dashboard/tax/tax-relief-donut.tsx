"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { formatCurrency } from "@/lib/utils"
import { createCategoryColorScale } from "@/lib/chart-colors"
import {
  formatReliefType,
  getReliefCategoryHelp,
} from "@/lib/tax/relief-labels"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface ReliefChartItem {
  relief_type: string
  name: string
  value: number
  percentage: number
}

interface TaxReliefDonutProps {
  readonly reliefs: Array<{ relief_type: string; amount: number }>
  /** Tighter layout for narrow grid columns (e.g. top summary row). */
  readonly compact?: boolean
}

function TaxReliefDonutInner({
  reliefs,
  width,
  height,
  compact,
}: TaxReliefDonutProps & { readonly width: number; readonly height: number }) {
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
    () => createCategoryColorScale(data.map((d) => d.name)),
    [data],
  )

  const maxDonut = compact ? 200 : 260
  const legendBudget = compact ? 72 : 120
  const innerWidth = Math.min(width, maxDonut)
  const donutHeight = Math.min(height - legendBudget, maxDonut)
  const centerX = innerWidth / 2
  const centerY = donutHeight / 2
  const radius = Math.min(innerWidth, donutHeight) / 2 - 12
  const innerRadius = radius * 0.55

  if (width < 10 || data.length === 0) return null

  return (
    <div
      className={`flex w-full flex-col ${compact ? "gap-2" : "gap-4"}`}
    >
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
                pie.arcs.map((arc) => {
                  const { startAngle, endAngle } = arc
                  const midAngle = (startAngle + endAngle) / 2
                  const RADIAN = Math.PI / 180
                  const labelRadius = innerRadius + (radius - innerRadius) * 0.5
                  const labelX = labelRadius * Math.cos(-midAngle * RADIAN)
                  const labelY = labelRadius * Math.sin(-midAngle * RADIAN)
                  const pct = arc.data.percentage
                  const fill = colorScale(arc.data.name)

                  return (
                    <g key={`relief-arc-${arc.data.name}`}>
                      <title>
                        {arc.data.name}: {pct}% (${formatCurrency(arc.data.value)})
                      </title>
                      <path
                        d={pie.path(arc) ?? ""}
                        fill={fill}
                        className="cursor-pointer"
                        onMouseMove={(e) => {
                          showTooltip({
                            tooltipData: arc.data,
                            tooltipLeft: e.clientX,
                            tooltipTop: e.clientY,
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
              <div className="mt-0.5 text-muted-foreground">
                ${formatCurrency(tooltipData.value)} of $
                {formatCurrency(total)}
              </div>
              <div className="mt-1.5 text-xs leading-snug text-muted-foreground">
                {getReliefCategoryHelp(tooltipData.relief_type)}
              </div>
            </div>,
            document.body,
          )}
      </div>

      <ul
        className={`mx-auto w-full max-w-md ${compact ? "space-y-1" : "space-y-2"}`}
      >
        {data.map((d) => (
          <li key={d.relief_type}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex cursor-default items-center rounded-lg border bg-muted/10 transition-colors hover:bg-muted/25 ${
                    compact
                      ? "gap-2 px-2 py-1.5 text-xs"
                      : "gap-3 px-3 py-2 text-sm"
                  }`}
                >
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

export function TaxReliefDonut({ reliefs, compact = false }: TaxReliefDonutProps) {
  const minOuter = compact ? 260 : 320
  const minH = compact ? 260 : 380
  return (
    <div className="w-full" style={{ minHeight: minOuter }}>
      <ParentSize>
        {({ width, height }) => (
          <TaxReliefDonutInner
            reliefs={reliefs}
            width={width}
            height={Math.max(height ?? minH, minH)}
            compact={compact}
          />
        )}
      </ParentSize>
    </div>
  )
}
