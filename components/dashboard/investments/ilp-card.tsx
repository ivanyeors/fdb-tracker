"use client"

import { useMemo } from "react"
import { LinePath } from "@visx/shape"
import { curveMonotoneX } from "@visx/curve"
import { scalePoint, scaleLinear } from "@visx/scale"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { useTooltip, TooltipWithBounds } from "@visx/tooltip"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { AddIlpEntryDialog } from "@/components/dashboard/investments/add-ilp-entry-dialog"
import { EditIlpDialog } from "@/components/dashboard/investments/edit-ilp-dialog"

interface MonthlyData {
  month: string
  value: number
}

interface IlpCardProps {
  productId?: string
  name: string
  fundValue: number
  totalPremiumsPaid: number
  returnPct: number
  monthlyPremium: number
  endDate?: string
  monthlyData: MonthlyData[]
  onAddEntry?: () => void
  onEditSuccess?: () => void
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-")
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const m = parseInt(month ?? "1", 10) - 1
  return `${monthNames[m] ?? month} ${year ?? ""}`
}

function IlpLineChart({
  data,
  stroke,
  width,
  height,
}: {
  data: MonthlyData[]
  stroke: string
  width: number
  height: number
}) {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<MonthlyData>()

  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: data.map((d) => d.month),
        range: [0, width],
        padding: 0.5,
      }),
    [data, width]
  )

  const yScale = useMemo(() => {
    const values = data.map((d) => d.value)
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 0)
    const padding = (max - min) * 0.1 || 1
    return scaleLinear<number>({
      domain: [min - padding, max + padding],
      range: [height, 0],
    })
  }, [data, height])

  if (data.length === 0 || width < 10) return null

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group>
          <LinePath<MonthlyData>
            data={data}
            x={(d) => (xScale(d.month) ?? 0) + (xScale.step() ?? 0) / 2}
            y={(d) => yScale(d.value) ?? 0}
            curve={curveMonotoneX}
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={(xScale(d.month) ?? 0) + (xScale.step() ?? 0) / 2}
              cy={yScale(d.value) ?? 0}
              r={6}
              fill="transparent"
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
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.month}-${tooltipLeft}-${tooltipTop}`}
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
          <div className="font-medium">{formatMonth(tooltipData.month)}</div>
          <div>${fmt(tooltipData.value)}</div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

export function IlpCard({
  productId,
  name,
  fundValue,
  totalPremiumsPaid,
  returnPct,
  monthlyPremium,
  endDate,
  monthlyData,
  onAddEntry,
  onEditSuccess,
}: IlpCardProps) {
  const stroke =
    returnPct >= 0 ? "var(--color-chart-positive)" : "var(--color-chart-negative)"

  return (
    <Card className="h-[200px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-base font-bold">{name}</CardTitle>
        {productId && (
          <div className="flex items-center gap-1">
            <EditIlpDialog
              productId={productId}
              productName={name}
              monthlyPremium={monthlyPremium}
              endDate={endDate ?? ""}
              onSuccess={onEditSuccess ?? onAddEntry}
            />
            <AddIlpEntryDialog
              productId={productId}
              productName={name}
              onSuccess={onAddEntry}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fund Value</span>
            <span className="font-medium">${fmt(fundValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Premiums Paid</span>
            <span className="font-medium">${fmt(totalPremiumsPaid)}</span>
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
            <span className="text-muted-foreground">Monthly Premium</span>
            <span className="font-medium">${fmt(monthlyPremium)}</span>
          </div>
        </div>
        <div className="h-16 w-24 self-center">
          <ParentSize>
            {({ width, height }) => (
              <IlpLineChart
                data={monthlyData}
                stroke={stroke}
                width={width}
                height={height ?? 64}
              />
            )}
          </ParentSize>
        </div>
      </CardContent>
    </Card>
  )
}
