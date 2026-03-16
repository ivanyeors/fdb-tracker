"use client"

import { useMemo } from "react"
import { BarStack, LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { Group } from "@visx/group"
import { Grid } from "@visx/grid"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"

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

const OUTFLOW_KEYS = ["discretionary", "insurance", "ilp", "loans", "tax"] as ["discretionary", "insurance", "ilp", "loans", "tax"]
const KEY_LABELS: Record<string, string> = {
  discretionary: "Spending",
  insurance: "Insurance",
  ilp: "ILP",
  loans: "Loans",
  tax: "Tax",
}

const colorScale = scaleOrdinal<string, string>({
  domain: [...OUTFLOW_KEYS, "inflow"],
  range: [
    "var(--color-chart-negative)",
    "var(--color-chart-negative)",
    "var(--color-chart-negative)",
    "var(--color-chart-negative)",
    "var(--color-chart-negative)",
    "var(--color-chart-positive)",
  ],
})

const margin = { top: 40, right: 20, bottom: 60, left: 50 }

function CashflowChartInner({
  data,
  width,
  height,
}: {
  data: CashflowRow[]
  width: number
  height: number
}) {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<{ key: string; value: number; month: string; inflow: number; outflowTotal: number }>()

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.top - margin.bottom

  const outflowTotals = useMemo(
    () =>
      data.map((d) =>
        OUTFLOW_KEYS.reduce((sum, k) => sum + d[k], 0)
      ),
    [data]
  )
  const maxOutflow = Math.max(...outflowTotals, 0)
  const maxInflow = Math.max(...data.map((d) => d.inflow), 0)
  const yMaxVal = Math.max(maxOutflow, maxInflow) * 1.1

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.month),
        range: [0, xMax],
        padding: 0.2,
      }),
    [data, xMax]
  )

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, yMaxVal],
        range: [yMax, 0],
        nice: true,
      }),
    [yMax, yMaxVal]
  )

  if (width < 10 || data.length === 0) return null

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <Grid
            xScale={xScale}
            yScale={yScale}
            width={xMax}
            height={yMax}
            stroke="var(--color-border)"
            strokeOpacity={0.3}
            strokeDasharray="3 3"
            xOffset={xScale.bandwidth() / 2}
          />
          <BarStack<CashflowRow, "discretionary" | "insurance" | "ilp" | "loans" | "tax">
            data={data}
            keys={OUTFLOW_KEYS}
            x={(d) => d.month}
            xScale={xScale}
            yScale={yScale}
            color={colorScale}
          >
            {(barStacks) =>
              barStacks.map((barStack) =>
                barStack.bars.map((bar) => (
                  <rect
                    key={`bar-${barStack.index}-${bar.index}`}
                    x={bar.x}
                    y={bar.y}
                    height={bar.height}
                    width={bar.width}
                    fill={bar.color}
                    rx={barStack.index === OUTFLOW_KEYS.length - 1 ? 4 : 0}
                    ry={barStack.index === OUTFLOW_KEYS.length - 1 ? 4 : 0}
                    onMouseMove={(e) => {
                      const rect = (e.target as SVGElement).getBoundingClientRect()
                      const row = bar.bar.data
                      const outflowTotal = OUTFLOW_KEYS.reduce((sum, k) => sum + row[k], 0)
                      showTooltip({
                        tooltipData: {
                          key: KEY_LABELS[bar.key] ?? bar.key,
                          value: bar.bar.data[bar.key],
                          month: row.month,
                          inflow: row.inflow,
                          outflowTotal,
                        },
                        tooltipLeft: rect.left + rect.width / 2,
                        tooltipTop: rect.top,
                      })
                    }}
                    onMouseLeave={hideTooltip}
                  />
                ))
              )
            }
          </BarStack>
          <LinePath<CashflowRow>
            data={data}
            x={(d) => (xScale(d.month) ?? 0) + (xScale.bandwidth() ?? 0) / 2}
            y={(d) => yScale(d.inflow) ?? 0}
            curve={curveMonotoneX}
            stroke="var(--color-chart-positive)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Group>
        <AxisBottom
          top={height - margin.bottom}
          left={margin.left}
          scale={xScale}
          stroke="var(--color-border)"
          tickStroke="var(--color-border)"
          tickLabelProps={() => ({
            fill: "var(--color-muted-foreground)",
            fontSize: 12,
            textAnchor: "middle" as const,
          })}
        />
        <AxisLeft
          top={margin.top}
          left={margin.left}
          scale={yScale}
          stroke="var(--color-border)"
          tickStroke="var(--color-border)"
          tickFormat={(v) => `$${(Number(v) / 1000).toFixed(1)}k`}
          tickLabelProps={() => ({
            fill: "var(--color-muted-foreground)",
            fontSize: 12,
            textAnchor: "end" as const,
            dx: -4,
          })}
        />
      </svg>
      <div
        className="absolute flex flex-wrap gap-x-4 gap-y-1"
        style={{ top: margin.top / 2 - 10, left: margin.left }}
      >
        {OUTFLOW_KEYS.map((k) => (
          <span key={k} className="text-xs text-muted-foreground">
            <span
              className="mr-1.5 inline-block size-3 rounded-sm"
              style={{ backgroundColor: colorScale(k) }}
            />
            {KEY_LABELS[k]}
          </span>
        ))}
        <span className="text-xs text-muted-foreground">
          <span
            className="mr-1.5 inline-block size-3 rounded-sm"
            style={{ backgroundColor: "var(--color-chart-positive)" }}
          />
          Inflow
        </span>
      </div>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.month}-${tooltipData.key}-${tooltipLeft}`}
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--color-card-foreground)",
          }}
        >
          <div className="font-medium">{tooltipData.month}</div>
          <div>
            {tooltipData.key}: ${Number(tooltipData.value).toLocaleString()}
            {tooltipData.inflow > 0 &&
              ` (${((tooltipData.value / tooltipData.inflow) * 100).toFixed(1)}% of inflow)`}
          </div>
          <div className="text-muted-foreground">
            Inflow: ${tooltipData.inflow.toLocaleString()} · Outflow: $
            {tooltipData.outflowTotal.toLocaleString()}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

export function CashflowChart({ data }: { data: CashflowRow[] }) {
  return (
    <div className="h-[350px] w-full">
      <ParentSize>
        {({ width, height }) => (
          <CashflowChartInner data={data} width={width} height={height ?? 350} />
        )}
      </ParentSize>
    </div>
  )
}
