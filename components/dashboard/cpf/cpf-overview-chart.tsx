"use client"

import { useMemo } from "react"
import { BarStack } from "@visx/shape"
import { Group } from "@visx/group"
import { Grid } from "@visx/grid"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"

type CpfRow = {
  month: string
  oa: number
  sa: number
  ma: number
}

const CPF_KEYS = ["oa", "sa", "ma"] as ["oa", "sa", "ma"]
const KEY_LABELS: Record<string, string> = {
  oa: "OA",
  sa: "SA",
  ma: "MA",
}

const colorScale = scaleOrdinal<string, string>({
  domain: CPF_KEYS,
  range: [
    "var(--color-chart-neutral)",
    "var(--color-chart-neutral)",
    "var(--color-chart-neutral)",
  ],
})

const margin = { top: 40, right: 20, bottom: 60, left: 50 }

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
    useTooltip<{ key: string; value: number; month: string }>()

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.top - margin.bottom

  const totals = useMemo(
    () => data.map((d) => d.oa + d.sa + d.ma),
    [data]
  )
  const yMaxVal = Math.max(...totals, 0) * 1.1

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.month),
        range: [0, xMax],
        padding: 0.2,
      }),
    [data, xMax]
  )

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, yMaxVal],
        range: [yMax, 0],
        nice: true,
      }),
    [yMax, yMaxVal]
  )

  if (width < 10 || data.length === 0) return null

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <Grid
            xScale={xScale}
            yScale={yScale}
            width={xMax}
            height={yMax}
            stroke="var(--color-border)"
            strokeOpacity={0.3}
            strokeDasharray="3 3"
            xOffset={xScale.bandwidth() / 2}
          />
          <BarStack<CpfRow, "oa" | "sa" | "ma">
            data={data}
            keys={CPF_KEYS}
            x={(d) => d.month}
            xScale={xScale}
            yScale={yScale}
            color={colorScale}
          >
            {(barStacks) =>
              barStacks.map((barStack) =>
                barStack.bars.map((bar) => (
                  <rect
                    key={`bar-${barStack.index}-${bar.index}`}
                    x={bar.x}
                    y={bar.y}
                    height={bar.height}
                    width={bar.width}
                    fill={bar.color}
                    rx={barStack.index === CPF_KEYS.length - 1 ? 4 : 0}
                    ry={barStack.index === CPF_KEYS.length - 1 ? 4 : 0}
                    onMouseMove={(e) => {
                      const rect = (e.target as SVGElement).getBoundingClientRect()
                      showTooltip({
                        tooltipData: {
                          key: KEY_LABELS[bar.key] ?? bar.key,
                          value: bar.bar.data[bar.key],
                          month: bar.bar.data.month,
                        },
                        tooltipLeft: rect.left + rect.width / 2,
                        tooltipTop: rect.top,
                      })
                    }}
                    onMouseLeave={hideTooltip}
                  />
                ))
              )
            }
          </BarStack>
        </Group>
        <AxisBottom
          top={height - margin.bottom}
          left={margin.left}
          scale={xScale}
          stroke="var(--color-border)"
          tickStroke="var(--color-border)"
          tickLabelProps={() => ({
            fill: "var(--color-muted-foreground)",
            fontSize: 12,
            textAnchor: "middle" as const,
          })}
        />
        <AxisLeft
          top={margin.top}
          left={margin.left}
          scale={yScale}
          stroke="var(--color-border)"
          tickStroke="var(--color-border)"
          tickFormat={(v) => `$${(Number(v) / 1000).toFixed(1)}k`}
          tickLabelProps={() => ({
            fill: "var(--color-muted-foreground)",
            fontSize: 12,
            textAnchor: "end" as const,
            dx: -4,
          })}
        />
      </svg>
      <div
        className="absolute flex flex-wrap gap-x-4 gap-y-1"
        style={{ top: margin.top / 2 - 10, left: margin.left }}
      >
        {CPF_KEYS.map((k) => (
          <span key={k} className="text-xs text-muted-foreground">
            <span
              className="mr-1.5 inline-block size-3 rounded-sm"
              style={{ backgroundColor: colorScale(k) }}
            />
            {KEY_LABELS[k]}
          </span>
        ))}
      </div>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.month}-${tooltipData.key}-${tooltipLeft}`}
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--color-card-foreground)",
          }}
        >
          <div className="font-medium">{tooltipData.month}</div>
          <div>
            {tooltipData.key}: ${Number(tooltipData.value).toLocaleString()}
          </div>
        </TooltipWithBounds>
      )}
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
