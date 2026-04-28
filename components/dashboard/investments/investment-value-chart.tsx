"use client"

import { useState, useMemo, useId, useCallback } from "react"
import { createPortal } from "react-dom"
import { LinePath, AreaClosed } from "@visx/shape"
import { useApi } from "@/hooks/use-api"
import { useChartHeight } from "@/hooks/use-chart-height"
import { curveMonotoneX } from "@visx/curve"
import { scalePoint, scaleLinear } from "@visx/scale"
import { GridRows } from "@visx/grid"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { useTooltip } from "@visx/tooltip"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { sgdToDisplayAmount } from "@/lib/investments/display-currency"

interface DailyData {
  date: string
  value: number
}

interface InvestmentValueChartProps {
  readonly profileId?: string | null
  readonly familyId?: string | null
  readonly className?: string
  /** Live portfolio total from SWR-managed data; used for the headline
   *  number so it reflects intra-day mutations without waiting for the
   *  next cron snapshot. */
  readonly liveTotal?: number
  /** Optional breakdown matching portfolio total (listed + cash + ILP). */
  readonly breakdown?: {
    readonly holdingsLive: number
    readonly brokerageCash: number
    readonly ilpTotal: number
  }
}

interface SeriesPoint {
  date: string
  label: string
  /** Y value in selected display currency (for chart geometry). */
  value: number
  /** Original snapshot value in SGD (for tooltips). */
  valueSgd: number
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-SG", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const DAYS_OPTIONS = [30, 60, 90] as const

const MARGIN = { top: 6, bottom: 22, left: 0, right: 0 }
const X_PAD = 10
const MAX_X_TICKS = 5

function tickIndices(length: number, maxTicks: number): number[] {
  if (length === 0) return []
  if (length === 1) return [0]
  const cap = Math.min(maxTicks, length)
  const raw = Array.from({ length: cap }, (_, i) =>
    Math.round((i / (cap - 1)) * (length - 1)),
  )
  return [...new Set(raw)].sort((a, b) => a - b)
}

function ChartInner({
  data,
  width,
  height,
}: {
  readonly data: SeriesPoint[]
  readonly width: number
  readonly height: number
}) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const gradId = useId().replaceAll(":", "_")
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<{ index: number; point: SeriesPoint }>()

  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const indexDomain = useMemo(
    () => data.map((_, i) => String(i)),
    [data],
  )

  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: indexDomain,
        range: [X_PAD, innerWidth - X_PAD],
        padding: 0.5,
      }),
    [indexDomain, innerWidth],
  )

  const yScale = useMemo(() => {
    const values = data.map((d) => d.value)
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 0)
    const padding = (max - min) * 0.1 || 1
    return scaleLinear<number>({
      domain: [min - padding, max + padding],
      range: [innerHeight, 0],
    })
  }, [data, innerHeight])

  const xGetter = useCallback(
    (_d: SeriesPoint, i: number) =>
      (xScale(String(i)) ?? 0) + (xScale.step() ?? 0) / 2,
    [xScale],
  )

  const stroke =
    data.at(-1)!.value >= (data[0]?.value ?? 0)
      ? "var(--color-chart-positive)"
      : "var(--color-chart-negative)"

  const handleOverlayMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const x = e.nativeEvent.offsetX - MARGIN.left
      if (data.length === 0) return
      let nearest = 0
      let best = Infinity
      for (let i = 0; i < data.length; i++) {
        const px = xGetter(data[i], i)
        const dist = Math.abs(x - px)
        if (dist < best) {
          best = dist
          nearest = i
        }
      }
      showTooltip({
        tooltipData: { index: nearest, point: data[nearest] },
        tooltipLeft: e.clientX,
        tooltipTop: e.clientY,
      })
    },
    [data, showTooltip, xGetter],
  )

  if (data.length === 0 || width < 10) return null

  const xTicks = tickIndices(data.length, MAX_X_TICKS)
  const last = data.length - 1
  const lastX = xGetter(data[last], last)
  const lastY = yScale(data[last].value) ?? 0

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.35}
            strokeDasharray="3,6"
            numTicks={3}
            pointerEvents="none"
          />
          <AreaClosed<SeriesPoint>
            data={data}
            x={(d, i) => xGetter(d, i)}
            y={(d) => yScale(d.value) ?? 0}
            yScale={yScale}
            y0={() => innerHeight}
            curve={curveMonotoneX}
            fill={`url(#${gradId})`}
          />
          <LinePath<SeriesPoint>
            data={data}
            x={(d, i) => xGetter(d, i)}
            y={(d) => yScale(d.value) ?? 0}
            curve={curveMonotoneX}
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={lastX} cy={lastY} r={4} fill={stroke} stroke="var(--card)" strokeWidth={2} />
        </Group>
        <rect
          x={0}
          y={0}
          width={width}
          height={height - MARGIN.bottom + 4}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={handleOverlayMove}
          onMouseLeave={hideTooltip}
        />
        <Group left={MARGIN.left} top={height - MARGIN.bottom + 2}>
          {xTicks.map((i) => {
            const x = xGetter(data[i], i)
            return (
              <text
                key={`xtick-${data[i].label}-${i}`}
                x={x}
                y={14}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {data[i].label}
              </text>
            )
          })}
        </Group>
      </svg>
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={`${tooltipData.point.date}-${tooltipLeft}-${tooltipTop}`}
            role="tooltip"
            className="pointer-events-none z-[9999] max-w-[min(280px,calc(100vw-24px))] rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-lg"
            style={{
              position: "fixed",
              left: tooltipLeft,
              top: tooltipTop,
              transform: "translate(12px, 12px)",
            }}
          >
            <div className="font-medium text-foreground">
              {formatTooltipDate(tooltipData.point.date)}
            </div>
            <div className="mt-0.5 tabular-nums text-muted-foreground">
              {formatMoney(tooltipData.point.valueSgd)}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export function InvestmentValueChart({
  profileId,
  familyId,
  className = "",
  liveTotal,
  breakdown,
}: InvestmentValueChartProps) {
  const chartHeight = useChartHeight(192, 160)
  const { effectiveDisplayCurrency, sgdPerUsd, formatMoney } =
    useInvestmentsDisplayCurrency()
  const [days, setDays] = useState<30 | 60 | 90>(30)

  const historyKey = useMemo(() => {
    if (!profileId && !familyId) return null
    const params = new URLSearchParams()
    if (profileId) params.set("profileId", profileId)
    else if (familyId) params.set("familyId", familyId)
    params.set("days", String(days))
    return `/api/investments/history?${params}`
  }, [profileId, familyId, days])

  const { data: historyRaw, isLoading } = useApi<{ data: DailyData[] }>(
    historyKey,
  )
  const history = historyRaw?.data ?? []

  const series = useMemo(
    () =>
      history.map((d) => ({
        date: d.date,
        label: formatDateLabel(d.date),
        value: sgdToDisplayAmount(d.value, effectiveDisplayCurrency, sgdPerUsd),
        valueSgd: d.value,
      })),
    [history, effectiveDisplayCurrency, sgdPerUsd],
  )

  const latestValueSgd = liveTotal ?? (history.at(-1)!.value ?? 0)
  const firstValueSgd = history[0]?.value ?? 0
  const trend =
    firstValueSgd > 0
      ? ((latestValueSgd - firstValueSgd) / firstValueSgd) * 100
      : 0

  if (!profileId && !familyId) return null

  return (
    <div className={`rounded-xl border bg-card p-4 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Portfolio Value
          </h3>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {formatMoney(latestValueSgd)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Includes brokerage cash, listed holdings with live prices, and ILP
            fund values.
          </p>
          {breakdown && (
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <div className="flex justify-between gap-4 tabular-nums">
                <span>Listed holdings</span>
                <span>{formatMoney(breakdown.holdingsLive)}</span>
              </div>
              <div className="flex justify-between gap-4 tabular-nums">
                <span>Brokerage cash</span>
                <span>{formatMoney(breakdown.brokerageCash)}</span>
              </div>
              <div className="flex justify-between gap-4 tabular-nums">
                <span>ILP</span>
                <span>{formatMoney(breakdown.ilpTotal)}</span>
              </div>
            </div>
          )}
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
      {(() => {
        if (isLoading) {
          return (
        <div className="animate-pulse rounded-lg bg-muted" style={{ height: chartHeight }} />
          )
        }
        if (series.length > 0) {
          return (
        <div className="w-full" style={{ height: chartHeight }}>
          <ParentSize>
            {({ width, height }) => (
              <ChartInner
                data={series}
                width={width}
                height={height ?? chartHeight}
              />
            )}
          </ParentSize>
        </div>
          )
        }
        return (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No history yet. Daily snapshots will appear after the cron runs.
        </div>
        )
      })()}
    </div>
  )
}
