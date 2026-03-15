"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

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
  pv: number
  uv: number
}

function buildWaterfallBars(data: WaterfallData): WaterfallBarItem[] {
  const bars: WaterfallBarItem[] = []
  let cumulative = 0

  // Top bar: Total Inflow (single bar for full inflow amount)
  if (data.inflowTotal > 0) {
    bars.push({ name: "Total Inflow", pv: 0, uv: data.inflowTotal })
    cumulative = data.inflowTotal
  }

  // Outflow categories (display as "Spending" not "Discretionary")
  const { discretionary, insurance, ilp, loans, tax } = data.outflowBreakdown
  if (discretionary > 0) {
    bars.push({ name: "Spending", pv: cumulative, uv: -discretionary })
    cumulative -= discretionary
  }
  if (insurance > 0) {
    bars.push({ name: "Insurance", pv: cumulative, uv: -insurance })
    cumulative -= insurance
  }
  if (ilp > 0) {
    bars.push({ name: "ILP", pv: cumulative, uv: -ilp })
    cumulative -= ilp
  }
  if (loans > 0) {
    bars.push({ name: "Loans", pv: cumulative, uv: -loans })
    cumulative -= loans
  }
  if (tax > 0) {
    bars.push({ name: "Tax", pv: cumulative, uv: -tax })
    cumulative -= tax
  }

  // Net Savings
  bars.push({
    name: "Net Savings",
    pv: 0,
    uv: data.netSavings,
  })

  return bars
}

const POSITIVE_FILL = "var(--color-chart-positive)"
const NEGATIVE_FILL = "var(--color-chart-negative)"

type WaterfallBarShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: WaterfallBarItem
}

function WaterfallBarShape(props: WaterfallBarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props
  if (!payload) return null

  const fill = payload.uv >= 0 ? POSITIVE_FILL : NEGATIVE_FILL

  return (
    <rect
      x={x}
      y={y}
      width={Math.max(width, 2)}
      height={Math.max(height, 2)}
      fill={fill}
      rx={2}
      ry={2}
    />
  )
}

function renderBarLabel(props: {
  payload?: { uv?: number }
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
}) {
  const { payload: p, x = 0, y = 0, width = 0, height = 0 } = props
  const nx = Number(x)
  const ny = Number(y)
  const nw = Number(width)
  const nh = Number(height)
  const value = p?.uv ?? 0
  const formatted = `${value >= 0 ? "+" : ""}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const textX = value >= 0 ? nx + nw + 6 : nx - 6
  const textAnchor = value >= 0 ? "start" : "end"
  return (
    <text
      x={textX}
      y={ny + nh / 2}
      textAnchor={textAnchor}
      dominantBaseline="middle"
      fill="var(--color-foreground)"
      fontSize={12}
    >
      {formatted}
    </text>
  )
}

export function WaterfallChart({ data }: { data: WaterfallData }) {
  const chartData = useMemo(() => buildWaterfallBars(data), [data])

  const domain = useMemo(() => {
    if (chartData.length === 0) return [0, 0] as [number, number]
    const values = chartData.map((d) => d.pv + d.uv)
    const minVal = Math.min(0, ...values)
    const maxVal = Math.max(0, ...values)
    return [minVal, maxVal] as [number, number]
  }, [chartData])

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
        No data to display
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 72, left: 8, bottom: 8 }}
        layout="vertical"
        barCategoryGap={4}
      >
        <XAxis type="number" hide domain={domain} />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          formatter={(value) => [`$${Math.abs(Number(value ?? 0)).toLocaleString()}`, ""]}
          contentStyle={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
          }}
          labelFormatter={(label) => label}
        />
        <Bar dataKey="pv" stackId="a" fill="transparent" hide />
        <Bar
          dataKey="uv"
          stackId="a"
          minPointSize={2}
          shape={(props) => <WaterfallBarShape {...props} />}
          label={renderBarLabel}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
