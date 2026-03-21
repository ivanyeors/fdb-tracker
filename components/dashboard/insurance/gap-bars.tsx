"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { Group } from "@visx/group"
import { Bar } from "@visx/shape"
import { scaleLinear, scaleBand } from "@visx/scale"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { formatCurrency } from "@/lib/utils"
import type { CoverageGapItem } from "@/lib/calculations/insurance"

type GapBarsProps = {
  items: CoverageGapItem[]
  showDollars?: boolean
}

type TooltipData = {
  label: string
  held: number
  needed: number
  gap: number
  gapPct: number
  isHospitalization: boolean
  hasCoverage: boolean
}

const COVERED_COLOR = "var(--color-chart-2)"
const GAP_COLOR = "var(--color-destructive)"

function GapBarsInner({
  items,
  showDollars = false,
  width,
  height,
}: GapBarsProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>()

  const displayItems = useMemo(
    () => items.filter((i) => i.coverageType !== "personal_accident" || i.held > 0),
    [items],
  )

  const margin = { top: 8, right: showDollars ? 110 : 70, bottom: 8, left: 120 }
  const innerWidth = Math.max(width - margin.left - margin.right, 0)
  const innerHeight = Math.max(height - margin.top - margin.bottom, 0)

  const yScale = scaleBand<string>({
    domain: displayItems.map((d) => d.label),
    range: [0, innerHeight],
    padding: 0.35,
  })

  const maxValue = useMemo(() => {
    if (showDollars) {
      return Math.max(...displayItems.map((d) => Math.max(d.needed, d.held)), 1)
    }
    return 100
  }, [displayItems, showDollars])

  const xScale = scaleLinear<number>({
    domain: [0, maxValue],
    range: [0, innerWidth],
  })

  if (innerWidth < 10 || displayItems.length === 0) return null

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group top={margin.top} left={margin.left}>
          {displayItems.map((item) => {
            const y = yScale(item.label) ?? 0
            const barHeight = yScale.bandwidth()
            const isHosp = item.coverageType === "hospitalization"

            let coveredWidth: number
            let gapWidth: number

            if (isHosp) {
              coveredWidth = item.hasCoverage ? innerWidth : 0
              gapWidth = item.hasCoverage ? 0 : innerWidth
            } else if (showDollars) {
              coveredWidth = xScale(Math.min(item.held, item.needed))
              gapWidth = xScale(item.gap)
            } else {
              const coveredPct =
                item.needed > 0
                  ? Math.min(item.held / item.needed, 1) * 100
                  : 0
              coveredWidth = xScale(coveredPct)
              gapWidth = xScale(100 - coveredPct)
            }

            const tooltipHandler = (e: React.MouseEvent) => {
              showTooltip({
                tooltipData: {
                  label: item.label,
                  held: item.held,
                  needed: item.needed,
                  gap: item.gap,
                  gapPct: item.gapPct,
                  isHospitalization: isHosp,
                  hasCoverage: item.hasCoverage,
                },
                tooltipLeft: e.clientX,
                tooltipTop: e.clientY,
              })
            }

            return (
              <g key={item.coverageType}>
                {/* Label */}
                <text
                  x={-8}
                  y={y + barHeight / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-foreground text-xs font-medium"
                >
                  {item.label}
                </text>

                {/* Background track */}
                <rect
                  x={0}
                  y={y}
                  width={innerWidth}
                  height={barHeight}
                  rx={4}
                  fill="var(--color-muted)"
                  fillOpacity={0.5}
                />

                {/* Covered portion */}
                {coveredWidth > 0 && (
                  <Bar
                    x={0}
                    y={y}
                    width={coveredWidth}
                    height={barHeight}
                    rx={4}
                    fill={COVERED_COLOR}
                    fillOpacity={0.8}
                    className="cursor-pointer"
                    onMouseMove={tooltipHandler}
                    onMouseLeave={hideTooltip}
                  />
                )}

                {/* Gap portion */}
                {gapWidth > 0 && (
                  <Bar
                    x={coveredWidth}
                    y={y}
                    width={gapWidth}
                    height={barHeight}
                    rx={coveredWidth > 0 ? 0 : 4}
                    fill={GAP_COLOR}
                    fillOpacity={0.25}
                    className="cursor-pointer"
                    onMouseMove={tooltipHandler}
                    onMouseLeave={hideTooltip}
                  />
                )}

                {/* Right label */}
                <text
                  x={innerWidth + 8}
                  y={y + barHeight / 2}
                  textAnchor="start"
                  dominantBaseline="central"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {isHosp
                    ? item.hasCoverage
                      ? "Covered"
                      : "No ISP"
                    : showDollars
                      ? `$${formatCurrency(item.held)}`
                      : `${Math.round(
                          item.needed > 0
                            ? Math.min(item.held / item.needed, 1) * 100
                            : 0,
                        )}%`}
                </text>
              </g>
            )
          })}
        </Group>
      </svg>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: COVERED_COLOR, opacity: 0.8 }}
          />
          Covered
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: GAP_COLOR, opacity: 0.25 }}
          />
          Gap
        </div>
      </div>

      {/* Tooltip */}
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
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
              {tooltipData.label}
            </div>
            {tooltipData.isHospitalization ? (
              <div className="mt-0.5 text-muted-foreground">
                {tooltipData.hasCoverage
                  ? "Active Integrated Shield Plan"
                  : "No Integrated Shield Plan found"}
              </div>
            ) : (
              <>
                <div className="mt-0.5 tabular-nums text-muted-foreground">
                  Covered: ${formatCurrency(tooltipData.held)}
                </div>
                <div className="tabular-nums text-muted-foreground">
                  Benchmark: ${formatCurrency(tooltipData.needed)}
                </div>
                {tooltipData.gap > 0 && (
                  <div className="tabular-nums text-destructive">
                    Gap: ${formatCurrency(tooltipData.gap)} (
                    {Math.round(tooltipData.gapPct)}%)
                  </div>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function GapBars({ items, showDollars }: GapBarsProps) {
  const barCount = items.filter(
    (i) => i.coverageType !== "personal_accident" || i.held > 0,
  ).length
  const chartHeight = Math.max(barCount * 56, 180)

  return (
    <div style={{ height: chartHeight }} className="w-full">
      <ParentSize>
        {({ width, height }) => (
          <GapBarsInner
            items={items}
            showDollars={showDollars}
            width={width}
            height={height ?? chartHeight}
          />
        )}
      </ParentSize>
    </div>
  )
}
