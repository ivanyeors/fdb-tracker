"use client"

import { useMemo } from "react"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleOrdinal } from "@visx/scale"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"

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

function formatReliefType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface ReliefChartItem {
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
      name: formatReliefType(relief_type),
      value: amount,
      percentage: Math.round((amount / total) * 100),
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

  const innerWidth = Math.min(width, 240)
  const innerHeight = Math.min(height, 240)
  const centerX = innerWidth / 2
  const centerY = innerHeight / 2
  const radius = Math.min(innerWidth, innerHeight) / 2 - 16
  const innerRadius = radius * 0.55

  if (width < 10 || data.length === 0) return null

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: innerWidth, height: innerHeight }}>
        <svg width={innerWidth} height={innerHeight}>
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
                  const percentage = arc.data.percentage
                  const fill = colorScale(arc.data.name)

                  return (
                    <g key={index}>
                      <path
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
                      {percentage >= 8 && (
                        <text
                          x={labelX}
                          y={labelY}
                          fill="white"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="text-xs font-medium"
                        >
                          {percentage}%
                        </text>
                      )}
                    </g>
                  )
                })
              }
            </Pie>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground text-sm font-semibold"
            >
              ${total.toLocaleString()}
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
            <div className="font-medium">{tooltipData.name} — {tooltipData.percentage}%</div>
            <div>${Number(tooltipData.value).toLocaleString()} of ${total.toLocaleString()} total</div>
          </TooltipWithBounds>
        )}
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2">
          {data.map((d, index) => (
            <span
              key={index}
              className="text-xs"
              style={{ color: colorScale(d.name) }}
            >
              {d.name} ({d.percentage}%)
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TaxReliefDonut({ reliefs }: TaxReliefDonutProps) {
  return (
    <div className="w-full" style={{ height: 260 }}>
      <ParentSize>
        {({ width, height }) => (
          <TaxReliefDonutInner reliefs={reliefs} width={width} height={height ?? 260} />
        )}
      </ParentSize>
    </div>
  )
}
