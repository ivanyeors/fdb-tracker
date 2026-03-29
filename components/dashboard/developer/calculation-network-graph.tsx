"use client"

import { useState, useMemo } from "react"
import { ParentSize } from "@visx/responsive"
import { Group } from "@visx/group"
import {
  GRAPH_NODES,
  GRAPH_LINKS,
  NODE_COLORS,
  type CalcGraphLink,
  type CalcGraphNode,
  type GraphNodeType,
} from "@/lib/developer/calculation-graph-data"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const NODE_RADIUS = 24
const LABEL_FONT_SIZE = 10

const TYPE_COLUMN_ORDER: GraphNodeType[] = [
  "cashflow",
  "cpf",
  "tax",
  "bank",
  "loan",
  "investment",
  "insurance",
  "goal",
]

const TYPE_LABELS: Record<GraphNodeType, string> = {
  cashflow: "Cashflow",
  cpf: "CPF",
  tax: "Tax",
  bank: "Bank",
  loan: "Loan",
  investment: "Investment",
  insurance: "Insurance",
  goal: "Goal",
}

type PositionedNode = CalcGraphNode & { x: number; y: number }

function computeLayout(
  width: number,
  height: number
): Map<string, PositionedNode> {
  const nodesByType = new Map<GraphNodeType, CalcGraphNode[]>()
  for (const node of GRAPH_NODES) {
    const list = nodesByType.get(node.type) || []
    list.push(node)
    nodesByType.set(node.type, list)
  }

  const colCount = TYPE_COLUMN_ORDER.length
  const colWidth = width / colCount
  const padding = 60

  const positioned = new Map<string, PositionedNode>()

  for (let col = 0; col < colCount; col++) {
    const type = TYPE_COLUMN_ORDER[col]
    const nodes = nodesByType.get(type) || []
    const rowCount = nodes.length
    const availableHeight = height - padding * 2
    const rowHeight = rowCount > 1 ? availableHeight / (rowCount - 1) : 0

    for (let row = 0; row < rowCount; row++) {
      const node = nodes[row]
      const x = colWidth * col + colWidth / 2
      const y =
        rowCount === 1
          ? height / 2
          : padding + row * rowHeight
      positioned.set(node.id, { ...node, x, y })
    }
  }

  return positioned
}

function bezierPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number
): string {
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2
  const dx = tx - sx
  const dy = ty - sy
  const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.3 + 20
  const perpX = -dy / (Math.sqrt(dx * dx + dy * dy) || 1)
  const perpY = dx / (Math.sqrt(dx * dx + dy * dy) || 1)
  const cx = mx + perpX * offset
  const cy = my + perpY * offset
  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`
}

function NetworkGraphInner({
  width,
  height,
}: {
  width: number
  height: number
}) {
  const [selectedLink, setSelectedLink] = useState<CalcGraphLink | null>(null)
  const [hoveredLink, setHoveredLink] = useState<number | null>(null)

  const nodeMap = useMemo(() => computeLayout(width, height), [width, height])

  if (width < 100 || height < 100) return null

  return (
    <>
      <svg width={width} height={height} className="select-none">
        <rect width={width} height={height} fill="transparent" />
        <Group>
          {GRAPH_LINKS.map((link, i) => {
            const source = nodeMap.get(link.source)
            const target = nodeMap.get(link.target)
            if (!source || !target) return null

            const isSelected =
              selectedLink?.source === link.source &&
              selectedLink?.target === link.target &&
              selectedLink?.calculationName === link.calculationName
            const isHovered = hoveredLink === i

            return (
              <path
                key={`link-${i}`}
                d={bezierPath(source.x, source.y, target.x, target.y)}
                fill="none"
                stroke={isSelected ? "#f97316" : "#94a3b8"}
                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
                strokeOpacity={isSelected ? 0.9 : isHovered ? 0.7 : 0.3}
                className="cursor-pointer transition-all duration-150"
                onClick={() => setSelectedLink(link)}
                onMouseEnter={() => setHoveredLink(i)}
                onMouseLeave={() => setHoveredLink(null)}
                pointerEvents="stroke"
                strokeLinecap="round"
              />
            )
          })}

          {/* Wider invisible hit areas for links */}
          {GRAPH_LINKS.map((link, i) => {
            const source = nodeMap.get(link.source)
            const target = nodeMap.get(link.target)
            if (!source || !target) return null

            return (
              <path
                key={`hit-${i}`}
                d={bezierPath(source.x, source.y, target.x, target.y)}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                className="cursor-pointer"
                onClick={() => setSelectedLink(link)}
                onMouseEnter={() => setHoveredLink(i)}
                onMouseLeave={() => setHoveredLink(null)}
                pointerEvents="stroke"
              />
            )
          })}

          {Array.from(nodeMap.values()).map((node) => {
            const color = NODE_COLORS[node.type]
            return (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS}
                  fill={color}
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.5}
                  fillOpacity={0.85}
                />
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={LABEL_FONT_SIZE}
                  fontWeight={600}
                  pointerEvents="none"
                  className="select-none"
                >
                  {node.label.length > 12
                    ? node.label.slice(0, 11) + "..."
                    : node.label}
                </text>
                <text
                  x={node.x}
                  y={node.y + NODE_RADIUS + 14}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="currentColor"
                  fontSize={9}
                  className="select-none fill-muted-foreground"
                  pointerEvents="none"
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </Group>

        {/* Legend */}
        <Group top={12} left={12}>
          {TYPE_COLUMN_ORDER.map((type, i) => (
            <g key={type} transform={`translate(${i * 100}, 0)`}>
              <circle cx={6} cy={6} r={6} fill={NODE_COLORS[type]} />
              <text
                x={16}
                y={6}
                dominantBaseline="central"
                fill="currentColor"
                fontSize={11}
                className="fill-muted-foreground"
              >
                {TYPE_LABELS[type]}
              </text>
            </g>
          ))}
        </Group>
      </svg>

      <Dialog
        open={selectedLink !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLink(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedLink?.calculationName}</DialogTitle>
            <DialogDescription>
              {selectedLink
                ? `${nodeMap.get(selectedLink.source)?.label ?? selectedLink.source} → ${nodeMap.get(selectedLink.target)?.label ?? selectedLink.target}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedLink && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {selectedLink.description}
              </p>
              <div className="rounded-lg border bg-muted/50 px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {selectedLink.filePath}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        NODE_COLORS[
                          nodeMap.get(selectedLink.source)?.type ?? "cashflow"
                        ],
                    }}
                  />
                  <span>
                    {nodeMap.get(selectedLink.source)?.label ??
                      selectedLink.source}
                  </span>
                </div>
                <span>→</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        NODE_COLORS[
                          nodeMap.get(selectedLink.target)?.type ?? "cashflow"
                        ],
                    }}
                  />
                  <span>
                    {nodeMap.get(selectedLink.target)?.label ??
                      selectedLink.target}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CalculationNetworkGraph() {
  return (
    <ParentSize>
      {({ width, height }) => (
        <NetworkGraphInner width={width} height={height} />
      )}
    </ParentSize>
  )
}
