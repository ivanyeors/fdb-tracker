"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Bar } from "@visx/shape"
import { Group } from "@visx/group"
import { scaleBand, scaleLinear } from "@visx/scale"
import { AxisLeft } from "@visx/axis"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import { ChevronDown, Landmark, TrendingUp, Building2 } from "lucide-react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { formatCurrency } from "@/lib/utils"
import type {
  WaterfallBarItem,
  WaterfallDataV2,
  InvestmentWaterfallSection,
  CpfWaterfallSection,
  WaterfallData,
} from "./waterfall-chart"

/* ------------------------------------------------------------------ */
/*  Bar builders per section                                           */
/* ------------------------------------------------------------------ */

function buildBankBars(data: WaterfallData): WaterfallBarItem[] {
  const bars: WaterfallBarItem[] = []
  let cumulative = 0

  if (data.startingBankBalance != null) {
    bars.push({
      name: "Starting Balance",
      start: 0,
      end: data.startingBankBalance,
      value: data.startingBankBalance,
      type: "anchor",
    })
    cumulative = data.startingBankBalance
  }

  const ib = data.inflowBreakdown
  const inflowItems: { name: string; value: number }[] = []
  if (ib) {
    if (ib.salary && ib.salary > 0) inflowItems.push({ name: "Salary", value: ib.salary })
    if (ib.bonus && ib.bonus > 0) inflowItems.push({ name: "Bonus", value: ib.bonus })
    if (ib.bankInterest && ib.bankInterest > 0)
      inflowItems.push({ name: "Bank Interest", value: ib.bankInterest })
    if (ib.income && ib.income > 0) inflowItems.push({ name: "Other Income", value: ib.income })
  }
  if (inflowItems.length === 0 && data.inflowTotal > 0) {
    inflowItems.push({ name: "Total Inflow", value: data.inflowTotal })
  }
  for (const item of inflowItems) {
    bars.push({ name: item.name, start: cumulative, end: cumulative + item.value, value: item.value, type: "inflow" })
    cumulative += item.value
  }

  const ob = data.outflowBreakdown
  const outflowItems = [
    { name: "Spending", value: ob.discretionary },
    { name: "Insurance", value: ob.insurance },
    { name: "ILP", value: ob.ilp + ob.ilpOneTime },
    { name: "Loans", value: ob.loans + ob.earlyRepayments },
    { name: "Tax", value: ob.tax },
    { name: "SRS/CPF Top-ups", value: ob.taxReliefCash },
    { name: "Savings Goals", value: ob.savingsGoals },
    { name: "Investments", value: ob.investments },
    { name: "GIRO Transfers", value: ob.giroTransfers ?? 0 },
  ]
  for (const item of outflowItems) {
    if (item.value > 0) {
      bars.push({ name: item.name, start: cumulative, end: cumulative - item.value, value: -item.value, type: "outflow" })
      cumulative -= item.value
    }
  }

  if (data.endingBankBalance != null) {
    bars.push({ name: "Ending Balance", start: 0, end: data.endingBankBalance, value: data.endingBankBalance, type: "anchor" })
  }

  return bars
}

function buildInvestmentBars(data: InvestmentWaterfallSection): WaterfallBarItem[] {
  const bars: WaterfallBarItem[] = []
  let cumulative = data.startingValue

  bars.push({ name: "Starting Value", start: 0, end: data.startingValue, value: data.startingValue, type: "anchor" })

  if (data.dividends > 0) {
    bars.push({ name: "Dividends", start: cumulative, end: cumulative + data.dividends, value: data.dividends, type: "inflow" })
    cumulative += data.dividends
  }
  if (data.marketGain !== 0) {
    const label = data.marketGain >= 0 ? "Market Gain" : "Market Loss"
    const type = data.marketGain >= 0 ? "inflow" : "outflow"
    bars.push({ name: label, start: cumulative, end: cumulative + data.marketGain, value: data.marketGain, type })
    cumulative += data.marketGain
  }

  bars.push({ name: "Ending Value", start: 0, end: data.endingValue, value: data.endingValue, type: "anchor" })

  return bars
}

