"use client"

import { useMemo, useCallback, useId } from "react"
import { AreaClosed, LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { useChartHeight } from "@/hooks/use-chart-height"
import { scaleLinear } from "@visx/scale"
import { Group } from "@visx/group"
import { GridRows } from "@visx/grid"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { createPortal } from "react-dom"
import { formatCurrency } from "@/lib/utils"

type ProjectionPoint = {
  year: number
  age: number
  oa: number
  sa: number
  ma: number
  total: number
}

type ReferenceLine = {
  value: number
  label: string
  shortLabel: string
}

type CpfRetirementChartProps = {
  data: ProjectionPoint[]
  referenceLines: ReferenceLine[]
  comparisonData?: ProjectionPoint[] | null
  currentAge?: number
}

const MARGIN = { top: 16, right: 72, bottom: 48, left: 56 }

const LAYERS = [
  { key: "oa" as const, label: "OA", color: "var(--color-chart-1)" },
  { key: "sa" as const, label: "SA", color: "var(--color-chart-2)" },
  { key: "ma" as const, label: "MA", color: "var(--color-chart-3)" },
]

function ChartInner({
  data,
  width,
  height,
  referenceLines,
  comparisonData,
}: {
  data: ProjectionPoint[]
  width: number
  height: number
  referenceLines: ReferenceLine[]
  comparisonData?: ProjectionPoint[] | null
}) {
  const gradPrefix = useId().replace(/:/g, "_")
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<{ point: ProjectionPoint; comparisonTotal?: number }>()

  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const allYValues = useMemo(
    () => [
      ...data.map((d) => d.total),
      ...(comparisonData ?? []).map((d) => d.total),
      ...referenceLines.map((r) => r.value),
    ],
    [data, comparisonData, referenceLines],
  )

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [data[0]?.year ?? 0, data[data.length - 1]?.year ?? 1],
        range: [0, innerWidth],
      }),
    [data, innerWidth],
  )

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Math.max(...allYValues) * 1.12],
        range: [innerHeight, 0],
        nice: true,
      }),
    [allYValues, innerHeight],
  )

  const comparisonMap = useMemo(() => {
    if (!comparisonData) return null
    const map = new Map<number, number>()
    for (const p of comparisonData) map.set(p.year, p.total)
    return map
  }, [comparisonData])

  const handleOverlayMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (data.length === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left - MARGIN.left
      let closest = data[0]!
      let closestDist = Infinity
      for (const d of data) {
        const dist = Math.abs((xScale(d.year) ?? 0) - mouseX)
        if (dist < closestDist) {
          closestDist = dist
          closest = d
        }
      }
      showTooltip({
        tooltipData: {
          point: closest,
          comparisonTotal: comparisonMap?.get(closest.year),
        },
        tooltipLeft: e.clientX,
        tooltipTop: e.clientY,
      })
    },
    [data, xScale, comparisonMap, showTooltip],
  )

  if (width < 10 || data.length === 0) return null

  const currentYear = new Date().getFullYear()
  const todayX = xScale(currentYear) ?? 0

  // Nudge overlapping reference line labels
  const refPositions = referenceLines
    .map((r) => ({ ...r, y: yScale(r.value) ?? 0 }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < refPositions.length; i++) {
    if (refPositions[i]!.y - refPositions[i - 1]!.y < 16) {
      refPositions[i]!.y = refPositions[i - 1]!.y + 16
    }
  }

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

          {/* Stacked areas: MA (top), SA (middle), OA (bottom) */}
          <AreaClosed<ProjectionPoint>
            data={data}
            x={(d) => xScale(d.year) ?? 0}
            y={(d) => yScale(d.oa) ?? 0}
            y0={() => innerHeight}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={`url(#${gradPrefix}oa)`}
          />
          <AreaClosed<ProjectionPoint>
            data={data}
            x={(d) => xScale(d.year) ?? 0}
            y={(d) => yScale(d.oa + d.sa) ?? 0}
            y0={(d) => yScale(d.oa) ?? innerHeight}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={`url(#${gradPrefix}sa)`}
          />
          <AreaClosed<ProjectionPoint>
            data={data}
            x={(d) => xScale(d.year) ?? 0}
            y={(d) => yScale(d.total) ?? 0}
            y0={(d) => yScale(d.oa + d.sa) ?? innerHeight}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={`url(#${gradPrefix}ma)`}
          />

          {/* Layer boundary lines */}
          <LinePath<ProjectionPoint>
            data={data}
            x={(d) => xScale(d.year) ?? 0}
            y={(d) => yScale(d.oa) ?? 0}
            curve={curveMonotoneX}
            stroke={LAYERS[0]!.color}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
          <LinePath<ProjectionPoint>
            data={data}
            x={(d) => xScale(d.year) ?? 0}
            y={(d) => yScale(d.oa + d.sa) ?? 0}
            curve={curveMonotoneX}
            stroke={LAYERS[1]!.color}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />

          {/* Total line */}
          <LinePath<ProjectionPoint>
            data={data}
            x={(d) => xScale(d.year) ?? 0}
            y={(d) => yScale(d.total) ?? 0}
            curve={curveMonotoneX}
            stroke={LAYERS[2]!.color}
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Comparison ghost line (without housing) */}
          {comparisonData && comparisonData.length > 0 && (
            <LinePath<ProjectionPoint>
              data={comparisonData}
              x={(d) => xScale(d.year) ?? 0}
              y={(d) => yScale(d.total) ?? 0}
              curve={curveMonotoneX}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.5}
            />
          )}

          {/* Reference lines with pill badges */}
          {refPositions.map((ref) => {
            const rawY = yScale(ref.value) ?? 0
            if (rawY < 0 || rawY > innerHeight) return null
            return (
              <g key={ref.shortLabel}>
                <line
                  x1={0}
                  y1={rawY}
                  x2={innerWidth}
                  y2={rawY}
                  stroke="var(--color-chart-neutral)"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
                <rect
                  x={innerWidth + 4}
                  y={ref.y - 10}
                  width={56}
                  height={20}
                  rx={4}
                  fill="var(--color-muted)"
                  opacity={0.8}
                />
                <text
                  x={innerWidth + 32}
                  y={ref.y}
                  fill="var(--color-muted-foreground)"
                  fontSize={11}
                  fontWeight={500}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {ref.shortLabel}
                </text>
              </g>
            )
          })}

          {/* Today marker */}
          {todayX >= 0 && todayX <= innerWidth && (
            <g>
              <line
                x1={todayX}
                y1={0}
                x2={todayX}
                y2={innerHeight}
                stroke="var(--color-foreground)"
                strokeWidth={1}
                strokeDasharray="4 4"
                strokeOpacity={0.3}
              />
              <text
                x={todayX}
                y={-4}
                fill="var(--color-muted-foreground)"
                fontSize={10}
                textAnchor="middle"
              >
                Today
              </text>
            </g>
          )}

          {/* Tooltip cursor line + dots */}
          {tooltipOpen && tooltipData && (() => {
            const d = tooltipData.point
            const cx = xScale(d.year) ?? 0
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
                <circle cx={cx} cy={yScale(d.oa) ?? 0} r={3} fill={LAYERS[0]!.color} />
                <circle cx={cx} cy={yScale(d.oa + d.sa) ?? 0} r={3} fill={LAYERS[1]!.color} />
                <circle cx={cx} cy={yScale(d.total) ?? 0} r={4} fill={LAYERS[2]!.color} stroke="var(--color-card)" strokeWidth={2} />
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
          tickFormat={(v) => String(v)}
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
            key={`${tooltipData.point.year}-${tooltipLeft}-${tooltipTop}`}
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
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-sm font-semibold">{tooltipData.point.year}</span>
              <span className="text-muted-foreground">Age {tooltipData.point.age}</span>
            </div>
            <div className="space-y-0.5">
              {LAYERS.map((layer) => (
                <div key={layer.key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-muted-foreground">{layer.label}</span>
                  </div>
                  <span className="tabular-nums font-medium">
                    ${formatCurrency(tooltipData.point[layer.key])}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 border-t border-border pt-1.5 flex items-center justify-between">
              <span className="font-medium">Total</span>
              <span className="tabular-nums font-semibold">
                ${formatCurrency(tooltipData.point.total)}
              </span>
            </div>
            {tooltipData.comparisonTotal != null && (
              <div className="mt-1 flex items-center justify-between text-muted-foreground">
                <span>Without loan</span>
                <span className="tabular-nums">
                  ${formatCurrency(tooltipData.comparisonTotal)}
                </span>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

function ChartLegend({ hasComparison }: { hasComparison: boolean }) {
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
      {hasComparison && (
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" />
          <span>Without loan</span>
        </div>
      )}
    </div>
  )
}

export function CpfRetirementChart({
  data,
  referenceLines,
  comparisonData,
  currentAge: _currentAge,
}: CpfRetirementChartProps) {
  const chartHeight = useChartHeight(400, 280)
  return (
    <div>
      <ChartLegend hasComparison={!!comparisonData && comparisonData.length > 0} />
      <div className="w-full" style={{ height: chartHeight }}>
        <ParentSize>
          {({ width, height }) => (
            <ChartInner
              data={data}
              width={width}
              height={height ?? chartHeight}
              referenceLines={referenceLines}
              comparisonData={comparisonData}
            />
          )}
        </ParentSize>
      </div>
    </div>
  )
}
