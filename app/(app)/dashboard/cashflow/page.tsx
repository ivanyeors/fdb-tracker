"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"

const mockCashflow = [
  { month: "Jan", inflow: 5600, discretionary: 2600, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Feb", inflow: 5600, discretionary: 2400, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Mar", inflow: 5600, discretionary: 2700, insurance: 200, ilp: 500, loans: 1500, tax: 800 },
  { month: "Apr", inflow: 5600, discretionary: 2500, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "May", inflow: 5600, discretionary: 2900, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Jun", inflow: 5600, discretionary: 2300, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Jul", inflow: 5600, discretionary: 2800, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Aug", inflow: 5600, discretionary: 2650, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Sep", inflow: 5600, discretionary: 2700, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Oct", inflow: 5600, discretionary: 2550, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Nov", inflow: 5600, discretionary: 2800, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
  { month: "Dec", inflow: 5600, discretionary: 2800, insurance: 200, ilp: 500, loans: 1500, tax: 0 },
]

const currentMonth = {
  inflow: 5600,
  discretionary: 2800,
  insurance: 200,
  ilp: 500,
  loans: 1500,
  tax: 0,
}
const netSavings =
  currentMonth.inflow -
  currentMonth.discretionary -
  currentMonth.insurance -
  currentMonth.ilp -
  currentMonth.loans -
  currentMonth.tax

export default function CashflowPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Cashflow"
        description="Monthly inflow vs outflow breakdown."
      />

      <Card>
        <CardHeader>
          <CardTitle>12-Month Cashflow</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={mockCashflow}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                formatter={(v, name) => [
                  `$${Number(v).toLocaleString()}`,
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar
                dataKey="discretionary"
                name="Discretionary"
                stackId="outflow"
                fill="var(--color-chart-1)"
              />
              <Bar
                dataKey="insurance"
                name="Insurance"
                stackId="outflow"
                fill="var(--color-chart-2)"
              />
              <Bar
                dataKey="ilp"
                name="ILP"
                stackId="outflow"
                fill="var(--color-chart-3)"
              />
              <Bar
                dataKey="loans"
                name="Loans"
                stackId="outflow"
                fill="var(--color-chart-4)"
              />
              <Bar
                dataKey="tax"
                name="Tax"
                stackId="outflow"
                fill="var(--color-chart-5)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="inflow"
                name="Inflow"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Inflow" value="5,600" prefix="$" />
        <MetricCard label="Discretionary" value="2,800" prefix="$" />
        <MetricCard label="Insurance" value="200" prefix="$" />
        <MetricCard label="ILP" value="500" prefix="$" />
        <MetricCard label="Loans" value="1,500" prefix="$" />
        <MetricCard label="Net Savings" value={netSavings.toLocaleString()} prefix="$" />
      </div>

      <MetricCard
        label="Savings Rate"
        value={Math.round((netSavings / currentMonth.inflow) * 100)}
        suffix="%"
        tooltipId="SAVINGS_RATE"
      />
    </div>
  )
}