function buildCpfBars(data: CpfWaterfallSection): WaterfallBarItem[] {
  const bars: WaterfallBarItem[] = []
  let cumulative = data.startingBalance

  bars.push({ name: "Starting Balance", start: 0, end: data.startingBalance, value: data.startingBalance, type: "anchor" })

  if (data.contributions > 0) {
    bars.push({ name: "Contributions", start: cumulative, end: cumulative + data.contributions, value: data.contributions, type: "inflow" })
    cumulative += data.contributions
  }
  if (data.housing > 0) {
    bars.push({ name: "Housing (OA)", start: cumulative, end: cumulative - data.housing, value: -data.housing, type: "outflow" })
    cumulative -= data.housing
  }

  bars.push({ name: "Ending Balance", start: 0, end: data.endingBalance, value: data.endingBalance, type: "anchor" })

  return bars
}

/* ------------------------------------------------------------------ */
/*  Reusable mini-chart                                                */
/* ------------------------------------------------------------------ */

const POSITIVE_FILL = "var(--color-chart-positive)"
const NEGATIVE_FILL = "var(--color-chart-negative)"
const NEUTRAL_FILL = "var(--color-muted-foreground)"
const MARGIN = { top: 4, right: 68, left: 110, bottom: 4 }

function fmtValue(value: number, isAnchor = false): string {
  if (isAnchor)
    return `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `${value >= 0 ? "+" : ""}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function WaterfallMiniChart({ bars, width }: { bars: WaterfallBarItem[]; width: number }) {
  const height = bars.length * 28
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<WaterfallBarItem>()

  const xMax = width - MARGIN.left - MARGIN.right
  const yMax = height - MARGIN.top - MARGIN.bottom

  const xDomain = useMemo(() => {
    const values = bars.flatMap((d) => [d.start, d.end])
    const minVal = Math.min(0, ...values)
    const maxVal = Math.max(0, ...values)
    return [minVal, maxVal] as [number, number]
  }, [bars])

  const xScale = useMemo(
    () => scaleLinear<number>({ range: [0, xMax], domain: xDomain, nice: true }),
    [xMax, xDomain],
  )
  const yScale = useMemo(
    () => scaleBand<string>({ range: [0, yMax], domain: bars.map((d) => d.name), padding: 0.2 }),
    [yMax, bars],
  )

  // Connectors between non-anchor bars — connect bar bottom edge to next bar top edge
  const connectors = useMemo(() => {
    const result: { x: number; yTop: number; yBottom: number; dashed: boolean }[] = []
    const bw = yScale.bandwidth() ?? 0
    const barH = Math.max(bw * 0.6, 4)
    const barOffset = (bw - barH) / 2

    for (let i = 0; i < bars.length - 1; i++) {
      const curr = bars[i]!
      const next = bars[i + 1]!
      if (next.type === "anchor" || next.type === "net") continue
      const xVal = curr.end
      // Bottom edge of current bar
      const yTop = (yScale(curr.name) ?? 0) + barOffset + barH
      // Top edge of next bar
      const yBottom = (yScale(next.name) ?? 0) + barOffset
      result.push({ x: xScale(xVal) ?? 0, yTop, yBottom, dashed: curr.type === "anchor" })
    }
    return result
  }, [bars, yScale, xScale])

  if (width < 10 || bars.length === 0) return null

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <AxisLeft
            scale={yScale}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({
              fill: "var(--color-muted-foreground)",
              fontSize: 11,
              textAnchor: "end" as const,
            })}
          />
          {bars.map((bar) => {
            const barHeight = Math.max((yScale.bandwidth() ?? 0) * 0.6, 4)
            const barY = (yScale(bar.name) ?? 0) + ((yScale.bandwidth() ?? 0) - barHeight) / 2
            const xStart = Math.min(bar.start, bar.end)
            const xEnd = Math.max(bar.start, bar.end)
            const barX = xScale(xStart) ?? 0
            const barWidth = Math.max((xScale(xEnd) ?? 0) - barX, 2)
            const isAnchor = bar.type === "anchor"
            const fill = isAnchor ? NEUTRAL_FILL : bar.value >= 0 ? POSITIVE_FILL : NEGATIVE_FILL

            return (
              <g key={bar.name}>
                <Bar
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill={fill}
                  fillOpacity={isAnchor ? 0.5 : 1}
                  rx={2}
                  ry={2}
                  onMouseMove={(e) =>
                    showTooltip({ tooltipData: bar, tooltipLeft: e.clientX, tooltipTop: e.clientY })
                  }
                  onMouseLeave={hideTooltip}
                />
                <text
                  x={bar.value >= 0 || isAnchor ? barX + barWidth + 6 : barX - 6}
                  y={barY + barHeight / 2}
                  textAnchor={bar.value >= 0 || isAnchor ? "start" : "end"}
                  dominantBaseline="middle"
                  fill="var(--color-foreground)"
                  fontSize={11}
                >
                  {fmtValue(bar.value, isAnchor)}
                </text>
              </g>
            )
          })}
          {connectors.map((c, idx) => (
            <line
              key={idx}
              x1={c.x}
              y1={c.yTop}
              x2={c.x}
              y2={c.yBottom}
              stroke="var(--color-foreground)"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeDasharray={c.dashed ? "4 3" : undefined}
            />
          ))}
        </Group>
      </svg>
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none z-[9999] max-w-[min(280px,calc(100vw-24px))] rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-lg"
            style={{ position: "fixed", left: tooltipLeft, top: tooltipTop, transform: "translate(12px, 12px)", fontSize: 12 }}
          >
            <div className="font-medium">{tooltipData.name}</div>
            <div>{fmtValue(tooltipData.value, tooltipData.type === "anchor")}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon: Icon,
  label,
  endValue,
  isOpen,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  endValue: number
  isOpen: boolean
}) {
  return (
    <div className="flex w-full items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-muted-foreground">${formatCurrency(endValue)}</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Total bar                                                          */
/* ------------------------------------------------------------------ */

function TotalBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="tabular-nums font-semibold">${formatCurrency(value)}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function SectionedWaterfall({ data }: { data: WaterfallDataV2 }) {
  const [bankOpen, setBankOpen] = useState(true)
  const [investOpen, setInvestOpen] = useState(true)
  const [cpfOpen, setCpfOpen] = useState(true)

  const bankBars = useMemo(() => buildBankBars(data), [data])
  const investBars = useMemo(
    () => (data.investments ? buildInvestmentBars(data.investments) : []),
    [data.investments],
  )
  const cpfBars = useMemo(
    () => (data.cpf ? buildCpfBars(data.cpf) : []),
    [data.cpf],
  )

  const hasInvestments = data.investments && (data.investments.startingValue > 0 || data.investments.endingValue > 0)
  const hasCpf = data.cpf && (data.cpf.startingBalance > 0 || data.cpf.endingBalance > 0 || data.cpf.contributions > 0)

  const totalStarting =
    (data.startingBankBalance ?? 0) +
    (data.investments?.startingValue ?? 0) +
    (data.cpf?.startingBalance ?? 0)

  const totalEnding =
    (data.endingBankBalance ?? 0) +
    (data.investments?.endingValue ?? 0) +
    (data.cpf?.endingBalance ?? 0)

  const hasNoData =
    data.inflowTotal === 0 && data.outflowTotal === 0 && data.netSavings === 0

  if (hasNoData) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
        No data to display for this month
      </div>
    )
  }

  return (
    <div className="space-y-0">
      <TotalBar label="Total Starting" value={totalStarting} />

      {/* Bank Section */}
      <Collapsible open={bankOpen} onOpenChange={setBankOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full cursor-pointer hover:bg-muted/30 rounded-md px-1 transition-colors">
            <SectionHeader
              icon={Landmark}
              label="Bank"
              endValue={data.endingBankBalance ?? 0}
              isOpen={bankOpen}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ParentSize>
            {({ width }) => <WaterfallMiniChart bars={bankBars} width={width} />}
          </ParentSize>
        </CollapsibleContent>
      </Collapsible>

      {/* Investments Section */}
      {hasInvestments && (
        <>
          <hr className="border-border" />
          <Collapsible open={investOpen} onOpenChange={setInvestOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full cursor-pointer hover:bg-muted/30 rounded-md px-1 transition-colors">
                <SectionHeader
                  icon={TrendingUp}
                  label="Investments"
                  endValue={data.investments?.endingValue ?? 0}
                  isOpen={investOpen}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ParentSize>
                {({ width }) => <WaterfallMiniChart bars={investBars} width={width} />}
              </ParentSize>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* CPF Section */}
      {hasCpf && (
        <>
          <hr className="border-border" />
          <Collapsible open={cpfOpen} onOpenChange={setCpfOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full cursor-pointer hover:bg-muted/30 rounded-md px-1 transition-colors">
                <SectionHeader
                  icon={Building2}
                  label="CPF"
                  endValue={data.cpf?.endingBalance ?? 0}
                  isOpen={cpfOpen}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ParentSize>
                {({ width }) => <WaterfallMiniChart bars={cpfBars} width={width} />}
              </ParentSize>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      <TotalBar label="Total Ending" value={totalEnding} />
    </div>
  )
}
