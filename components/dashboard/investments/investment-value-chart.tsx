"use client"

import { useState, useEffect, useMemo } from "react"
import { LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { scalePoint, scaleLinear } from "@visx/scale"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { formatCurrency } from "@/lib/utils"

interface DailyData {
  date: string
  value: number
}

interface InvestmentValueChartProps {
  profileId?: string | null
  familyId?: string | null
  className?: string
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const DAYS_OPTIONS = [30, 60, 90] as const

function ChartInner({
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

export function InvestmentValueChart({
  profileId,
  familyId,
  className = "",
}: InvestmentValueChartProps) {
  const [days, setDays] = useState<30 | 60 | 90>(30)
  const [history, setHistory] = useState<DailyData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!profileId && !familyId) {
      setHistory([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const params = new URLSearchParams()
    if (profileId) params.set("profileId", profileId)
    else if (familyId) params.set("familyId", familyId)

    fetch(`/api/investments/history?days=${days}&${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) setHistory(json.data)
        else setHistory([])
      })
      .catch(() => setHistory([]))
      .finally(() => setIsLoading(false))
  }, [profileId, familyId, days])

  const chartData = useMemo(
    () =>
      history.map((d) => ({
        label: formatDateLabel(d.date),
        value: d.value,
      })),
    [history],
  )

  const latestValue = history[history.length - 1]?.value ?? 0
  const firstValue = history[0]?.value ?? 0
  const trend =
    firstValue > 0 ? ((latestValue - firstValue) / firstValue) * 100 : 0

  if (!profileId && !familyId) return null

  return (
    <div className={`rounded-xl border bg-card p-4 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Portfolio Value
          </h3>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            ${formatCurrency(latestValue)}
          </p>
          {trend !== 0 && (
            <p
              className={`mt-0.5 text-sm font-medium ${
                trend >= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {trend >= 0 ? "+" : ""}
              {trend.toFixed(1)}% over period
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : chartData.length > 0 ? (
        <div className="h-48 w-full">
          <ParentSize>
            {({ width, height }) => (
              <ChartInner
                data={chartData}
                width={width}
                height={height ?? 192}
              />
            )}
          </ParentSize>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No history yet. Daily snapshots will appear after the cron runs.
        </div>
      )}
    </div>
  )
}
