"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { Bar } from "@visx/shape"
import { useChartHeight } from "@/hooks/use-chart-height"
import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { useTooltip } from "@visx/tooltip"
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
    ilpOneTime: number
    loans: number
    earlyRepayments: number
    tax: number
    taxReliefCash: number
    savingsGoals: number
    investments: number
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

  const ob = data.outflowBreakdown
  const outflowItems: { name: string; value: number }[] = [
    { name: "Spending", value: ob.discretionary },
    { name: "Insurance", value: ob.insurance },
    { name: "ILP", value: ob.ilp },
    { name: "ILP (One-Time)", value: ob.ilpOneTime },
    { name: "Loans", value: ob.loans },
    { name: "Early Repayments", value: ob.earlyRepayments },
    { name: "Tax", value: ob.tax },
    { name: "SRS/CPF Top-ups", value: ob.taxReliefCash },
    { name: "Savings Goals", value: ob.savingsGoals },
    { name: "Investments", value: ob.investments },
  ]
  for (const item of outflowItems) {
    if (item.value > 0) {
      bars.push({ name: item.name, start: cumulative, end: cumulative - item.value, value: -item.value })
      cumulative -= item.value
    }
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

const margin = { top: 8, right: 72, left: 100, bottom: 8 }

function formatValue(value: number): string {
  return `${value >= 0 ? "+" : ""}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function WaterfallTooltipContent({
  bar,
  data,
  formatValue,
}: {
  bar: WaterfallBarItem
  data: WaterfallData
  formatValue: (v: number) => string
}) {
  const inflow = data.inflowTotal
  const pctOfInflow = inflow > 0 ? (Math.abs(bar.value) / inflow) * 100 : 0

  if (bar.name === "Total Inflow") {
    const breakdown = data.inflowBreakdown
    const hasBreakdown = breakdown && Object.values(breakdown).some((v) => (v ?? 0) > 0)
    return (
      <>
        <div className="font-medium">{bar.name}</div>
        <div>{formatValue(bar.value)}</div>
        {hasBreakdown && breakdown && (
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            {breakdown.salary != null && breakdown.salary > 0 && (
              <div>Salary: {formatValue(breakdown.salary)}</div>
            )}
            {breakdown.bonus != null && breakdown.bonus > 0 && (
              <div>Bonus: {formatValue(breakdown.bonus)}</div>
            )}
            {breakdown.income != null && breakdown.income > 0 && (
              <div>Other income: {formatValue(breakdown.income)}</div>
            )}
          </div>
        )}
      </>
    )
  }

  if (bar.name === "Net Savings") {
    const savingsRate = inflow > 0 ? (bar.value / inflow) * 100 : 0
    return (
      <>
        <div className="font-medium">{bar.name}</div>
        <div>{formatValue(bar.value)}</div>
        {inflow > 0 && (
          <div className="text-muted-foreground">Saved {savingsRate.toFixed(1)}% of inflow</div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="font-medium">{bar.name}</div>
      <div>{formatValue(bar.value)}</div>
      {inflow > 0 && bar.value < 0 && (
        <div className="text-muted-foreground">{pctOfInflow.toFixed(1)}% of inflow</div>
      )}
    </>
  )
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
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<{
    bar: WaterfallBarItem
    data: WaterfallData
  }>()

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
                    showTooltip({
                      tooltipData: { bar, data },
                      tooltipLeft: e.clientX,
                      tooltipTop: e.clientY,
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
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={`${tooltipData.bar.name}-${tooltipLeft}-${tooltipTop}`}
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
            <WaterfallTooltipContent bar={tooltipData.bar} data={tooltipData.data} formatValue={formatValue} />
          </div>,
          document.body,
        )}
    </div>
  )
}

export function WaterfallChart({ data }: { data: WaterfallData }) {
  const chartHeight = useChartHeight(300, 220)
  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ParentSize>
        {({ width, height }) => (
          <WaterfallChartInner data={data} width={width} height={height ?? chartHeight} />
        )}
      </ParentSize>
    </div>
  )
}
