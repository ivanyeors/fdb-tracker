"use client"

import { useMemo } from "react"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleOrdinal } from "@visx/scale"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"

const GREY_SHADES = [
  "var(--color-chart-neutral)",
  "oklch(0.50 0.02 250)",
  "oklch(0.60 0.02 250)",
  "oklch(0.45 0.02 250)",
  "oklch(0.70 0.02 250)",
  "oklch(0.55 0.02 250)",
]

interface AllocationData {
  name: string
  value: number
  percentage: number
}

interface AllocationChartProps {
  data: AllocationData[]
  title?: string
}

function AllocationChartInner({
  data,
  title,
  width,
  height,
}: AllocationChartProps & { width: number; height: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<AllocationData>()

  const colorScale = useMemo(
    () =>
      scaleOrdinal<string, string>({
        domain: data.map((d) => d.name),
        range: GREY_SHADES,
      }),
    [data]
  )

  const innerWidth = Math.min(width, 280)
  const innerHeight = Math.min(height, 280)
  const centerX = innerWidth / 2
  const centerY = innerHeight / 2
  const radius = Math.min(innerWidth, innerHeight) / 2 - 20
  const innerRadius = radius * 0.6

  if (width < 10 || data.length === 0) return null

  return (
    <div className="flex flex-col items-center">
      {title && (
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      )}
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
                pie.arcs.map((arc) => {
                  const { startAngle, endAngle } = arc
                  const midAngle = (startAngle + endAngle) / 2
                  const RADIAN = Math.PI / 180
                  const labelRadius = innerRadius + (radius - innerRadius) * 0.5
                  const labelX = labelRadius * Math.cos(-midAngle * RADIAN)
                  const labelY = labelRadius * Math.sin(-midAngle * RADIAN)
                  const percentage = data.find((d) => d.name === arc.data.name)?.percentage ?? 0
                  const fill = colorScale(arc.data.name)

                  return (
                    <g key={arc.data.name}>
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
                      {percentage >= 5 && (
                        <text
                          x={labelX}
                          y={labelY}
                          fill="white"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="text-xs font-medium"
                        >
                          {percentage.toFixed(0)}%
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
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
          {data.map((d) => (
            <span
              key={d.name}
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

export function AllocationChart({ data, title }: AllocationChartProps) {
  return (
    <div className="w-full" style={{ height: 280 }}>
      <ParentSize>
        {({ width, height }) => (
          <AllocationChartInner data={data} title={title} width={width} height={height ?? 280} />
        )}
      </ParentSize>
    </div>
  )
}
