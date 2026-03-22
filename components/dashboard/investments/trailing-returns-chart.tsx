"use client"

import { useMemo } from "react"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { scaleBand, scaleLinear } from "@visx/scale"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { GridRows } from "@visx/grid"
import type { PerformanceSeriesPoint } from "@/lib/investments/ilp-snapshot-ui"

const FUND_COLOR = "var(--color-chart-1)"
const BENCHMARK_COLOR = "var(--color-chart-2)"
const CATEGORY_COLOR = "var(--color-chart-3)"

export function TrailingReturnsChart({
  data,
}: {
  data: PerformanceSeriesPoint[]
}) {
  const filtered = useMemo(
    () => data.filter((d) => d.fund != null),
    [data],
  )

  if (filtered.length === 0) return null

  const hasBenchmark = filtered.some((d) => d.benchmark != null)
  const hasCategory = filtered.some((d) => d.category != null)

  return (
    <div>
      <ParentSize debounceTime={10}>
        {({ width }) => {
          const w = Math.max(width, 280)
          const margin = { top: 12, right: 16, bottom: 36, left: 48 }
          const height = Math.max(180, filtered.length * 32 + margin.top + margin.bottom)
          const innerW = w - margin.left - margin.right
          const innerH = height - margin.top - margin.bottom

          const allVals = filtered.flatMap((d) =>
            [d.fund, d.benchmark, d.category].filter(
              (v): v is number => v != null,
            ),
          )
          const minV = Math.min(...allVals, 0)
          const maxV = Math.max(...allVals, 0)
          const pad = Math.max((maxV - minV) * 0.1, 1)

          const xScale = scaleLinear<number>({
            domain: [minV - pad, maxV + pad],
            range: [0, innerW],
          })

          const yScale = scaleBand<string>({
            domain: filtered.map((d) => d.period),
            range: [0, innerH],
            padding: 0.25,
          })

          const barCount = 1 + (hasBenchmark ? 1 : 0) + (hasCategory ? 1 : 0)
          const bandH = yScale.bandwidth()
          const barH = Math.min(bandH / barCount - 1, 12)
          const zero = xScale(0) ?? 0

          return (
            <svg width={w} height={height} className="overflow-visible">
              <Group left={margin.left} top={margin.top}>
                <GridRows
                  scale={yScale}
                  width={innerW}
                  stroke="var(--border)"
                  strokeOpacity={0.25}
                  strokeDasharray="3,4"
                />
                <line
                  x1={zero}
                  x2={zero}
                  y1={0}
                  y2={innerH}
                  stroke="var(--border)"
                  strokeOpacity={0.6}
                />
                {filtered.map((d) => {
                  const y0 = yScale(d.period) ?? 0
                  let barIdx = 0
                  const bars: React.ReactNode[] = []

                  if (d.fund != null) {
                    const x = xScale(Math.min(0, d.fund)) ?? 0
                    const barW = Math.abs(
                      (xScale(d.fund) ?? 0) - zero,
                    )
                    bars.push(
                      <rect
                        key="fund"
                        x={x}
                        y={y0 + barIdx * (barH + 1)}
                        width={Math.max(barW, 1)}
                        height={barH}
                        rx={2}
                        fill={FUND_COLOR}
                      />,
                    )
                    barIdx++
                  }
                  if (hasBenchmark && d.benchmark != null) {
                    const x = xScale(Math.min(0, d.benchmark)) ?? 0
                    const barW = Math.abs(
                      (xScale(d.benchmark) ?? 0) - zero,
                    )
                    bars.push(
                      <rect
                        key="benchmark"
                        x={x}
                        y={y0 + barIdx * (barH + 1)}
                        width={Math.max(barW, 1)}
                        height={barH}
                        rx={2}
                        fill={BENCHMARK_COLOR}
                      />,
                    )
                    barIdx++
                  }
                  if (hasCategory && d.category != null) {
                    const x = xScale(Math.min(0, d.category)) ?? 0
                    const barW = Math.abs(
                      (xScale(d.category) ?? 0) - zero,
                    )
                    bars.push(
                      <rect
                        key="category"
                        x={x}
                        y={y0 + barIdx * (barH + 1)}
                        width={Math.max(barW, 1)}
                        height={barH}
                        rx={2}
                        fill={CATEGORY_COLOR}
                      />,
                    )
                  }

                  return <Group key={d.period}>{bars}</Group>
                })}
                <AxisLeft
                  scale={yScale}
                  stroke="var(--border)"
                  tickStroke="var(--border)"
                  tickLabelProps={() => ({
                    fill: "var(--muted-foreground)",
                    fontSize: 10,
                    textAnchor: "end",
                    dy: "0.33em",
                  })}
                  hideTicks
                />
                <AxisBottom
                  top={innerH}
                  scale={xScale}
                  numTicks={5}
                  stroke="var(--border)"
                  tickStroke="var(--border)"
                  tickFormat={(v) => `${Number(v).toFixed(0)}%`}
                  tickLabelProps={() => ({
                    fill: "var(--muted-foreground)",
                    fontSize: 9,
                    textAnchor: "middle",
                  })}
                />
              </Group>
            </svg>
          )
        }}
      </ParentSize>
      <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-sm"
            style={{ background: FUND_COLOR }}
          />
          Fund
        </span>
        {hasBenchmark && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-sm"
              style={{ background: BENCHMARK_COLOR }}
            />
            Benchmark
          </span>
        )}
        {hasCategory && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-sm"
              style={{ background: CATEGORY_COLOR }}
            />
            Category
          </span>
        )}
      </div>
    </div>
  )
}
