"use client"

import { useCallback, useId, useMemo } from "react"
import { AreaClosed, LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { scalePoint, scaleLinear } from "@visx/scale"
import { GridRows } from "@visx/grid"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { AddIlpEntryDialog } from "@/components/dashboard/investments/add-ilp-entry-dialog"
import { DeleteIlpDialog } from "@/components/dashboard/investments/delete-ilp-dialog"
import { EditIlpDialog } from "@/components/dashboard/investments/edit-ilp-dialog"
import { formatIlpChartMonthLabel } from "@/lib/investments/ilp-chart"

/** `month` is YYYY-MM (stable sort key from `ilpEntryMonthKey`). */
interface MonthlyData {
  month: string
  value: number
}

interface IlpCardProps {
  productId?: string
  name: string
  fundValue: number
  totalPremiumsPaid: number
  /** Whether premiums total came from the latest monthly entry vs estimated. */
  premiumsSource: "entry" | "estimated"
  returnPct: number
  monthlyPremium: number
  endDate?: string
  /** Latest entry fields for edit dialog (fund / premiums / statement month). */
  latestEntryMonth: string | null
  latestEntryFundValue: number
  latestEntryPremiumsPaid: number | null
  monthlyData: MonthlyData[]
  onAddEntry?: () => void
  onEditSuccess?: () => void
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Same layout recipe as `InvestmentValueChart` `ChartInner`, scaled down. */
const ILP_SPARK_MARGIN = { top: 4, bottom: 15, left: 0, right: 0 }
const ILP_X_PAD = 6
const ILP_MAX_X_TICKS = 4

function ilpSparkTickIndices(length: number, maxTicks: number): number[] {
  if (length === 0) return []
  if (length === 1) return [0]
  const cap = Math.min(maxTicks, length)
  const raw = Array.from({ length: cap }, (_, i) =>
    Math.round((i / (cap - 1)) * (length - 1)),
  )
  return [...new Set(raw)].sort((a, b) => a - b)
}

interface IlpSparkPoint {
  month: string
  label: string
  value: number
}

function IlpLineChart({ data, width, height }: { data: MonthlyData[]; width: number; height: number }) {
  const gradId = useId().replace(/:/g, "_")
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<{ index: number; point: IlpSparkPoint }>()

  const series = useMemo<IlpSparkPoint[]>(
    () =>
      data.map((d) => ({
        month: d.month,
        label: formatIlpChartMonthLabel(d.month),
        value: d.value,
      })),
    [data],
  )

  const innerWidth = width - ILP_SPARK_MARGIN.left - ILP_SPARK_MARGIN.right
  const innerHeight = height - ILP_SPARK_MARGIN.top - ILP_SPARK_MARGIN.bottom

  const indexDomain = useMemo(() => series.map((_, i) => String(i)), [series])

  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: indexDomain,
        range: [ILP_X_PAD, innerWidth - ILP_X_PAD],
        padding: 0.5,
      }),
    [indexDomain, innerWidth],
  )

  const yScale = useMemo(() => {
    const values = series.map((d) => d.value)
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 0)
    const padding = (max - min) * 0.1 || Math.max(max * 0.02, 1)
    return scaleLinear<number>({
      domain: [min - padding, max + padding],
      range: [innerHeight, 0],
    })
  }, [series, innerHeight])

  const xGetter = useCallback(
    (_d: IlpSparkPoint, i: number) => (xScale(String(i)) ?? 0) + (xScale.step() ?? 0) / 2,
    [xScale],
  )

  const stroke =
    series.length > 0 && (series[series.length - 1].value >= (series[0]?.value ?? 0))
      ? "var(--color-chart-positive)"
      : "var(--color-chart-negative)"

  const handleOverlayMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const x = e.nativeEvent.offsetX - ILP_SPARK_MARGIN.left
      if (series.length === 0) return
      let nearest = 0
      let best = Infinity
      for (let i = 0; i < series.length; i++) {
        const px = xGetter(series[i], i)
        const dist = Math.abs(x - px)
        if (dist < best) {
          best = dist
          nearest = i
        }
      }
      showTooltip({
        tooltipData: { index: nearest, point: series[nearest] },
        tooltipLeft: e.clientX,
        tooltipTop: e.clientY,
      })
    },
    [series, showTooltip, xGetter],
  )

  if (series.length === 0 || width < 10) return null

  const last = series.length - 1
  const lastX = xGetter(series[last], last)
  const lastY = yScale(series[last].value) ?? 0
  const xTicks = ilpSparkTickIndices(series.length, ILP_MAX_X_TICKS)

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Group left={ILP_SPARK_MARGIN.left} top={ILP_SPARK_MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.35}
            strokeDasharray="3,6"
            numTicks={3}
            pointerEvents="none"
          />
          <AreaClosed<IlpSparkPoint>
            data={series}
            x={(d, i) => xGetter(d, i)}
            y={(d) => yScale(d.value) ?? 0}
            yScale={yScale}
            y0={() => innerHeight}
            curve={curveMonotoneX}
            fill={`url(#${gradId})`}
          />
          <LinePath<IlpSparkPoint>
            data={series}
            x={(d, i) => xGetter(d, i)}
            y={(d) => yScale(d.value) ?? 0}
            curve={curveMonotoneX}
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={lastX} cy={lastY} r={3.5} fill={stroke} stroke="var(--card)" strokeWidth={2} />
        </Group>
        <rect
          x={0}
          y={0}
          width={width}
          height={height - ILP_SPARK_MARGIN.bottom + 2}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={handleOverlayMove}
          onMouseLeave={hideTooltip}
        />
        <Group left={ILP_SPARK_MARGIN.left} top={height - ILP_SPARK_MARGIN.bottom + 1}>
          {xTicks.map((i) => {
            const x = xGetter(series[i], i)
            return (
              <text
                key={series[i].month}
                x={x}
                y={11}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {series[i].label}
              </text>
            )
          })}
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.point.month}-${tooltipLeft}-${tooltipTop}`}
          top={tooltipTop}
          left={tooltipLeft}
          className="pointer-events-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-md"
          style={{ transform: "translate(12px, 12px)" }}
        >
          <div className="font-medium text-foreground">{tooltipData.point.label}</div>
          <div className="mt-0.5 tabular-nums text-muted-foreground">${fmt(tooltipData.point.value)}</div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

export function IlpCard({
  productId,
  name,
  fundValue,
  totalPremiumsPaid,
  premiumsSource,
  returnPct,
  monthlyPremium,
  endDate,
  latestEntryMonth,
  latestEntryFundValue,
  latestEntryPremiumsPaid,
  monthlyData,
  onAddEntry,
  onEditSuccess,
}: IlpCardProps) {
  return (
    <Card className="h-[200px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-base font-bold">{name}</CardTitle>
        {productId && (
          <div className="flex items-center gap-1">
            <EditIlpDialog
              productId={productId}
              productName={name}
              monthlyPremium={monthlyPremium}
              endDate={endDate ?? ""}
              latestEntryMonth={latestEntryMonth}
              latestEntryFundValue={latestEntryFundValue}
              latestEntryPremiumsPaid={latestEntryPremiumsPaid}
              onSuccess={onEditSuccess ?? onAddEntry}
            />
            <AddIlpEntryDialog
              productId={productId}
              productName={name}
              onSuccess={onAddEntry}
            />
            <DeleteIlpDialog
              productId={productId}
              productName={name}
              onSuccess={onEditSuccess ?? onAddEntry}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fund Value</span>
            <span className="font-medium">${fmt(fundValue)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground shrink-0">
              Premiums Paid
              <span className="ml-1 font-normal text-xs opacity-70">
                {premiumsSource === "entry" ? "(statement)" : "(est.)"}
              </span>
            </span>
            <span className="font-medium tabular-nums">${fmt(totalPremiumsPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Return</span>
            <span
              className={cn(
                "font-medium",
                returnPct >= 0 ? "text-emerald-500" : "text-red-500",
              )}
            >
              {returnPct >= 0 ? "+" : ""}
              {fmt(returnPct)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly Premium</span>
            <span className="font-medium">${fmt(monthlyPremium)}</span>
          </div>
        </div>
        <div className="h-[5.5rem] min-w-[7.5rem] max-w-[10rem] shrink-0 self-center">
          <ParentSize debounceTime={10}>
            {({ width, height }) => (
              <IlpLineChart
                data={monthlyData}
                width={width}
                height={height ?? 88}
              />
            )}
          </ParentSize>
        </div>
      </CardContent>
    </Card>
  )
}
