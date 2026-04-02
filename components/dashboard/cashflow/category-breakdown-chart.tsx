"use client"

import { useMemo } from "react"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleOrdinal } from "@visx/scale"
import { ParentSize } from "@visx/responsive"
import { formatCurrency } from "@/lib/utils"

interface CategoryData {
  name: string
  total: number
  count: number
}

interface CategoryBreakdownChartProps {
  data: CategoryData[]
}

const COLORS = [
  "var(--color-chart-1, #e76f51)",
  "var(--color-chart-2, #f4a261)",
  "var(--color-chart-3, #e9c46a)",
  "var(--color-chart-4, #2a9d8f)",
  "var(--color-chart-5, #264653)",
  "var(--color-chart-6, #8ecae6)",
  "var(--color-chart-7, #219ebc)",
  "var(--color-chart-8, #023047)",
  "var(--color-chart-9, #ffb703)",
  "var(--color-chart-10, #fb8500)",
]

export function CategoryBreakdownChart({
  data,
}: CategoryBreakdownChartProps) {
  const total = useMemo(
    () => data.reduce((sum, d) => sum + d.total, 0),
    [data],
  )

  const colorScale = useMemo(
    () =>
      scaleOrdinal({
        domain: data.map((d) => d.name),
        range: COLORS,
      }),
    [data],
  )

  if (data.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-[200px] w-[200px] flex-shrink-0">
        <ParentSize>
          {({ width, height }) => {
            const radius = Math.min(width, height) / 2
            const innerRadius = radius * 0.55

            return (
              <svg width={width} height={height}>
                <Group top={height / 2} left={width / 2}>
                  <Pie
                    data={data}
                    pieValue={(d) => d.total}
                    outerRadius={radius - 4}
                    innerRadius={innerRadius}
                    padAngle={0.02}
                  >
                    {(pie) =>
                      pie.arcs.map((arc, i) => (
                        <g key={i}>
                          <path
                            d={pie.path(arc) ?? undefined}
                            fill={colorScale(arc.data.name)}
                          />
                        </g>
                      ))
                    }
                  </Pie>
                  <text
                    textAnchor="middle"
                    dy="0.1em"
                    className="fill-foreground text-lg font-semibold"
                  >
                    ${formatCurrency(total)}
                  </text>
                </Group>
              </svg>
            )
          }}
        </ParentSize>
      </div>

      {/* Legend */}
      <div className="space-y-1.5 text-sm">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: colorScale(d.name) }}
            />
            <span className="flex-1">{d.name}</span>
            <span className="text-muted-foreground tabular-nums">
              ${formatCurrency(d.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
