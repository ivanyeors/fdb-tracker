"use client"

import { useMemo, useCallback, useId } from "react"
import { AreaClosed, LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { useChartHeight } from "@/hooks/use-chart-height"
import { Group } from "@visx/group"
import { GridRows } from "@visx/grid"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { scaleLinear, scalePoint } from "@visx/scale"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { createPortal } from "react-dom"
import { formatCurrency } from "@/lib/utils"

type CashflowRow = {
  month: string
  sortKey?: string
  inflow: number
  discretionary: number
  insurance: number
  ilp: number
  loans: number
  tax: number
}

type OutflowKey = "discretionary" | "insurance" | "ilp" | "loans" | "tax"

const LAYERS: { key: OutflowKey; label: string; color: string }[] = [
  { key: "discretionary", label: "Spending", color: "var(--color-chart-1)" },
  { key: "insurance", label: "Insurance", color: "var(--color-chart-2)" },
  { key: "ilp", label: "ILP", color: "var(--color-chart-3)" },
  { key: "loans", label: "Loans", color: "var(--color-chart-4)" },
  { key: "tax", label: "Tax", color: "var(--color-chart-5)" },
]

const INFLOW_COLOR = "var(--color-chart-positive)"

const MARGIN = { top: 16, right: 20, bottom: 48, left: 56 }

type StackedPoint = CashflowRow & {
  cumulative: { y0: number; y1: number }[]
  totalOutflow: number
}

function ChartLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {LAYERS.map((layer) => (
        <div key={layer.key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: layer.color }}
          />
          <span>{layer.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: INFLOW_COLOR }}
        />
        <span>Inflow</span>
      </div>
    </div>
  )
}

