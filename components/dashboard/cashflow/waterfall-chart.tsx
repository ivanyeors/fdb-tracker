"use client"

import { useMemo } from "react"
import { Bar } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"

export type WaterfallData = {
  month: string
  inflowTotal: number
  inflowBreakdown?: { salary?: number; bonus?: number; income?: number }
  outflowTotal: number
  outflowBreakdown: {
    discretionary: number
    insurance: number
    ilp: number
    loans: number
    tax: number
  }
  netSavings: number
}

type WaterfallBarItem = {
  name: string
  start: number
  end: number
  value: number
}

function buildWaterfallBars(data: WaterfallData): WaterfallBarItem[] {
  const bars: WaterfallBarItem[] = []
  let cumulative = 0

  if (data.inflowTotal > 0) {
    bars.push({ name: "Total Inflow", start: 0, end: data.inflowTotal, value: data.inflowTotal })
    cumulative = data.inflowTotal
  }

  const { discretionary, insurance, ilp, loans, tax } = data.outflowBreakdown
  if (discretionary > 0) {
    bars.push({ name: "Spending", start: cumulative, end: cumulative - discretionary, value: -discretionary })
    cumulative -= discretionary
  }
  if (insurance > 0) {
    bars.push({ name: "Insurance", start: cumulative, end: cumulative - insurance, value: -insurance })
    cumulative -= insurance
  }
  if (ilp > 0) {
    bars.push({ name: "ILP", start: cumulative, end: cumulative - ilp, value: -ilp })
    cumulative -= ilp
  }
  if (loans > 0) {
    bars.push({ name: "Loans", start: cumulative, end: cumulative - loans, value: -loans })
    cumulative -= loans
  }
  if (tax > 0) {
    bars.push({ name: "Tax", start: cumulative, end: cumulative - tax, value: -tax })
    cumulative -= tax
  }

  bars.push({
    name: "Net Savings",
    start: 0,
    end: data.netSavings,
    value: data.netSavings,
  })

  return bars
}

const POSITIVE_FILL = "var(--color-chart-positive)"
const NEGATIVE_FILL = "var(--color-chart-negative)"

const margin = { top: 8, right: 72, left: 8, bottom: 8 }

function formatValue(value: number): string {
  return `${value >= 0 ? "+" : ""}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function WaterfallChartInner({
  data,
  width,
  height,
}: {
  data: WaterfallData
  width: number
  height: number
}) {
  const chartData = useMemo(() => buildWaterfallBars(data), [data])
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<WaterfallBarItem>()

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.top - margin.bottom

  const xDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 0] as [number, number]
    const values = chartData.flatMap((d) => [d.start, d.end])
    const minVal = Math.min(0, ...values)
    const maxVal = Math.max(0, ...values)
    return [minVal, maxVal] as [number, number]
  }, [chartData])

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        range: [0, xMax],
        domain: xDomain,
        nice: true,
      }),
    [xMax, xDomain]
  )

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        range: [0, yMax],
        domain: chartData.map((d) => d.name),
        padding: 0.2,
      }),
    [yMax, chartData]
  )

  const connectors = useMemo(() => {
    const result: { x: number; yTop: number; yBottom: number }[] = []
    for (let i = 0; i < chartData.length - 1; i++) {
      const curr = chartData[i]
      const xVal = curr.end
      const yTop = (yScale(curr.name) ?? 0) + (yScale.bandwidth() ?? 0)
      const yBottom = yScale(chartData[i + 1].name) ?? 0
      result.push({ x: xScale(xVal) ?? 0, yTop, yBottom })
    }
    return result
  }, [chartData, yScale, xScale])

  const hasNoData =
    data.inflowTotal === 0 && data.outflowTotal === 0 && data.netSavings === 0

  if (chartData.length === 0 || hasNoData) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
        No data to display for this month
      </div>
    )
  }

  if (width < 10) return null

  const tickLabelProps = () => ({
    fill: "var(--color-muted-foreground)",
    fontSize: 12,
    textAnchor: "end" as const,
  })

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <AxisLeft
            scale={yScale}
            hideAxisLine
            hideTicks
            tickLabelProps={tickLabelProps}
            stroke="var(--color-border)"
            tickStroke="var(--color-border)"
          />
          <AxisBottom
            top={yMax}
            scale={xScale}
            hideAxisLine
            hideTicks
            tickFormat={(v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            stroke="var(--color-border)"
            tickStroke="var(--color-border)"
            tickLabelProps={() => ({
              fill: "var(--color-muted-foreground)",
              fontSize: 12,
              textAnchor: "middle" as const,
            })}
          />
          {chartData.map((bar) => {
            const barHeight = Math.max((yScale.bandwidth() ?? 0) * 0.6, 4)
            const barY = (yScale(bar.name) ?? 0) + ((yScale.bandwidth() ?? 0) - barHeight) / 2
            const xStart = Math.min(bar.start, bar.end)
            const xEnd = Math.max(bar.start, bar.end)
            const barX = xScale(xStart) ?? 0
            const barWidth = Math.max((xScale(xEnd) ?? 0) - barX, 2)
            const fill = bar.value >= 0 ? POSITIVE_FILL : NEGATIVE_FILL

            return (
              <g key={bar.name}>
                <Bar
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill={fill}
                  rx={2}
                  ry={2}
                  onMouseMove={(e) => {
                    const rect = (e.target as SVGElement).getBoundingClientRect()
                    showTooltip({
                      tooltipData: bar,
                      tooltipLeft: rect.left + rect.width / 2,
                      tooltipTop: rect.top,
                    })
                  }}
                  onMouseLeave={hideTooltip}
                />
                <text
                  x={bar.value >= 0 ? barX + barWidth + 6 : barX - 6}
                  y={barY + barHeight / 2}
                  textAnchor={bar.value >= 0 ? "start" : "end"}
                  dominantBaseline="middle"
                  fill="var(--color-foreground)"
                  fontSize={12}
                >
                  {formatValue(bar.value)}
                </text>
              </g>
            )
          })}
          {connectors.map((c, idx) => (
            <line
              key={idx}
              x1={c.x}
              y1={c.yTop}
              x2={c.x}
              y2={c.yBottom}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          ))}
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.name}-${tooltipLeft}-${tooltipTop}`}
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
          <div className="font-medium">{tooltipData.name}</div>
          <div>{formatValue(tooltipData.value)}</div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

export function WaterfallChart({ data }: { data: WaterfallData }) {
  return (
    <div className="h-[300px] w-full">
      <ParentSize>
        {({ width, height }) => (
          <WaterfallChartInner data={data} width={width} height={height ?? 300} />
        )}
      </ParentSize>
    </div>
  )
}
