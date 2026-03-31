"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { Bar } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"

export type WaterfallData = {
  month: string
  startingBankBalance?: number
  endingBankBalance?: number
  inflowTotal: number
  inflowBreakdown?: {
    salary?: number
    bonus?: number
    income?: number
    bankInterest?: number
    dividends?: number
  }
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
    giroTransfers?: number
  }
  netSavings: number
}

export type WaterfallBarItem = {
  name: string
  start: number
  end: number
  value: number
  type: "anchor" | "inflow" | "outflow" | "net"
}

export type InvestmentWaterfallSection = {
  startingValue: number
  endingValue: number
  dividends: number
  buys: number
  sells: number
  marketGain: number
}

export type CpfWaterfallSection = {
  startingBalance: number
  endingBalance: number
  contributions: number
  housing: number
}

export type WaterfallDataV2 = WaterfallData & {
  investments?: InvestmentWaterfallSection
  cpf?: CpfWaterfallSection
}

export function buildWaterfallBars(data: WaterfallData): WaterfallBarItem[] {
  const bars: WaterfallBarItem[] = []
  const hasBankBalance = data.startingBankBalance != null

  let cumulative = 0

  // Starting Bank Balance (anchor)
  if (hasBankBalance) {
    bars.push({
      name: "Starting Balance",
      start: 0,
      end: data.startingBankBalance!,
      value: data.startingBankBalance!,
      type: "anchor",
    })
    cumulative = data.startingBankBalance!
  }

  // Inflow items as individual bars
  const ib = data.inflowBreakdown
  const inflowItems: { name: string; value: number }[] = []
  if (ib) {
    if (ib.salary && ib.salary > 0) inflowItems.push({ name: "Salary", value: ib.salary })
    if (ib.bonus && ib.bonus > 0) inflowItems.push({ name: "Bonus", value: ib.bonus })
    if (ib.bankInterest && ib.bankInterest > 0)
      inflowItems.push({ name: "Bank Interest", value: ib.bankInterest })
    if (ib.dividends && ib.dividends > 0)
      inflowItems.push({ name: "Dividends", value: ib.dividends })
    if (ib.income && ib.income > 0)
      inflowItems.push({ name: "Other Income", value: ib.income })
  }

  // Fallback: single "Total Inflow" bar if no breakdown
  if (inflowItems.length === 0 && data.inflowTotal > 0) {
    inflowItems.push({ name: "Total Inflow", value: data.inflowTotal })
  }

  for (const item of inflowItems) {
    bars.push({
      name: item.name,
      start: cumulative,
      end: cumulative + item.value,
      value: item.value,
      type: "inflow",
    })
    cumulative += item.value
  }

  // Outflow items
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
    { name: "GIRO Transfers", value: ob.giroTransfers ?? 0 },
  ]

  for (const item of outflowItems) {
    if (item.value > 0) {
      bars.push({
        name: item.name,
        start: cumulative,
        end: cumulative - item.value,
        value: -item.value,
        type: "outflow",
      })
      cumulative -= item.value
    }
  }

  // Ending Bank Balance (anchor) or Net Savings fallback
  if (hasBankBalance) {
    bars.push({
      name: "Ending Balance",
      start: 0,
      end: data.endingBankBalance!,
      value: data.endingBankBalance!,
      type: "anchor",
    })
  } else {
    bars.push({
      name: "Net Savings",
      start: 0,
      end: data.netSavings,
      value: data.netSavings,
      type: "net",
    })
  }

  return bars
}

const POSITIVE_FILL = "var(--color-chart-positive)"
const NEGATIVE_FILL = "var(--color-chart-negative)"
const NEUTRAL_FILL = "var(--color-muted-foreground)"

const margin = { top: 8, right: 72, left: 120, bottom: 8 }

