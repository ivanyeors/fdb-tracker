"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Bar } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { useChartHeight } from "@/hooks/use-chart-height"
import { formatCurrency } from "@/lib/utils"

export type CpfTrendRow = {
  month: string
  inflow: number
  inflowOa: number
  inflowSa: number
  inflowMa: number
  outflow: number
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function formatMonth(month: string) {
  const d = new Date(month)
  return `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

function CpfTrendChartInner({
  data,
  width,
  height,
}: {
  readonly data: CpfTrendRow[]
  readonly width: number
  readonly height: number
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<CpfTrendRow>()
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null)

  const margin = { top: 12, right: 12, bottom: 36, left: 52 }
  const innerW = Math.max(0, width - margin.left - margin.right)
  const innerH = Math.max(0, height - margin.top - margin.bottom)

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.month),
        range: [0, innerW],
        padding: 0.3,
      }),
    [data, innerW],
  )

  const barGroupScale = useMemo(
    () =>
      scaleBand<string>({
        domain: ["inflow", "outflow"],
        range: [0, xScale.bandwidth()],
        padding: 0.1,
      }),
    [xScale],
  )

  const maxVal = useMemo(
    () => Math.max(...data.map((d) => Math.max(d.inflow, d.outflow)), 1),
    [data],
  )

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxVal * 1.1],
        range: [innerH, 0],
        nice: true,
      }),
    [maxVal, innerH],
  )

  if (width < 10 || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No CPF flow data available.
      </div>
    )
  }

  const inflowColor = "oklch(0.72 0.17 155)"
  const outflowColor = "oklch(0.68 0.16 25)"

  return (
    <>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {data.map((d) => {
            const x0 = xScale(d.month) ?? 0
            const isHovered = hoveredMonth === d.month

            return (
              <Group key={d.month}>
                {/* Inflow bar */}
                <Bar
                  x={x0 + (barGroupScale("inflow") ?? 0)}
                  y={yScale(d.inflow)}
                  width={barGroupScale.bandwidth()}
                  height={Math.max(0, innerH - yScale(d.inflow))}
                  fill={inflowColor}
                  opacity={hoveredMonth && !isHovered ? 0.4 : 1}
                  rx={2}
                />
                {/* Outflow bar */}
                <Bar
                  x={x0 + (barGroupScale("outflow") ?? 0)}
                  y={yScale(d.outflow)}
                  width={barGroupScale.bandwidth()}
                  height={Math.max(0, innerH - yScale(d.outflow))}
                  fill={outflowColor}
                  opacity={hoveredMonth && !isHovered ? 0.4 : 1}
                  rx={2}
                />
                {/* Invisible hover area */}
                <rect
                  x={x0}
                  y={0}
                  width={xScale.bandwidth()}
                  height={innerH}
                  fill="transparent"
                  onMouseMove={(e) => {
                    setHoveredMonth(d.month)
                    showTooltip({
                      tooltipData: d,
                      tooltipLeft: e.clientX,
                      tooltipTop: e.clientY,
                    })
                  }}
                  onMouseLeave={() => {
                    setHoveredMonth(null)
                    hideTooltip()
                  }}
                />
              </Group>
            )
          })}
          <AxisBottom
            top={innerH}
            scale={xScale}
            tickFormat={(v) => formatMonth(v)}
            tickLabelProps={{
              className: "fill-muted-foreground",
              fontSize: 10,
              textAnchor: "middle",
            }}
            hideAxisLine
            hideTicks
          />
          <AxisLeft
            scale={yScale}
            numTicks={4}
            tickFormat={(v) => {
              const n = Number(v)
              const display = n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(v)
              return `$${display}`
            }}
            tickLabelProps={{
              className: "fill-muted-foreground",
              fontSize: 10,
              textAnchor: "end",
              dx: -4,
            }}
            hideAxisLine
            hideTicks
          />
        </Group>
      </svg>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: inflowColor }}
          />
          <span className="text-muted-foreground">Inflow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: outflowColor }}
          />
          <span className="text-muted-foreground">Outflow</span>
        </div>
      </div>

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
              {formatMonth(tooltipData.month)}
            </div>
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: inflowColor }}
                />
                <span className="text-muted-foreground">Inflow</span>
                <span className="ml-auto tabular-nums font-medium">
                  ${formatCurrency(tooltipData.inflow)}
                </span>
              </div>
              <div className="pl-3.5 text-[10px] text-muted-foreground tabular-nums">
                OA ${formatCurrency(tooltipData.inflowOa)} · SA $
                {formatCurrency(tooltipData.inflowSa)} · MA $
                {formatCurrency(tooltipData.inflowMa)}
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: outflowColor }}
                />
                <span className="text-muted-foreground">Outflow</span>
                <span className="ml-auto tabular-nums font-medium">
                  ${formatCurrency(tooltipData.outflow)}
                </span>
              </div>
              <div className="mt-1 border-t pt-1 flex justify-between text-[11px]">
                <span className="text-muted-foreground">Net</span>
                <span
                  className={`tabular-nums font-medium ${
                    tooltipData.inflow - tooltipData.outflow >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {tooltipData.inflow - tooltipData.outflow >= 0 ? "+" : ""}$
                  {formatCurrency(
                    Math.abs(tooltipData.inflow - tooltipData.outflow),
                  )}
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export function CpfTrendChart({ data }: { readonly data: CpfTrendRow[] }) {
  const chartHeight = useChartHeight(280, 200)
  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ParentSize>
        {({ width, height }) => (
          <CpfTrendChartInner
            data={data}
            width={width}
            height={height ?? chartHeight}
          />
        )}
      </ParentSize>
    </div>
  )
}
