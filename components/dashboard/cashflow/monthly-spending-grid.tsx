"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { Pie } from "@visx/shape"
import { Group } from "@visx/group"
import { useTooltip } from "@visx/tooltip"
import { formatCurrency } from "@/lib/utils"
import { createCategoryColorScale } from "@/lib/chart-colors"
import { cn } from "@/lib/utils"

interface CategoryData {
  name: string
  total: number
  count: number
}

interface MonthData {
  month: string
  categories: CategoryData[]
}

interface MonthlySpendingGridProps {
  readonly data: MonthData[]
}

interface TooltipData {
  name: string
  total: number
  percentage: number
  month: string
  monthTotal: number
}

function formatMonth(month: string): string {
  const d = new Date(month + "T00:00:00")
  return d.toLocaleDateString("en-SG", { month: "short", year: "2-digit" })
}

function generateMonthRange(): string[] {
  const year = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0")
    return `${year}-${m}-01`
  })
}

export function MonthlySpendingGrid({ data }: MonthlySpendingGridProps) {
  const months = useMemo(() => generateMonthRange(), [])
  const dataMap = useMemo(() => {
    const map = new Map<string, CategoryData[]>()
    for (const d of data) map.set(d.month, d.categories)
    return map
  }, [data])

  // Unified color scale across all months
  const colorScale = useMemo(() => {
    const allNames: string[] = []
    for (const d of data) {
      for (const c of d.categories) {
        if (!allNames.includes(c.name)) allNames.push(c.name)
      }
    }
    return createCategoryColorScale(allNames)
  }, [data])

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>()

  return (
    <div className="relative">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {months.map((month, i) => {
          const categories = dataMap.get(month) ?? []
          const total = categories.reduce((s, c) => s + c.total, 0)
          const isLastCol2 = (i + 1) % 2 === 0
          const isLastCol4 = (i + 1) % 4 === 0
          const isLastRow2 = i >= 10
          const isLastRow4 = i >= 8

          return (
            <div
              key={month}
              className={cn(
                "flex flex-col items-center px-3 py-4",
                // Mobile (2-col): right border except last in row, bottom border except last row
                !isLastCol2 && "border-r lg:border-r-0",
                !isLastRow2 && "border-b lg:border-b-0",
                // Desktop (4-col): right border except last in row, bottom border except last row
                !isLastCol4 && "lg:border-r",
                !isLastRow4 && "lg:border-b"
              )}
            >
              <span className="mb-2 text-xs font-medium text-muted-foreground">
                {formatMonth(month)}
              </span>

              {categories.length > 0 ? (
                <MiniDonut
                  categories={categories}
                  total={total}
                  month={month}
                  colorScale={colorScale}
                  showTooltip={showTooltip}
                  hideTooltip={hideTooltip}
                />
              ) : (
                <div className="flex h-[100px] w-[100px] items-center justify-center">
                  <span className="text-xs text-muted-foreground/50">
                    No data
                  </span>
                </div>
              )}

              {total > 0 && (
                <span className="mt-1.5 text-xs font-medium tabular-nums">
                  ${formatCurrency(total)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Tooltip portal */}
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={`${tooltipData.name}-${tooltipLeft}-${tooltipTop}`}
            role="tooltip"
            className="pointer-events-none z-[9999] max-w-[min(240px,calc(100vw-24px))] rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-lg"
            style={{
              position: "fixed",
              left: tooltipLeft,
              top: tooltipTop,
              transform: "translate(12px, 12px)",
              fontSize: 12,
            }}
          >
            <div className="font-medium text-foreground">
              {tooltipData.name}
            </div>
            <div className="mt-0.5 text-muted-foreground">
              ${formatCurrency(tooltipData.total)} ·{" "}
              {tooltipData.percentage.toFixed(1)}%
            </div>
            <div className="mt-0.5 text-muted-foreground">
              of ${formatCurrency(tooltipData.monthTotal)} in{" "}
              {formatMonth(tooltipData.month)}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function MiniDonut({
  categories,
  total,
  month,
  colorScale,
  showTooltip,
  hideTooltip,
}: {
  readonly categories: CategoryData[]
  readonly total: number
  readonly month: string
  readonly colorScale: ReturnType<typeof createCategoryColorScale>
  readonly showTooltip: (args: {
    tooltipData: TooltipData
    tooltipLeft: number
    tooltipTop: number
  }) => void
  readonly hideTooltip: () => void
}) {
  const size = 100
  const radius = size / 2
  const innerRadius = radius * 0.55

  return (
    <svg width={size} height={size}>
      <Group top={radius} left={radius}>
        <Pie
          data={categories}
          pieValue={(d) => d.total}
          outerRadius={radius - 2}
          innerRadius={innerRadius}
          padAngle={0.02}
        >
          {(pie) =>
            pie.arcs.map((arc) => {
              const pct =
                total > 0
                  ? Math.round((arc.data.total / total) * 1000) / 10
                  : 0
              return (
                <path
                  key={`arc-${arc.data.name}`}
                  d={pie.path(arc) ?? ""}
                  fill={colorScale(arc.data.name)}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onMouseMove={(e) => {
                    showTooltip({
                      tooltipData: {
                        name: arc.data.name,
                        total: arc.data.total,
                        percentage: pct,
                        month,
                        monthTotal: total,
                      },
                      tooltipLeft: e.clientX,
                      tooltipTop: e.clientY,
                    })
                  }}
                  onMouseLeave={hideTooltip}
                />
              )
            })
          }
        </Pie>
      </Group>
    </svg>
  )
}
