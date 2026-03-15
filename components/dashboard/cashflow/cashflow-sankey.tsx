"use client"

import { useMemo } from "react"
import { Sankey, Tooltip, ResponsiveContainer } from "recharts"
import type { SankeyNodeProps, SankeyLinkProps } from "recharts"
import type { WaterfallData } from "./waterfall-chart"

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

function buildSankeyData(data: WaterfallData): { nodes: { name: string }[]; links: { source: number; target: number; value: number }[] } {
  const { inflowTotal, outflowBreakdown, netSavings } = data
  const { discretionary, insurance, ilp, loans, tax } = outflowBreakdown

  const nodes = [
    { name: "Inflow" },
    { name: "Spending" },
    { name: "Insurance" },
    { name: "ILP" },
    { name: "Loans" },
    { name: "Tax" },
    { name: "Savings" },
  ]

  const links: { source: number; target: number; value: number }[] = []

  if (discretionary > 0) links.push({ source: 0, target: 1, value: discretionary })
  if (insurance > 0) links.push({ source: 0, target: 2, value: insurance })
  if (ilp > 0) links.push({ source: 0, target: 3, value: ilp })
  if (loans > 0) links.push({ source: 0, target: 4, value: loans })
  if (tax > 0) links.push({ source: 0, target: 5, value: tax })
  if (netSavings > 0) links.push({ source: 0, target: 6, value: netSavings })

  if (links.length === 0 && inflowTotal > 0) {
    links.push({ source: 0, target: 6, value: inflowTotal })
  }

  return { nodes, links }
}

function SankeyNode(props: SankeyNodeProps) {
  const { payload, x, y, width, height } = props
  const fill = NODE_COLORS[payload.name] ?? "var(--color-muted-foreground)"
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
    </g>
  )
}

function SankeyLink(props: SankeyLinkProps) {
  const {
    sourceX,
    targetX,
    sourceY,
    targetY,
    sourceControlX,
    targetControlX,
    sourceRelativeY,
    targetRelativeY,
    linkWidth,
    payload,
  } = props
  const targetName = payload.target?.name ?? ""
  const fill = NODE_COLORS[targetName] ?? "var(--color-muted-foreground)"
  const sy0 = sourceY + (sourceRelativeY ?? 0) * linkWidth
  const ty0 = targetY + (targetRelativeY ?? 0) * linkWidth
  const sy1 = sourceY + (sourceRelativeY ?? 0) * linkWidth + linkWidth
  const ty1 = targetY + (targetRelativeY ?? 0) * linkWidth + linkWidth
  const pathD = `M${sourceX},${sy0} C${sourceControlX},${sy0} ${targetControlX},${ty0} ${targetX},${ty0} L${targetX},${ty1} C${targetControlX},${ty1} ${sourceControlX},${sy1} ${sourceX},${sy1} Z`
  return <path d={pathD} fill={fill} fillOpacity={0.6} />
}

export function CashflowSankey({ data }: { data: WaterfallData }) {
  const sankeyData = useMemo(() => buildSankeyData(data), [data])

  const hasData = sankeyData.links.some((l) => l.value > 0)
  if (!hasData) {
    return (
      <div className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
        No cashflow data to display
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <Sankey
        data={sankeyData}
        node={SankeyNode}
        link={SankeyLink}
        nodeWidth={14}
        nodePadding={20}
        linkCurvature={0.5}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
      >
        <Tooltip
          formatter={(value) => [`$${Number(value).toLocaleString()}`, ""]}
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
          labelFormatter={(label) => String(label)}
        />
      </Sankey>
    </ResponsiveContainer>
  )
}
