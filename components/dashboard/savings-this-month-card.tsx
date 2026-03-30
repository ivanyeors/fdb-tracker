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

interface SavingsThisMonthCardProps {
  savingsThisMonth: number
  trend: number
  savingsHistory: MonthlyData[]
  latestMonth?: string | null
  loading?: boolean
  noData?: boolean
}

const monthLabels: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
}

function formatMonthLabel(monthStr: string): string {
  const parts = monthStr.split("-")
  const month = parts[1] ?? ""
  const year = parts[0] ?? ""
  return `${monthLabels[month] ?? month} ${year}`
}

function SavingsLineChart({
  data,
  width,
  height,
}: {
  data: MonthlyData[]
  width: number
  height: number
}) {
  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: data.map((d) => d.month),
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
    data[data.length - 1]?.value >= 0
      ? "var(--color-chart-positive)"
      : "var(--color-chart-negative)"

  return (
    <svg width={width} height={height}>
      <Group>
        <LinePath<MonthlyData>
          data={data}
          x={(d) => (xScale(d.month) ?? 0) + (xScale.step() ?? 0) / 2}
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

export function SavingsThisMonthCard({
  savingsThisMonth,
  trend,
  savingsHistory,
  loading = false,
  noData = false,
}: SavingsThisMonthCardProps) {
  const chartData = useMemo(() => {
    return savingsHistory.map((d) => ({
      month: formatMonthLabel(d.month),
      value: d.value,
    }))
  }, [savingsHistory])

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="mb-3 h-4 w-32" />
          <Skeleton className="h-8 w-40" />
        </CardContent>
      </Card>
    )
  }

  if (noData) {
    return (
      <Card className="border-dashed opacity-60">
        <CardContent className="flex min-h-[120px] flex-col items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No savings data for this month
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-muted-foreground">Savings this month</p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate text-2xl font-bold tracking-tight">
                ${formatCurrency(savingsThisMonth)}
              </span>
              {trend !== 0 && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-sm font-medium",
                    trend >= 0 ? "text-emerald-500" : "text-red-500",
                  )}
                >
                  {trend >= 0 ? (
                    <ArrowUp className="size-4" />
                  ) : (
                    <ArrowDown className="size-4" />
                  )}
                  {Math.abs(trend).toFixed(1)}% vs last month
                </span>
              )}
            </div>
          </div>
          <CardCTA href="/dashboard/cashflow">View cashflow</CardCTA>
        </div>
        {chartData.length > 0 && (
          <div className="h-12 min-w-0 shrink-0 sm:h-14 sm:w-[140px]">
            <ParentSize>
              {({ width, height }) => (
                <SavingsLineChart
                  data={chartData}
                  width={width}
                  height={height ?? 48}
                />
              )}
            </ParentSize>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
