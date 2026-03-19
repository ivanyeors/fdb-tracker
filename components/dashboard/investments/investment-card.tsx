"use client"

import { useMemo } from "react"
import { ArrowUp, ArrowDown } from "lucide-react"
import { LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { scalePoint, scaleLinear } from "@visx/scale"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { Card, CardContent, CardCTA } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, cn } from "@/lib/utils"

interface MonthlyData {
  month: string
  value: number
}

interface DailyData {
  date: string
  value: number
}

interface InvestmentCardProps {
  totalValue: number
  trend: number
  monthlyData: MonthlyData[]
  dailyData?: DailyData[]
  loading?: boolean
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function InvestmentLineChart({
  data,
  width,
  height,
}: {
  data: { label: string; value: number }[]
  width: number
  height: number
}) {
  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: data.map((d) => d.label),
        range: [0, width],
        padding: 0.5,
      }),
    [data, width],
  )

  const yScale = useMemo(() => {
    const values = data.map((d) => d.value)
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 0)
    const padding = (max - min) * 0.1 || 1
    return scaleLinear<number>({
      domain: [min - padding, max + padding],
      range: [height, 0],
    })
  }, [data, height])

  if (data.length === 0 || width < 10) return null

  const stroke =
    data[data.length - 1]?.value >= (data[0]?.value ?? 0)
      ? "var(--color-chart-positive)"
      : "var(--color-chart-negative)"

  return (
    <svg width={width} height={height}>
      <Group>
        <LinePath<{ label: string; value: number }>
          data={data}
          x={(d) => (xScale(d.label) ?? 0) + (xScale.step() ?? 0) / 2}
          y={(d) => yScale(d.value) ?? 0}
          curve={curveMonotoneX}
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Group>
    </svg>
  )
}

export function InvestmentCard({
  totalValue,
  trend,
  monthlyData,
  dailyData,
  loading = false,
}: InvestmentCardProps) {
  const chartData = useMemo(() => {
    if (dailyData && dailyData.length > 0) {
      return dailyData.map((d) => ({
        label: formatDateLabel(d.date),
        value: d.value,
      }))
    }
    if (monthlyData.length > 0) {
      return monthlyData.map((d) => ({ label: d.month, value: d.value }))
    }
    return []
  }, [dailyData, monthlyData])

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <p className="text-sm text-muted-foreground">Investments</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            ${formatCurrency(totalValue)}
          </p>
          {trend !== 0 && (
            <div className="mt-1 flex items-center gap-1 text-sm">
              {trend >= 0 ? (
                <ArrowUp className="size-4 text-emerald-500" />
              ) : (
                <ArrowDown className="size-4 text-red-500" />
              )}
              <span
                className={cn(
                  "font-medium",
                  trend >= 0 ? "text-emerald-500" : "text-red-500",
                )}
              >
                {trend >= 0 ? "+" : ""}
                {trend.toFixed(1)}%
              </span>
              <span className="text-muted-foreground">vs last month</span>
            </div>
          )}
          {chartData.length > 0 && (
            <div className="mt-2 h-16 w-full min-w-0">
              <ParentSize>
                {({ width, height }) => (
                  <InvestmentLineChart
                    data={chartData}
                    width={width}
                    height={height ?? 64}
                  />
                )}
              </ParentSize>
            </div>
          )}
        </div>
        <CardCTA href="/dashboard/investments">View all</CardCTA>
      </CardContent>
    </Card>
  )
}
