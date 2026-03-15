"use client"

import { useMemo } from "react"
import { Sankey, Tooltip, ResponsiveContainer } from "recharts"
import type { SankeyNodeProps } from "recharts"
import type { WaterfallData } from "./waterfall-chart"
import { formatCurrency } from "@/lib/utils"

const POSITIVE_FILL = "var(--color-chart-positive)"
const NEGATIVE_FILL = "var(--color-chart-negative)"

const NODE_COLORS: Record<string, string> = {
  Inflow: POSITIVE_FILL,
  Savings: POSITIVE_FILL,
  Spending: NEGATIVE_FILL,
  Insurance: NEGATIVE_FILL,
  ILP: NEGATIVE_FILL,
  Loans: NEGATIVE_FILL,
  Tax: NEGATIVE_FILL,
}

type SankeyNodeData = { name: string; nodeValue?: number }

function buildSankeyData(data: WaterfallData): {
  nodes: SankeyNodeData[]
  links: { source: number; target: number; value: number }[]
} {
  const { inflowTotal, outflowBreakdown, netSavings } = data
  const { discretionary, insurance, ilp, loans, tax } = outflowBreakdown

  const nodes: SankeyNodeData[] = [
    { name: "Inflow", nodeValue: inflowTotal },
    { name: "Spending", nodeValue: discretionary },
    { name: "Insurance", nodeValue: insurance },
    { name: "ILP", nodeValue: ilp },
    { name: "Loans", nodeValue: loans },
    { name: "Tax", nodeValue: tax },
    { name: "Savings", nodeValue: netSavings },
  ]

  const links: { source: number; target: number; value: number }[] = []

  if (discretionary > 0) links.push({ source: 0, target: 1, value: discretionary })
  if (insurance > 0) links.push({ source: 0, target: 2, value: insurance })
  if (ilp > 0) links.push({ source: 0, target: 3, value: ilp })
  if (loans > 0) links.push({ source: 0, target: 4, value: loans })
  if (tax > 0) links.push({ source: 0, target: 5, value: tax })
  if (netSavings !== 0) links.push({ source: 0, target: 6, value: Math.abs(netSavings) })

  if (links.length === 0 && inflowTotal > 0) {
    links.push({ source: 0, target: 6, value: inflowTotal })
  }

  return { nodes, links }
}

function SankeyNode(props: SankeyNodeProps) {
  const { payload, x, y, width, height } = props
  const fill = NODE_COLORS[payload.name] ?? "var(--color-muted-foreground)"
  const displayValue = (payload as { nodeValue?: number }).nodeValue ?? Number(payload.value ?? 0)
  const isSourceNode = payload.name === "Inflow"
  const label = `${payload.name}: ${displayValue >= 0 ? "$" : "-$"}${formatCurrency(Math.abs(displayValue))}`
  const textX = isSourceNode ? (x ?? 0) + (width ?? 0) + 8 : (x ?? 0) - 8
  const textY = (y ?? 0) + (height ?? 0) / 2
  const textAnchor = isSourceNode ? "start" : "end"

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      {displayValue !== 0 && (
        <text
          x={textX}
          y={textY}
          textAnchor={textAnchor}
          dominantBaseline="middle"
          fill="var(--color-foreground)"
          fontSize={12}
        >
          {label}
        </text>
      )}
    </g>
  )
}

export function CashflowSankey({ data }: { data: WaterfallData }) {
  const sankeyData = useMemo(() => buildSankeyData(data), [data])

  const hasData = sankeyData.links.some((l) => l.value > 0)
  if (!hasData) {
    return (
      <div className="flex min-h-[340px] items-center justify-center text-muted-foreground text-sm">
        No cashflow data to display
      </div>
    )
  }

  return (
    <div className="w-full overflow-visible">
      <ResponsiveContainer width="100%" height={340}>
        <Sankey
          data={sankeyData}
          node={SankeyNode}
          link={{
            fill: "var(--color-muted-foreground)",
            fillOpacity: 0.4,
          }}
          nodeWidth={14}
          nodePadding={24}
          linkCurvature={0.5}
          margin={{ top: 40, right: 100, bottom: 40, left: 100 }}
          sort={false}
        >
        <Tooltip
          formatter={(value) => [`$${formatCurrency(Number(value ?? 0))}`, ""]}
          labelFormatter={(label) =>
            typeof label === "string" ? label.replace(" - ", " → ") : String(label ?? "")
          }
          contentStyle={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            color: "var(--color-card-foreground)",
            padding: "10px 12px",
          }}
          labelStyle={{
            color: "var(--color-card-foreground)",
            marginBottom: "4px",
          }}
          itemStyle={{
            color: "var(--color-card-foreground)",
          }}
        />
        </Sankey>
      </ResponsiveContainer>
    </div>
  )
}
