"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Pie } from "@visx/shape"
import { useIsMobile } from "@/hooks/use-mobile"
import { Group } from "@visx/group"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { createCategoryColorScale } from "@/lib/chart-colors"

interface AllocationData {
  name: string
  value: number
  percentage: number
}

interface AllocationChartProps {
  readonly data: AllocationData[]
  readonly title?: string
  /** If set, only this many rows are shown in the legend (data should be pre-sorted by value). */
  readonly legendMaxItems?: number
  /** Outer container height for ParentSize (default 280). */
  readonly height?: number
  /** Label above center amount (default "Total"). */
  readonly centerLabel?: string
  /** Muted line below center amount (e.g. portfolio context). */
  readonly centerSubtitle?: string
  /** `beside`: donut and legend side by side when container width &gt;= `legendBesideMinWidth`. */
  readonly legendLayout?: "below" | "beside"
  /** Min width (px) to use beside layout and sizing (default 320; use ~260 for narrow cards). */
  readonly legendBesideMinWidth?: number
}

function AllocationChartInner({
  data,
  title,
  legendMaxItems,
  centerLabel = "Total",
  centerSubtitle,
  legendLayout = "below",
  legendBesideMinWidth = 320,
  width,
  height,
  mobileStacked,
}: AllocationChartProps & { readonly width: number; readonly height: number; readonly mobileStacked?: boolean }) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<AllocationData>()

  /** Index-based hover so duplicate `name` slices (e.g. two groups with same title) still render. */
  const [hoveredArcIndex, setHoveredArcIndex] = useState<number | null>(null)

  const colorScale = useMemo(
    () => createCategoryColorScale(data.map((d) => d.name)),
    [data],
  )

  const titleBudget = title ? 28 : 0
  const effectiveLegendMax = mobileStacked
    ? Math.min(5, legendMaxItems ?? data.length)
    : legendMaxItems
  const legendRowCount =
    effectiveLegendMax == null
      ? data.length
      : Math.min(effectiveLegendMax, data.length)
  const legendBudget = Math.min(100, 8 + legendRowCount * 28)
  const innerWidth = width
  const rowHeight = height - titleBudget - 4

  const besideActive =
    legendLayout === "beside" && width >= legendBesideMinWidth && !mobileStacked
  let chartSize: number
  if (mobileStacked) {
    // Mobile stacked: donut above, legend below — use generous sizing
    chartSize = Math.min(Math.round(innerWidth * 0.55), 200)
    chartSize = Math.max(120, chartSize)
  } else if (besideActive) {
    // Reserve horizontal space for the legend column; cap donut diameter so the
    // donut+legend pair stays balanced and can be centered (tall containers
    // must not inflate the donut to ~full width).
    const reservedLegend = 168
    const gap = 16
    const padX = 8
    const maxFromWidth = Math.max(
      96,
      innerWidth - padX * 2 - reservedLegend - gap,
    )
    const maxFromHeight = Math.max(96, rowHeight - 8)
    const BESIDE_DONUT_MAX = 220
    chartSize = Math.min(maxFromWidth, maxFromHeight, BESIDE_DONUT_MAX)
    chartSize = Math.max(96, chartSize)
  } else {
    const chartVertical = Math.max(
      96,
      height - titleBudget - legendBudget - 10,
    )
    chartSize = Math.min(innerWidth - 8, chartVertical)
  }
  const donutHeight = chartSize
  const size = chartSize
  const centerX = size / 2
  const centerY = donutHeight / 2
  const radius = Math.min(size, donutHeight) / 2 - (besideActive ? 8 : 12)
  const innerRadius = radius * 0.58

  if (width < 10 || data.length === 0) return null

  const legendData =
    effectiveLegendMax == null
      ? data
      : data.slice(0, Math.min(effectiveLegendMax, data.length))

  const donutBlock = (
    <div
      className={
        legendLayout === "beside"
          ? "relative shrink-0"
          : "relative mx-auto shrink-0"
      }
      style={{ width: size, height: donutHeight }}
    >
      <svg width={size} height={donutHeight}>
        <Group top={centerY} left={centerX}>
          <Pie
            data={data}
            pieValue={(d) => d.value}
            outerRadius={radius}
            innerRadius={innerRadius}
            padAngle={0.006}
          >
            {(pie) =>
              pie.arcs.map((arc) => {
                const fill = colorScale(arc.data.name)
                const dimmed =
                  hoveredArcIndex !== null && hoveredArcIndex !== arc.index

                return (
                  <g key={`arc-${arc.index}-${arc.data.name}`}>
                    <path
                      d={pie.path(arc) ?? ""}
                      fill={fill}
                      className="cursor-pointer transition-[opacity] duration-150"
                      style={{ opacity: dimmed ? 0.45 : 1 }}
                      onMouseMove={(e) => {
                        setHoveredArcIndex(arc.index)
                        showTooltip({
                          tooltipData: arc.data,
                          tooltipLeft: e.clientX,
                          tooltipTop: e.clientY,
                        })
                      }}
                      onMouseLeave={() => {
                        setHoveredArcIndex(null)
                        hideTooltip()
                      }}
                    />
                  </g>
                )
              })
            }
          </Pie>
          <text
            x={0}
            y={centerSubtitle ? -16 : -8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wide"
          >
            {centerLabel}
          </text>
          <text
            x={0}
            y={centerSubtitle ? 4 : 10}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-sm font-semibold tabular-nums"
          >
            {formatMoney(total)}
          </text>
          {centerSubtitle ? (
            <text
              x={0}
              y={22}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {centerSubtitle}
            </text>
          ) : null}
        </Group>
      </svg>
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={`${tooltipData.name}-${tooltipLeft}-${tooltipTop}`}
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
            <div className="font-medium text-foreground">
              {tooltipData.name} · {tooltipData.percentage.toFixed(1)}%
            </div>
            <div className="mt-0.5 tabular-nums text-muted-foreground">
              {formatMoney(tooltipData.value)} of {formatMoney(total)}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )

  const legendBlock =
    legendLayout === "beside" ? (
      <ul className={mobileStacked
        ? "mx-auto w-full max-w-xs shrink-0 space-y-0.5 pt-0.5"
        : "mx-auto w-full max-w-[11rem] shrink-0 space-y-0.5 pt-0.5 sm:mx-0 sm:w-auto sm:min-w-[6.5rem]"
      }>
        {legendData.map((d, i) => (
          <li key={`${i}-${d.name}`}>
            <div className="flex items-center gap-1 text-[11px] leading-tight sm:text-xs">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: colorScale(d.name) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {d.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {d.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="truncate pl-3 text-[10px] tabular-nums text-muted-foreground">
              {formatMoney(d.value)}
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <ul className="mx-auto w-full max-w-md space-y-1 pt-1">
        {legendData.map((d, i) => (
          <li key={`${i}-${d.name}`}>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/25 sm:gap-3 sm:px-3 sm:py-2 sm:text-sm">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: colorScale(d.name) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {d.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {d.percentage.toFixed(1)}%
              </span>
              <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
                {formatMoney(d.value)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    )

  if (legendLayout === "beside") {
    return (
      <div className="flex w-full flex-col items-center gap-1.5">
        {title && (
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        )}
        {/* Full-width row + justify-center: donut + legend centered together horizontally */}
        <div className="flex w-full min-h-0 flex-col items-center justify-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
          {donutBlock}
          {legendBlock}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      )}
      {donutBlock}
      {legendBlock}
    </div>
  )
}

/** Beside layout: measure width only so the wrapper height matches the chart (no fixed box gap). */
function BesideAllocationChart({
  data,
  title,
  legendMaxItems,
  containerHeight,
  centerLabel,
  centerSubtitle,
  legendBesideMinWidth,
  mobileStacked,
}: Omit<AllocationChartProps, "legendLayout" | "height"> & {
  readonly containerHeight: number
  readonly mobileStacked?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full overflow-visible">
      {width >= 10 ? (
        <AllocationChartInner
          data={data}
          title={title}
          legendMaxItems={legendMaxItems}
          centerLabel={centerLabel}
          centerSubtitle={centerSubtitle}
          legendLayout="beside"
          legendBesideMinWidth={legendBesideMinWidth}
          mobileStacked={mobileStacked}
          width={width}
          height={containerHeight}
        />
      ) : null}
    </div>
  )
}

export function AllocationChart({
  data,
  title,
  legendMaxItems,
  height: containerHeightProp = 280,
  centerLabel,
  centerSubtitle,
  legendLayout,
  legendBesideMinWidth,
}: AllocationChartProps) {
  const isMobile = useIsMobile()
  const containerHeight = isMobile
    ? Math.round(containerHeightProp * 0.78)
    : containerHeightProp

  if (legendLayout === "beside") {
    return (
      <BesideAllocationChart
        data={data}
        title={title}
        legendMaxItems={legendMaxItems}
        containerHeight={containerHeight}
        centerLabel={centerLabel}
        centerSubtitle={centerSubtitle}
        legendBesideMinWidth={legendBesideMinWidth}
        mobileStacked={isMobile}
      />
    )
  }

  return (
    <div className="w-full" style={{ height: containerHeight }}>
      <ParentSize>
        {({ width, height }) => (
          <AllocationChartInner
            data={data}
            title={title}
            legendMaxItems={legendMaxItems}
            centerLabel={centerLabel}
            centerSubtitle={centerSubtitle}
            legendLayout={legendLayout}
            legendBesideMinWidth={legendBesideMinWidth}
            width={width}
            height={height ?? containerHeight}
          />
        )}
      </ParentSize>
    </div>
  )
}