function CashflowChartInner({
  data,
  width,
  height,
}: {
  data: CashflowRow[]
  width: number
  height: number
}) {
  const gradPrefix = useId().replace(/:/g, "_")
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<StackedPoint>()

  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const stackedData = useMemo<StackedPoint[]>(() => {
    return data.map((row) => {
      const cumulative: { y0: number; y1: number }[] = []
      let running = 0
      for (const layer of LAYERS) {
        const val = row[layer.key]
        cumulative.push({ y0: running, y1: running + val })
        running += val
      }
      return { ...row, cumulative, totalOutflow: running }
    })
  }, [data])

  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: data.map((d) => d.month),
        range: [0, innerWidth],
        padding: 0.5,
      }),
    [data, innerWidth],
  )

  const yMaxVal = useMemo(() => {
    const maxOutflow = Math.max(...stackedData.map((d) => d.totalOutflow), 0)
    const maxInflow = Math.max(...data.map((d) => d.inflow), 0)
    return Math.max(maxOutflow, maxInflow) * 1.12
  }, [data, stackedData])

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, yMaxVal],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight, yMaxVal],
  )

  const handleOverlayMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (stackedData.length === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left - MARGIN.left
      let closest = stackedData[0]!
      let closestDist = Infinity
      for (const d of stackedData) {
        const dist = Math.abs((xScale(d.month) ?? 0) - mouseX)
        if (dist < closestDist) {
          closestDist = dist
          closest = d
        }
      }
      showTooltip({
        tooltipData: closest,
        tooltipLeft: e.clientX,
        tooltipTop: e.clientY,
      })
    },
    [stackedData, xScale, showTooltip],
  )

  if (width < 10 || data.length === 0) return null

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <defs>
          {LAYERS.map((layer) => (
            <linearGradient
              key={layer.key}
              id={`${gradPrefix}${layer.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={layer.color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={layer.color} stopOpacity={0.08} />
            </linearGradient>
          ))}
          <linearGradient
            id={`${gradPrefix}inflow`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={INFLOW_COLOR} stopOpacity={0.25} />
            <stop offset="100%" stopColor={INFLOW_COLOR} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--color-border)"
            strokeOpacity={0.3}
            strokeDasharray="3 6"
            numTicks={5}
            pointerEvents="none"
          />

          {/* Inflow area (rendered first, behind outflow stack) */}
          <AreaClosed<StackedPoint>
            data={stackedData}
            x={(d) => xScale(d.month) ?? 0}
            y={(d) => yScale(d.inflow) ?? 0}
            y0={() => innerHeight}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={`url(#${gradPrefix}inflow)`}
          />

          {/* Stacked outflow areas (bottom to top) */}
          {LAYERS.map((layer, i) => (
            <AreaClosed<StackedPoint>
              key={layer.key}
              data={stackedData}
              x={(d) => xScale(d.month) ?? 0}
              y={(d) => yScale(d.cumulative[i]!.y1) ?? 0}
              y0={(d) => yScale(d.cumulative[i]!.y0) ?? innerHeight}
              yScale={yScale}
              curve={curveMonotoneX}
              fill={`url(#${gradPrefix}${layer.key})`}
            />
          ))}

          {/* Layer boundary lines */}
          {LAYERS.map((layer, i) => (
            <LinePath<StackedPoint>
              key={`line-${layer.key}`}
              data={stackedData}
              x={(d) => xScale(d.month) ?? 0}
              y={(d) => yScale(d.cumulative[i]!.y1) ?? 0}
              curve={curveMonotoneX}
              stroke={layer.color}
              strokeWidth={1.5}
              strokeOpacity={0.6}
            />
          ))}

          {/* Inflow line */}
          <LinePath<StackedPoint>
            data={stackedData}
            x={(d) => xScale(d.month) ?? 0}
            y={(d) => yScale(d.inflow) ?? 0}
            curve={curveMonotoneX}
            stroke={INFLOW_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Tooltip crosshair + dots */}
          {tooltipOpen &&
            tooltipData &&
            (() => {
              const cx = xScale(tooltipData.month) ?? 0
              return (
                <g>
                  <line
                    x1={cx}
                    y1={0}
                    x2={cx}
                    y2={innerHeight}
                    stroke="var(--color-foreground)"
                    strokeWidth={1}
                    strokeOpacity={0.15}
                  />
                  {LAYERS.map((layer, i) => (
                    <circle
                      key={layer.key}
                      cx={cx}
                      cy={yScale(tooltipData.cumulative[i]!.y1) ?? 0}
                      r={3}
                      fill={layer.color}
                    />
                  ))}
                  <circle
                    cx={cx}
                    cy={yScale(tooltipData.inflow) ?? 0}
                    r={4}
                    fill={INFLOW_COLOR}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                  />
                </g>
              )
            })()}
        </Group>

        <AxisBottom
          top={height - MARGIN.bottom}
          left={MARGIN.left}
          scale={xScale}
          stroke="var(--color-border)"
          tickStroke="var(--color-border)"
          hideAxisLine
          hideTicks
          tickLabelProps={() => ({
            fill: "var(--color-muted-foreground)",
            fontSize: 11,
            textAnchor: "middle" as const,
          })}
        />
        <AxisLeft
          top={MARGIN.top}
          left={MARGIN.left}
          scale={yScale}
          stroke="var(--color-border)"
          tickStroke="var(--color-border)"
          hideAxisLine
          hideTicks
          numTicks={5}
          tickFormat={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
          tickLabelProps={() => ({
            fill: "var(--color-muted-foreground)",
            fontSize: 11,
            textAnchor: "end" as const,
            dx: -4,
          })}
        />

        {/* Invisible overlay for cursor tracking */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={handleOverlayMove}
          onMouseLeave={hideTooltip}
        />
      </svg>

      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={`${tooltipData.month}-${tooltipLeft}-${tooltipTop}`}
            role="tooltip"
            className="pointer-events-none z-[9999] max-w-[min(280px,calc(100vw-24px))] rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-card-foreground shadow-lg"
            style={{
              position: "fixed",
              left: tooltipLeft,
              top: tooltipTop,
              transform: "translate(12px, 12px)",
              fontSize: 12,
            }}
          >
            <div className="mb-1.5 text-sm font-semibold">
              {tooltipData.month}
            </div>
            <div className="space-y-0.5">
              {LAYERS.map((layer) => (
                <div
                  key={layer.key}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-muted-foreground">{layer.label}</span>
                  </div>
                  <span className="tabular-nums font-medium">
                    ${formatCurrency(tooltipData[layer.key])}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5">
              <span className="font-medium">Total Outflow</span>
              <span className="tabular-nums font-semibold">
                ${formatCurrency(tooltipData.totalOutflow)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: INFLOW_COLOR }}
                />
                <span className="text-muted-foreground">Inflow</span>
              </div>
              <span className="tabular-nums font-medium">
                ${formatCurrency(tooltipData.inflow)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-muted-foreground">
              <span>Net Savings</span>
              <span className="tabular-nums">
                ${formatCurrency(tooltipData.inflow - tooltipData.totalOutflow)}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export function CashflowChart({ data }: { data: CashflowRow[] }) {
  const chartHeight = useChartHeight(350, 250)
  return (
    <div>
      <ChartLegend />
      <div className="w-full" style={{ height: chartHeight }}>
        <ParentSize>
          {({ width, height }) => (
            <CashflowChartInner
              data={data}
              width={width}
              height={height ?? chartHeight}
            />
          )}
        </ParentSize>
      </div>
    </div>
  )
}
