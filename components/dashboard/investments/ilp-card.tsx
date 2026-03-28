"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { AreaClosed, Bar, LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { scaleBand, scalePoint, scaleLinear } from "@visx/scale"
import { GridRows } from "@visx/grid"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { Card, CardContent, CardCTA, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AddIlpEntryDialog } from "@/components/dashboard/investments/add-ilp-entry-dialog"
import { DeleteIlpDialog } from "@/components/dashboard/investments/delete-ilp-dialog"
import { EditIlpDialog } from "@/components/dashboard/investments/edit-ilp-dialog"
import { IlpFundReportPanel } from "@/components/dashboard/investments/ilp-fund-report-panel"
import { formatIlpChartMonthLabel } from "@/lib/investments/ilp-chart"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { sgdToDisplayAmount } from "@/lib/investments/display-currency"

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
  premiumPaymentMode?: "monthly" | "one_time"
  /** Group lump budget when mode is one-time and product is grouped (optional display). */
  groupPremiumAmount?: number | null
  endDate?: string
  /** Latest entry fields for edit dialog (fund / premiums / statement month). */
  latestEntryMonth: string | null
  latestEntryFundValue: number
  latestEntryPremiumsPaid: number | null
  monthlyData: MonthlyData[]
  onAddEntry?: () => void
  onEditSuccess?: () => void
  /** Overview: match `InvestmentCard` layout; hide edit/add/delete (use Investments → ILP tab). */
  variant?: "default" | "summary"
  /** Latest imported fund report snapshot (jsonb), if any. */
  fundReportSnapshot?: Record<string, unknown> | null
  /** Share of fund group portfolio (read-only; configured in Setup). */
  groupAllocationPct?: number | null
  /** When false, hide “Add monthly value” (e.g. grouped funds use group editor). */
  showAddMonthlyEntry?: boolean
  /** When false, hide delete (e.g. delete only from group editor). */
  showDeleteProduct?: boolean
  /** Multi-select on Investments → ILP tab (bulk delete). */
  selection?: { selected: boolean; onToggle: () => void }
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
  valueSgd: number
}

