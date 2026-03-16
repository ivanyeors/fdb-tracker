"use client"

import { useMemo } from "react"
import { LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { scaleLinear } from "@visx/scale"
import { Group } from "@visx/group"
import { Grid } from "@visx/grid"
import { AxisBottom, AxisLeft } from "@visx/axis"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"

type ProjectionRow = { year: number; balance: number }

const margin = { top: 40, right: 20, bottom: 60, left: 50 }

function CpfRetirementChartInner({
  data,
  width,
  height,
  referenceLines,
}: {
  data: ProjectionRow[]
  width: number
  height: number
  referenceLines: { value: number; label: string }[]
}) {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<ProjectionRow>()

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.top - margin.bottom

  const allYValues = useMemo(
    () => [
      ...data.map((d) => d.balance),
      ...referenceLines.map((r) => r.value),
    ],
    [data, referenceLines]
  )
  const yMin = Math.min(...allYValues, 0)
  const yMaxVal = Math.max(...allYValues) * 1.1

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [Math.min(...data.map((d) => d.year)), Math.max(...data.map((d) => d.year))],
        range: [0, xMax],
        nice: true,
      }),
    [data, xMax]
  )

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [yMin, yMaxVal],
        range: [yMax, 0],
        nice: true,
      }),
    [yMax, yMin, yMaxVal]
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
          />
          {referenceLines.map((ref) => {
            const y = yScale(ref.value)
            if (y === undefined || y < 0 || y > yMax) return null
            return (
              <g key={ref.label}>
                <line
                  x1={0}
                  y1={y}
                  x2={xMax}
                  y2={y}
                  stroke="var(--color-chart-neutral)"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                />
                <text
                  x={xMax + 4}
                  y={y}
                  fill="var(--color-chart-neutral)"
                  fontSize={12}
                  dominantBaseline="middle"
                >
                  {ref.label}
                </text>
              </g>
            )
          })}
          <LinePath<ProjectionRow>
            data={data}
            x={(d) => xScale(d.year) ?? 0}
            y={(d) => yScale(d.balance) ?? 0}
            curve={curveMonotoneX}
            stroke="var(--color-chart-neutral)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={xScale(d.year)}
              cy={yScale(d.balance)}
              r={4}
              fill="var(--color-chart-neutral)"
              onMouseMove={(e) => {
                const rect = (e.target as SVGElement).getBoundingClientRect()
                showTooltip({
                  tooltipData: d,
                  tooltipLeft: rect.left + rect.width / 2,
                  tooltipTop: rect.top,
                })
              }}
              onMouseLeave={hideTooltip}
            />
          ))}
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
          tickFormat={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
          tickLabelProps={() => ({
            fill: "var(--color-muted-foreground)",
            fontSize: 12,
            textAnchor: "end" as const,
            dx: -4,
          })}
        />
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.year}-${tooltipLeft}-${tooltipTop}`}
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
          <div className="font-medium">{tooltipData.year}</div>
          <div>${Number(tooltipData.balance).toLocaleString()}</div>
          <div className="text-muted-foreground">
            {(tooltipData.balance / BRS * 100).toFixed(0)}% of BRS · {(tooltipData.balance / FRS * 100).toFixed(0)}% of FRS · {(tooltipData.balance / ERS * 100).toFixed(0)}% of ERS
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

const BRS = 110200
const FRS = 220400
const ERS = 440800

const REFERENCE_LINES = [
  { value: BRS, label: "BRS (Basic Retirement Sum)" },
  { value: FRS, label: "FRS (Full Retirement Sum)" },
  { value: ERS, label: "ERS (Enhanced Retirement Sum)" },
]

export function CpfRetirementChart({ data }: { data: ProjectionRow[] }) {
  return (
    <div className="h-[300px] w-full">
      <ParentSize>
        {({ width, height }) => (
          <CpfRetirementChartInner
            data={data}
            width={width}
            height={height ?? 300}
            referenceLines={REFERENCE_LINES}
          />
        )}
      </ParentSize>
    </div>
  )
}
