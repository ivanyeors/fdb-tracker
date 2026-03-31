"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { Sankey, sankeyCenter } from "@visx/sankey"
import { useChartHeight } from "@/hooks/use-chart-height"
import { Group } from "@visx/group"
import { BarRounded, LinkHorizontal } from "@visx/shape"
import { useTooltip } from "@visx/tooltip"
import { ParentSize } from "@visx/responsive"
import type { SankeyNode } from "@visx/sankey"
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
  "ILP (One-Time)": NEGATIVE_FILL,
  Loans: NEGATIVE_FILL,
  "Early Repayments": NEGATIVE_FILL,
  Tax: NEGATIVE_FILL,
  "SRS/CPF Top-ups": NEGATIVE_FILL,
  "Savings Goals": NEGATIVE_FILL,
  Investments: NEGATIVE_FILL,
}

type SankeyNodeDatum = { name: string }
type SankeyLinkDatum = object

function buildSankeyData(data: WaterfallData): {
  nodes: SankeyNodeDatum[]
  links: { source: number; target: number; value: number }[]
} {
  const { inflowTotal, outflowBreakdown, netSavings } = data
  const ob = outflowBreakdown

  const outflowItems: { name: string; value: number }[] = [
    { name: "Spending", value: ob.discretionary },
    { name: "Insurance", value: ob.insurance },
    { name: "ILP", value: ob.ilp + ob.ilpOneTime },
    { name: "Loans", value: ob.loans + ob.earlyRepayments },
    { name: "Tax", value: ob.tax },
    { name: "SRS/CPF Top-ups", value: ob.taxReliefCash },
    { name: "Savings Goals", value: ob.savingsGoals },
    { name: "Investments", value: ob.investments },
  ].filter((item) => item.value > 0)

  const nodes: SankeyNodeDatum[] = [
    { name: "Inflow" },
    ...outflowItems.map((item) => ({ name: item.name })),
    { name: "Savings" },
  ]

  const links: { source: number; target: number; value: number }[] = []

  outflowItems.forEach((item, i) => {
    links.push({ source: 0, target: i + 1, value: item.value })
  })

  const savingsIdx = nodes.length - 1
  if (netSavings !== 0) links.push({ source: 0, target: savingsIdx, value: Math.abs(netSavings) })

  if (links.length === 0 && inflowTotal > 0) {
    links.push({ source: 0, target: savingsIdx, value: inflowTotal })
  }

  return { nodes, links }
}

function CashflowSankeyInner({
  data,
  width,
  height,
}: {
  data: WaterfallData
  width: number
  height: number
}) {
  const sankeyData = useMemo(() => buildSankeyData(data), [data])
  const root = useMemo(
    () =>
      ({
        nodes: sankeyData.nodes.map((n) => ({ ...n })),
        links: sankeyData.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
      }) as { nodes: SankeyNodeDatum[]; links: { source: number; target: number; value: number }[] },
    [sankeyData]
  )
  const inflowTotal = data.inflowTotal
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, hideTooltip, showTooltip } = useTooltip<{
    type: "link" | "node"
    label: string
    value?: number
    pctOfInflow?: number
  }>()

  const hasData = sankeyData.links.some((l) => l.value > 0)
  if (!hasData) {
    return (
      <div className="flex min-h-[340px] items-center justify-center text-muted-foreground text-sm">
        No cashflow data to display
      </div>
    )
  }

  const xMax = width - 200
  const yMax = height - 80

  if (width < 10) return null

  return (
    <div className="relative w-full">
      <svg width={width} height={height}>
        <Sankey<SankeyNodeDatum, SankeyLinkDatum>
          root={root}
          size={[xMax, yMax]}
          nodeWidth={14}
          nodePadding={24}
          nodeAlign={sankeyCenter}
        >
          {({ graph, createPath }) => (
            <Group top={40} left={100}>
              {graph.links.map((link, i) => {
                const sourceNode = link.source as SankeyNode<SankeyNodeDatum, SankeyLinkDatum>
                const targetNode = link.target as SankeyNode<SankeyNodeDatum, SankeyLinkDatum>
                const fill = NODE_COLORS[sourceNode.name] ?? "var(--color-muted-foreground)"
                return (
                  <LinkHorizontal
                    key={i}
                    data={link}
                    path={createPath}
                    fill="transparent"
                    stroke={fill}
                    strokeWidth={Math.max(link.width ?? 0, 1)}
                    strokeOpacity={0.4}
                    onMouseMove={(e) => {
                      const pctOfInflow =
                        inflowTotal > 0 ? (link.value / inflowTotal) * 100 : undefined
                      showTooltip({
                        tooltipData: {
                          type: "link",
                          label: `${sourceNode.name} → ${targetNode.name}`,
                          value: link.value,
                          pctOfInflow,
                        },
                        tooltipLeft: e.clientX,
                        tooltipTop: e.clientY,
                      })
                    }}
                    onMouseLeave={hideTooltip}
                  />
                )
              })}
              {graph.nodes.map((node, i) => {
                const fill = NODE_COLORS[node.name] ?? "var(--color-muted-foreground)"
                const nodeValue = node.value ?? 0
                const isSourceNode = node.name === "Inflow"
                const label = `${node.name}: $${formatCurrency(nodeValue)}`
                const x0 = node.x0 ?? 0
                const x1 = node.x1 ?? 0
                const y0 = node.y0 ?? 0
                const y1 = node.y1 ?? 0

                return (
                  <Group key={i}>
                    <BarRounded
                      x={x0}
                      y={y0}
                      width={x1 - x0}
                      height={y1 - y0}
                      radius={3}
                      fill={fill}
                      stroke="var(--color-border)"
                      strokeWidth={1}
                      all
                      onMouseMove={(e) => {
                        const pctOfInflow =
                          inflowTotal > 0 && nodeValue > 0
                            ? (nodeValue / inflowTotal) * 100
                            : undefined
                        showTooltip({
                          tooltipData: {
                            type: "node",
                            label: node.name,
                            value: nodeValue,
                            pctOfInflow,
                          },
                          tooltipLeft: e.clientX,
                          tooltipTop: e.clientY,
                        })
                      }}
                      onMouseLeave={hideTooltip}
                    />
                    {nodeValue !== 0 && (
                      <text
                        x={isSourceNode ? x1 + 8 : x0 - 8}
                        y={y0 + (y1 - y0) / 2}
                        textAnchor={isSourceNode ? "start" : "end"}
                        dominantBaseline="middle"
                        fill="var(--color-foreground)"
                        fontSize={12}
                      >
                        {label}
                      </text>
                    )}
                  </Group>
                )
              })}
            </Group>
          )}
        </Sankey>
      </svg>
      {tooltipOpen &&
        tooltipData &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={`${tooltipData.label}-${tooltipLeft}-${tooltipTop}`}
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
            <div className="font-medium">{tooltipData.label}</div>
            {tooltipData.value !== undefined && (
              <div>
                ${formatCurrency(tooltipData.value)}
                {tooltipData.pctOfInflow != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({tooltipData.pctOfInflow.toFixed(1)}% of inflow)
                  </span>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function CashflowSankey({ data }: { data: WaterfallData }) {
  const chartHeight = useChartHeight(340, 240)
  return (
    <div className="w-full overflow-visible" style={{ height: chartHeight }}>
      <ParentSize>
        {({ width, height }) => (
          <CashflowSankeyInner data={data} width={width} height={height ?? chartHeight} />
        )}
      </ParentSize>
    </div>
  )
}
