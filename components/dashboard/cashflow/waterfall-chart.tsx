"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const BAR_CATEGORY_GAP = 6

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

  // Inflow: Salary, Bonus, Income (manual), or single Inflow
  const { inflowBreakdown, inflowTotal } = data
  if (inflowBreakdown?.salary != null && inflowBreakdown.salary > 0) {
    bars.push({ name: "Salary", pv: cumulative, uv: inflowBreakdown.salary })
    cumulative += inflowBreakdown.salary
  }
  if (inflowBreakdown?.bonus != null && inflowBreakdown.bonus > 0) {
    bars.push({ name: "Bonus", pv: cumulative, uv: inflowBreakdown.bonus })
    cumulative += inflowBreakdown.bonus
  }
  if (inflowBreakdown?.income != null && inflowBreakdown.income > 0) {
    bars.push({ name: "Income", pv: cumulative, uv: inflowBreakdown.income })
    cumulative += inflowBreakdown.income
  }
  if (bars.length === 0 && inflowTotal > 0) {
    bars.push({ name: "Inflow", pv: cumulative, uv: inflowTotal })
    cumulative += inflowTotal
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
  index?: number
  chartData?: WaterfallBarItem[]
}

function WaterfallBarShape(props: WaterfallBarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload, index = 0, chartData } = props
  if (!payload) return null

  const fill = payload.uv >= 0 ? POSITIVE_FILL : NEGATIVE_FILL
  const connectorX = payload.uv >= 0 ? x + width : x

  const bar = (
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

  if (chartData && index < chartData.length - 1) {
    const nextY = y + height + BAR_CATEGORY_GAP
    const connector = (
      <line
        x1={connectorX}
        y1={y + height}
        x2={connectorX}
        y2={nextY}
        stroke="var(--color-chart-neutral)"
        strokeWidth={1}
      />
    )
    return (
      <g>
        {bar}
        {connector}
      </g>
    )
  }

  return bar
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
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
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
          shape={(props) => (
            <WaterfallBarShape {...props} chartData={chartData} />
          )}
          label={renderBarLabel}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
