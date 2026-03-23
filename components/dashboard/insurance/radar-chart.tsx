"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Group } from "@visx/group"
import { useChartHeight } from "@/hooks/use-chart-height"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { scaleLinear } from "@visx/scale"
import { Line } from "@visx/shape"
import { Point } from "@visx/point"

type RadarDatum = {
  axis: string
  value: number
  profileName?: string
}

type RadarSeriesData = {
  profileName: string
  data: RadarDatum[]
  color: string
}

type RadarChartProps = {
  series: RadarSeriesData[]
  axes: string[]
}

const RING_LEVELS = [25, 50, 75, 100]

function genAngles(length: number) {
  return [...Array(length + 1)].map((_, i) => ({
    angle: i * (360 / length) + (length % 2 === 0 ? 0 : -90),
  }))
}

function genPoint(length: number, index: number, radius: number): Point {
  const step = (Math.PI * 2) / length
  const angle = index * step - Math.PI / 2
  return new Point({
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle),
  })
}

function genPolygonPoints(
  dataArray: number[],
  scale: (v: number) => number,
  numAxes: number,
): Point[] {
  return dataArray.map((d, i) => genPoint(numAxes, i, scale(d)))
}

function RadarChartInner({
  series,
  axes,
  width,
  height,
}: RadarChartProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<{ axis: string; values: { profileName: string; value: number; color: string }[] }>()
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null)

  const numAxes = axes.length
  const angles = useMemo(() => genAngles(numAxes), [numAxes])

  const size = Math.min(width, height)
  if (size < 60) return null

  const margin = 40
  const radius = (size - margin * 2) / 2

  const radialScale = scaleLinear<number>({
    domain: [0, 100],
    range: [0, radius],
  })

  const centerX = size / 2
  const centerY = size / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <Group top={centerY} left={centerX}>
          {/* Concentric rings */}
          {RING_LEVELS.map((level) => (
            <circle
              key={level}
              r={radialScale(level)}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={level === 100 ? 1 : 0.5}
              strokeDasharray={level === 100 ? undefined : "2,3"}
            />
          ))}

          {/* Ring labels */}
          {RING_LEVELS.map((level) => (
            <text
              key={`label-${level}`}
              x={2}
              y={-radialScale(level) - 2}
              className="fill-muted-foreground text-[9px]"
              textAnchor="start"
            >
              {level}%
            </text>
          ))}

          {/* Axis spokes */}
          {[...Array(numAxes)].map((_, i) => {
            const endPoint = genPoint(numAxes, i, radius)
            return (
              <Line
                key={`spoke-${i}`}
                from={new Point({ x: 0, y: 0 })}
                to={endPoint}
                stroke="var(--color-border)"
                strokeWidth={0.5}
              />
            )
          })}

          {/* Data polygons */}
          {series.map((s) => {
            const points = genPolygonPoints(
              s.data.map((d) => d.value),
              radialScale,
              numAxes,
            )
            const pathD =
              points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z"
            return (
              <g key={s.profileName}>
                <path
                  d={pathD}
                  fill={s.color}
                  fillOpacity={0.15}
                  stroke={s.color}
                  strokeWidth={2}
                />
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill={s.color}
                    stroke="var(--color-card)"
                    strokeWidth={1.5}
                    className="cursor-pointer"
                    onMouseMove={(e) => {
                      setHoveredAxis(i)
                      const allValues = series.map((ser) => ({
                        profileName: ser.profileName,
                        value: ser.data[i].value,
                        color: ser.color,
                      }))
                      showTooltip({
                        tooltipData: { axis: axes[i], values: allValues },
                        tooltipLeft: e.clientX,
                        tooltipTop: e.clientY,
                      })
                    }}
                    onMouseLeave={() => {
                      setHoveredAxis(null)
                      hideTooltip()
                    }}
                  />
                ))}
              </g>
            )
          })}

          {/* Axis labels */}
          {axes.map((axis, i) => {
            const labelRadius = radius + 16
            const point = genPoint(numAxes, i, labelRadius)
            const isBottom = point.y > 5
            const isTop = point.y < -5
            return (
              <text
                key={axis}
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline={isBottom ? "hanging" : isTop ? "auto" : "central"}
                className={`text-[11px] font-medium ${
                  hoveredAxis === i
                    ? "fill-foreground"
                    : "fill-muted-foreground"
                }`}
              >
                {axis}
              </text>
            )
          })}

          {/* Invisible hover zones for spokes */}
          {[...Array(numAxes)].map((_, i) => {
            const endPoint = genPoint(numAxes, i, radius)
            return (
              <line
                key={`hover-${i}`}
                x1={0}
                y1={0}
                x2={endPoint.x}
                y2={endPoint.y}
                stroke="transparent"
                strokeWidth={12}
                className="cursor-pointer"
                onMouseMove={(e) => {
                  setHoveredAxis(i)
                  const allValues = series.map((ser) => ({
                    profileName: ser.profileName,
                    value: ser.data[i].value,
                    color: ser.color,
                  }))
                  showTooltip({
                    tooltipData: { axis: axes[i], values: allValues },
                    tooltipLeft: e.clientX,
                    tooltipTop: e.clientY,
                  })
                }}
                onMouseLeave={() => {
                  setHoveredAxis(null)
                  hideTooltip()
                }}
              />
            )
          })}
        </Group>
      </svg>

      {/* Legend */}
      {series.length > 1 && (
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-4">
          {series.map((s) => (
            <div key={s.profileName} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-muted-foreground">{s.profileName}</span>
            </div>
          ))}
        </div>
      )}

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
              {tooltipData.axis}
            </div>
            {tooltipData.values.map((v) => (
              <div key={v.profileName} className="mt-0.5 flex items-center gap-1.5">
                {series.length > 1 && (
                  <span
                    className="size-2 rounded-sm"
                    style={{ backgroundColor: v.color }}
                  />
                )}
                <span className="tabular-nums text-muted-foreground">
                  {series.length > 1 ? `${v.profileName}: ` : ""}
                  {Math.round(v.value)}% covered
                </span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function RadarChart({ series, axes }: RadarChartProps) {
  const chartSize = useChartHeight(440, 320)
  return (
    <div className="flex w-full items-center justify-center">
      <div style={{ height: chartSize, width: chartSize }}>
        <ParentSize>
          {({ width, height }) => (
            <RadarChartInner
              series={series}
              axes={axes}
              width={width}
              height={height ?? chartSize}
            />
          )}
        </ParentSize>
      </div>
    </div>
  )
}