function formatValue(value: number, isAnchor = false): string {
  if (isAnchor)
    return `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `${value >= 0 ? "+" : ""}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function WaterfallTooltipContent({
  bar,
  data,
}: {
  bar: WaterfallBarItem
  data: WaterfallData
}) {
  const inflow = data.inflowTotal

  if (bar.type === "anchor") {
    return (
      <>
        <div className="font-medium">{bar.name}</div>
        <div>
          ${Math.abs(bar.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </>
    )
  }

  if (bar.type === "net") {
    const savingsRate = inflow > 0 ? (bar.value / inflow) * 100 : 0
    return (
      <>
        <div className="font-medium">{bar.name}</div>
        <div>{formatValue(bar.value)}</div>
        {inflow > 0 && (
          <div className="text-muted-foreground">
            Saved {savingsRate.toFixed(1)}% of inflow
          </div>
        )}
      </>
    )
  }

  const pctOfInflow = inflow > 0 ? (Math.abs(bar.value) / inflow) * 100 : 0

  return (
    <>
      <div className="font-medium">{bar.name}</div>
      <div>{formatValue(bar.value)}</div>
      {inflow > 0 && (
        <div className="text-muted-foreground">
          {pctOfInflow.toFixed(1)}% of inflow
        </div>
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
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<{ bar: WaterfallBarItem; data: WaterfallData }>()

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
    [xMax, xDomain],
  )

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        range: [0, yMax],
        domain: chartData.map((d) => d.name),
        padding: 0.2,
      }),
    [yMax, chartData],
  )

  // Connector lines — connect bar bottom edge to next bar top edge (no padding gap)
  const connectors = useMemo(() => {
    const result: { x: number; yTop: number; yBottom: number; dashed: boolean }[] = []
    const bw = yScale.bandwidth() ?? 0
    const barH = Math.max(bw * 0.6, 4)
    const barOffset = (bw - barH) / 2

    for (let i = 0; i < chartData.length - 1; i++) {
      const curr = chartData[i]!
      const next = chartData[i + 1]!
      // Skip connector TO anchor/net bars (they start from 0)
      if (next.type === "anchor" || next.type === "net") continue
      const xVal = curr.end
      const yTop = (yScale(curr.name) ?? 0) + barOffset + barH
      const yBottom = (yScale(next.name) ?? 0) + barOffset
      if (curr.type === "anchor") {
        result.push({ x: xScale(xVal) ?? 0, yTop, yBottom, dashed: true })
        continue
      }
      result.push({ x: xScale(xVal) ?? 0, yTop, yBottom, dashed: false })
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
    fontSize: 11,
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
            tickFormat={(v) =>
              `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            }
            stroke="var(--color-border)"
            tickStroke="var(--color-border)"
            tickLabelProps={() => ({
              fill: "var(--color-muted-foreground)",
              fontSize: 11,
              textAnchor: "middle" as const,
            })}
          />
          {chartData.map((bar) => {
            const barHeight = Math.max((yScale.bandwidth() ?? 0) * 0.6, 4)
            const barY =
              (yScale(bar.name) ?? 0) + ((yScale.bandwidth() ?? 0) - barHeight) / 2
            const xStart = Math.min(bar.start, bar.end)
            const xEnd = Math.max(bar.start, bar.end)
            const barX = xScale(xStart) ?? 0
            const barWidth = Math.max((xScale(xEnd) ?? 0) - barX, 2)
            const isAnchor = bar.type === "anchor"
            const fill = isAnchor
              ? NEUTRAL_FILL
              : bar.value >= 0
                ? POSITIVE_FILL
                : NEGATIVE_FILL

            return (
              <g key={bar.name}>
                <Bar
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill={fill}
                  fillOpacity={isAnchor ? 0.5 : 1}
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
                  x={
                    bar.value >= 0 || isAnchor
                      ? barX + barWidth + 6
                      : barX - 6
                  }
                  y={barY + barHeight / 2}
                  textAnchor={bar.value >= 0 || isAnchor ? "start" : "end"}
                  dominantBaseline="middle"
                  fill="var(--color-foreground)"
                  fontSize={11}
                >
                  {formatValue(bar.value, isAnchor)}
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
              stroke="var(--color-foreground)"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeDasharray={c.dashed ? "4 3" : undefined}
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
            <WaterfallTooltipContent
              bar={tooltipData.bar}
              data={tooltipData.data}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}

export function WaterfallChart({ data }: { data: WaterfallData }) {
  // Dynamic height based on number of bars
  const barCount = useMemo(() => buildWaterfallBars(data).length, [data])
  const chartHeight = Math.max(300, barCount * 28)
  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ParentSize>
        {({ width, height }) => (
          <WaterfallChartInner
            data={data}
            width={width}
            height={height ?? chartHeight}
          />
        )}
      </ParentSize>
    </div>
  )
}