/** Same stroke and geometry as `InvestmentLineChart` in `investment-card.tsx`. */
function IlpInvestmentStyleSparkline({
  data,
  width,
  height,
}: {
  data: MonthlyData[]
  width: number
  height: number
}) {
  const { effectiveDisplayCurrency, sgdPerUsd } = useInvestmentsDisplayCurrency()
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        label: d.month,
        value: sgdToDisplayAmount(d.value, effectiveDisplayCurrency, sgdPerUsd),
      })),
    [data, effectiveDisplayCurrency, sgdPerUsd],
  )

  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: chartData.map((d) => d.label),
        range: [0, width],
        padding: 0.5,
      }),
    [chartData, width],
  )

  const yScale = useMemo(() => {
    const values = chartData.map((d) => d.value)
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 0)
    const padding = (max - min) * 0.1 || 1
    return scaleLinear<number>({
      domain: [min - padding, max + padding],
      range: [height, 0],
    })
  }, [chartData, height])

  if (chartData.length === 0 || width < 10) return null

  const stroke =
    chartData[chartData.length - 1]?.value >= (chartData[0]?.value ?? 0)
      ? "var(--color-chart-positive)"
      : "var(--color-chart-negative)"

  return (
    <svg width={width} height={height}>
      <Group>
        <LinePath<{ label: string; value: number }>
          data={chartData}
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

function IlpDetailedLineChart({
  data,
  width,
  height,
}: {
  data: MonthlyData[]
  width: number
  height: number
}) {
  const { effectiveDisplayCurrency, sgdPerUsd, formatMoney } =
    useInvestmentsDisplayCurrency()
  const gradId = useId().replace(/:/g, "_")
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<{ index: number; point: IlpSparkPoint }>()

  const series = useMemo<IlpSparkPoint[]>(
    () =>
      data.map((d) => ({
        month: d.month,
        label: formatIlpChartMonthLabel(d.month),
        value: sgdToDisplayAmount(d.value, effectiveDisplayCurrency, sgdPerUsd),
        valueSgd: d.value,
      })),
    [data, effectiveDisplayCurrency, sgdPerUsd],
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
      const container = e.currentTarget.ownerSVGElement?.parentElement
      if (!container) return
      const bounds = container.getBoundingClientRect()
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
        tooltipLeft: e.clientX - bounds.left,
        tooltipTop: e.clientY - bounds.top,
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
          offsetLeft={12}
          offsetTop={12}
          className="pointer-events-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-md"
        >
          <div className="font-medium text-foreground">{tooltipData.point.label}</div>
          <div className="mt-0.5 tabular-nums text-muted-foreground">
            {formatMoney(tooltipData.point.valueSgd)}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

function IlpLineChart({
  data,
  width,
  height,
  style = "area",
}: {
  data: MonthlyData[]
  width: number
  height: number
  /** `investment` matches `InvestmentCard` sparkline (line only, no fill/grid/axis). */
  style?: "area" | "investment"
}) {
  if (style === "investment") {
    return <IlpInvestmentStyleSparkline data={data} width={width} height={height} />
  }
  return <IlpDetailedLineChart data={data} width={width} height={height} />
}

const HBAR_MARGIN = { top: 0, bottom: 0, left: 0, right: 0 }
const HBAR_LABEL_WIDTH = 90
const HBAR_VALUE_PAD = 8

function IlpInvestedVsValueBar({
  invested,
  currentValue,
  formatMoney,
  width,
  height,
}: {
  invested: number
  currentValue: number
  formatMoney: (v: number) => string
  width: number
  height: number
}) {
  const innerWidth = width - HBAR_MARGIN.left - HBAR_MARGIN.right
  const innerHeight = height - HBAR_MARGIN.top - HBAR_MARGIN.bottom

  const data = [
    { key: "invested", label: "Invested", value: invested },
    { key: "current", label: "Current", value: currentValue },
  ]

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.key),
        range: [0, innerHeight],
        padding: 0.3,
      }),
    [innerHeight],
  )

  const barAreaWidth = innerWidth - HBAR_LABEL_WIDTH

  const xScale = useMemo(() => {
    const max = Math.max(invested, currentValue, 1)
    return scaleLinear<number>({
      domain: [0, max * 1.05],
      range: [0, barAreaWidth],
    })
  }, [invested, currentValue, barAreaWidth])

  if (width < 10) return null

  const gain = currentValue >= invested

  return (
    <svg width={width} height={height}>
      <Group left={HBAR_MARGIN.left} top={HBAR_MARGIN.top}>
        {data.map((d) => {
          const barY = yScale(d.key) ?? 0
          const barH = yScale.bandwidth()
          const barW = Math.max(xScale(d.value) ?? 0, 0)
          const fill =
            d.key === "invested"
              ? "var(--color-muted-foreground)"
              : gain
                ? "var(--color-chart-positive)"
                : "var(--color-chart-negative)"
          const valueText = formatMoney(d.value)
          const valueFitsInside = barW > 80
          return (
            <g key={d.key}>
              {/* Row label */}
              <text
                x={0}
                y={barY + barH / 2}
                dominantBaseline="central"
                className="fill-muted-foreground text-[11px]"
              >
                {d.label}
              </text>
              {/* Bar */}
              <Bar
                x={HBAR_LABEL_WIDTH}
                y={barY}
                width={barW}
                height={barH}
                fill={fill}
                rx={4}
                opacity={d.key === "invested" ? 0.35 : 0.85}
              />
              {/* Value label */}
              <text
                x={
                  valueFitsInside
                    ? HBAR_LABEL_WIDTH + barW - HBAR_VALUE_PAD
                    : HBAR_LABEL_WIDTH + barW + HBAR_VALUE_PAD
                }
                y={barY + barH / 2}
                dominantBaseline="central"
                textAnchor={valueFitsInside ? "end" : "start"}
                className={cn(
                  "text-[11px] font-medium",
                  valueFitsInside ? "fill-card" : "fill-foreground",
                )}
              >
                {valueText}
              </text>
            </g>
          )
        })}
      </Group>
    </svg>
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
  premiumPaymentMode = "monthly",
  groupPremiumAmount = null,
  endDate,
  latestEntryMonth,
  latestEntryFundValue,
  latestEntryPremiumsPaid,
  monthlyData,
  onAddEntry,
  onEditSuccess,
  variant = "default",
  fundReportSnapshot = null,
  groupAllocationPct = null,
  showAddMonthlyEntry = true,
  showDeleteProduct = true,
  selection,
}: IlpCardProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const [editOpen, setEditOpen] = useState(false)

  const premiumLineLabel =
    premiumPaymentMode === "one_time" ? "One-time premium" : "Monthly premium"
  const premiumLineAmount =
    premiumPaymentMode === "one_time" &&
    groupPremiumAmount != null &&
    Number.isFinite(Number(groupPremiumAmount))
      ? Number(groupPremiumAmount)
      : monthlyPremium

  if (variant === "summary") {
    return (
      <Card>
        <CardContent>
          <div className="flex flex-1 flex-col">
            <p className="truncate text-sm text-muted-foreground">{name}</p>
            <p className="mt-1 truncate text-2xl font-bold tracking-tight">
              {formatMoney(fundValue)}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              Premiums {formatMoney(totalPremiumsPaid)}
              <span className="opacity-70">
                {" "}
                ({premiumsSource === "entry" ? "statement" : "est."})
              </span>
              <span className="mx-1">·</span>
              <span>
                {premiumPaymentMode === "one_time" ? "One-time" : "Monthly"}{" "}
                {formatMoney(premiumLineAmount)}
              </span>
            </p>
            <div className="mt-1 flex items-center gap-1 text-sm">
              {returnPct >= 0 ? (
                <ArrowUp className="size-4 text-emerald-500" />
              ) : (
                <ArrowDown className="size-4 text-red-500" />
              )}
              <span
                className={cn(
                  "font-medium",
                  returnPct >= 0 ? "text-emerald-500" : "text-red-500",
                )}
              >
                {returnPct >= 0 ? "+" : ""}
                {fmt(returnPct)}%
              </span>
              <span className="text-muted-foreground">return</span>
            </div>
            {monthlyData.length > 0 && (
              <div className="mt-2 h-16 w-full min-w-0">
                <ParentSize debounceTime={10}>
                  {({ width, height }) => (
                    <IlpLineChart
                      data={monthlyData}
                      width={width}
                      height={height ?? 64}
                      style="investment"
                    />
                  )}
                </ParentSize>
              </div>
            )}
            {(fundValue > 0 || totalPremiumsPaid > 0) && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Invested vs Current Value
                </p>
                <div className="h-14 w-full min-w-0">
                  <ParentSize debounceTime={10}>
                    {({ width, height }) => (
                      <IlpInvestedVsValueBar
                        invested={totalPremiumsPaid}
                        currentValue={fundValue}
                        formatMoney={formatMoney}
                        width={width}
                        height={height ?? 56}
                      />
                    )}
                  </ParentSize>
                </div>
              </div>
            )}
          </div>
          <CardCTA href="/dashboard/investments?tab=ilp">View in Investments</CardCTA>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "h-auto overflow-visible",
        selection?.selected && "ring-2 ring-ring/60",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-0">
        <div className="flex min-w-0 flex-1 items-start gap-2 pr-2">
          {selection ? (
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 rounded border border-input accent-primary"
              checked={selection.selected}
              onChange={() => selection.onToggle()}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${name}`}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base font-bold leading-tight">{name}</CardTitle>
            {groupAllocationPct != null && Number.isFinite(groupAllocationPct) ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Group allocation: {fmt(groupAllocationPct)}% of group
              </p>
            ) : null}
          </div>
        </div>
        {productId && (
          <div className="flex shrink-0 items-center gap-1">
            <EditIlpDialog
              productId={productId}
              productName={name}
              monthlyPremium={monthlyPremium}
              premiumPaymentMode={premiumPaymentMode}
              endDate={endDate ?? ""}
              latestEntryMonth={latestEntryMonth}
              latestEntryFundValue={latestEntryFundValue}
              latestEntryPremiumsPaid={latestEntryPremiumsPaid}
              onSuccess={onEditSuccess ?? onAddEntry}
              open={editOpen}
              onOpenChange={setEditOpen}
            />
            {showAddMonthlyEntry ? (
              <AddIlpEntryDialog
                productId={productId}
                productName={name}
                onSuccess={onAddEntry}
              />
            ) : null}
            {showDeleteProduct ? (
              <DeleteIlpDialog
                productId={productId}
                productName={name}
                onSuccess={onEditSuccess ?? onAddEntry}
              />
            ) : null}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-none gap-3">
        <div className="flex min-w-0 flex-col gap-1.5 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground">Fund Value</span>
            <div className="flex flex-col items-end gap-1">
              <span className="font-medium">{formatMoney(fundValue)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditOpen(true)}
              >
                Update fund value
              </Button>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground shrink-0">
              Premiums Paid
              <span className="ml-1 font-normal text-xs opacity-70">
                {premiumsSource === "entry" ? "(statement)" : "(est.)"}
              </span>
            </span>
            <span className="font-medium tabular-nums">
              {formatMoney(totalPremiumsPaid)}
            </span>
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
            <span className="text-muted-foreground">{premiumLineLabel}</span>
            <span className="font-medium">{formatMoney(premiumLineAmount)}</span>
          </div>
        </div>
      </CardContent>
      {fundReportSnapshot ? (
        <CardContent className="flex-none pt-0">
          <IlpFundReportPanel snapshot={fundReportSnapshot} />
        </CardContent>
      ) : null}
      {(fundValue > 0 || totalPremiumsPaid > 0) ? (
        <CardContent className="flex-none border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Invested vs Current Value
          </p>
          <div className="h-28 w-full min-w-0 sm:h-32">
            <ParentSize debounceTime={10}>
              {({ width, height }) => (
                <IlpInvestedVsValueBar
                  invested={totalPremiumsPaid}
                  currentValue={fundValue}
                  formatMoney={formatMoney}
                  width={width}
                  height={height ?? 120}
                />
              )}
            </ParentSize>
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
