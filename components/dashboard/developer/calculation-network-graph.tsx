"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
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
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ZoomIn, ZoomOut, Maximize2, Lock, Unlock } from "lucide-react"

const NODE_RADIUS = 22
const LABEL_FONT_SIZE = 9
const CLUSTER_PADDING = 16

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

type LayoutMode = "grid" | "cluster" | "radial" | "force"
type PositionedNode = CalcGraphNode & { x: number; y: number }

// ----------- Layout algorithms -----------

function gridLayout(
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
      const y = rowCount === 1 ? height / 2 : padding + row * rowHeight
      positioned.set(node.id, { ...node, x, y })
    }
  }
  return positioned
}

function clusterLayout(
  width: number,
  height: number
): Map<string, PositionedNode> {
  const nodesByType = new Map<GraphNodeType, CalcGraphNode[]>()
  for (const node of GRAPH_NODES) {
    const list = nodesByType.get(node.type) || []
    list.push(node)
    nodesByType.set(node.type, list)
  }

  const types = TYPE_COLUMN_ORDER.filter((t) => nodesByType.has(t))
  const cols = Math.ceil(Math.sqrt(types.length))
  const rows = Math.ceil(types.length / cols)
  const cellW = width / cols
  const cellH = height / rows

  const positioned = new Map<string, PositionedNode>()
  types.forEach((type, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const cx = cellW * col + cellW / 2
    const cy = cellH * row + cellH / 2
    const nodes = nodesByType.get(type) || []
    const clusterRadius =
      Math.min(cellW, cellH) / 2 - NODE_RADIUS - CLUSTER_PADDING
    const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1)

    nodes.forEach((node, ni) => {
      const angle = angleStep * ni - Math.PI / 2
      const r =
        nodes.length === 1 ? 0 : Math.min(clusterRadius, 60 + nodes.length * 8)
      positioned.set(node.id, {
        ...node,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      })
    })
  })
  return positioned
}

function radialLayout(
  width: number,
  height: number
): Map<string, PositionedNode> {
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.min(width, height) / 2 - NODE_RADIUS - 30

  // Build depth map from links (BFS from nodes with no incoming edges)
  const incoming = new Map<string, Set<string>>()
  const outgoing = new Map<string, Set<string>>()
  for (const link of GRAPH_LINKS) {
    if (!incoming.has(link.target)) incoming.set(link.target, new Set())
    incoming.get(link.target)!.add(link.source)
    if (!outgoing.has(link.source)) outgoing.set(link.source, new Set())
    outgoing.get(link.source)!.add(link.target)
  }

  const roots = GRAPH_NODES.filter(
    (n) => !incoming.has(n.id) || incoming.get(n.id)!.size === 0
  )
  const depth = new Map<string, number>()
  const queue = roots.map((r) => ({ id: r.id, d: 0 }))
  const visited = new Set<string>()
  for (const r of queue) {
    depth.set(r.id, 0)
    visited.add(r.id)
  }
  while (queue.length > 0) {
    const { id, d } = queue.shift()!
    const targets = outgoing.get(id)
    if (targets) {
      for (const t of targets) {
        if (!visited.has(t)) {
          visited.add(t)
          depth.set(t, d + 1)
          queue.push({ id: t, d: d + 1 })
        }
      }
    }
  }
  // Assign unvisited nodes
  for (const n of GRAPH_NODES) {
    if (!depth.has(n.id)) depth.set(n.id, 3)
  }

  const maxDepth = Math.max(...depth.values(), 1)
  const byDepth = new Map<number, CalcGraphNode[]>()
  for (const n of GRAPH_NODES) {
    const d = depth.get(n.id) ?? 0
    const list = byDepth.get(d) || []
    list.push(n)
    byDepth.set(d, list)
  }

  const positioned = new Map<string, PositionedNode>()
  for (const [d, nodes] of byDepth) {
    const r = d === 0 ? 0 : (d / maxDepth) * maxRadius
    const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1)
    const angleOffset = d * 0.4 // stagger rings
    nodes.forEach((node, i) => {
      const angle = angleStep * i + angleOffset - Math.PI / 2
      positioned.set(node.id, {
        ...node,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      })
    })
  }
  return positioned
}

function forceLayout(
  width: number,
  height: number
): Map<string, PositionedNode> {
  // Simple force-directed simulation (no d3 dependency)
  const positions = new Map<
    string,
    { x: number; y: number; vx: number; vy: number }
  >()

  // Initialize with random positions
  for (const node of GRAPH_NODES) {
    positions.set(node.id, {
      x: width / 2 + (Math.random() - 0.5) * width * 0.6,
      y: height / 2 + (Math.random() - 0.5) * height * 0.6,
      vx: 0,
      vy: 0,
    })
  }

  // Seeded random for deterministic layout
  let seed = 42
  function seededRandom() {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (const node of GRAPH_NODES) {
    positions.set(node.id, {
      x: width / 2 + (seededRandom() - 0.5) * width * 0.6,
      y: height / 2 + (seededRandom() - 0.5) * height * 0.6,
      vx: 0,
      vy: 0,
    })
  }

  const iterations = 200
  const repulsion = 3000
  const attraction = 0.005
  const damping = 0.9
  const centerPull = 0.01

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    const nodes = [...positions.entries()]
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i][1]
        const b = nodes[j][1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = repulsion / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    // Attraction along edges
    for (const link of GRAPH_LINKS) {
      const a = positions.get(link.source)
      const b = positions.get(link.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = dist * attraction
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // Center gravity
    for (const [, pos] of positions) {
      pos.vx += (width / 2 - pos.x) * centerPull
      pos.vy += (height / 2 - pos.y) * centerPull
    }

    // Apply velocities with damping
    for (const [, pos] of positions) {
      pos.vx *= damping
      pos.vy *= damping
      pos.x += pos.vx
      pos.y += pos.vy
      // Clamp to bounds
      pos.x = Math.max(
        NODE_RADIUS + 10,
        Math.min(width - NODE_RADIUS - 10, pos.x)
      )
      pos.y = Math.max(
        NODE_RADIUS + 30,
        Math.min(height - NODE_RADIUS - 10, pos.y)
      )
    }
  }

  const result = new Map<string, PositionedNode>()
  for (const node of GRAPH_NODES) {
    const pos = positions.get(node.id)!
    result.set(node.id, { ...node, x: pos.x, y: pos.y })
  }
  return result
}

function computeLayout(
  mode: LayoutMode,
  width: number,
  height: number
): Map<string, PositionedNode> {
  switch (mode) {
    case "cluster":
      return clusterLayout(width, height)
    case "radial":
      return radialLayout(width, height)
    case "force":
      return forceLayout(width, height)
    case "grid":
    default:
      return gridLayout(width, height)
  }
}

// ----------- Cluster bounds for visual grouping -----------

type ClusterBounds = {
  type: GraphNodeType
  cx: number
  cy: number
  rx: number
  ry: number
}

function computeClusterBounds(
  nodeMap: Map<string, PositionedNode>
): ClusterBounds[] {
  const byType = new Map<GraphNodeType, PositionedNode[]>()
  for (const node of nodeMap.values()) {
    const list = byType.get(node.type) || []
    list.push(node)
    byType.set(node.type, list)
  }

  const clusters: ClusterBounds[] = []
  for (const [type, nodes] of byType) {
    if (nodes.length === 0) continue
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const pad = NODE_RADIUS + CLUSTER_PADDING
    clusters.push({
      type,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      rx: (maxX - minX) / 2 + pad,
      ry: (maxY - minY) / 2 + pad,
    })
  }
  return clusters
}

// ----------- Bezier path -----------

function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.3 + 20
  const perpX = -dy / len
  const perpY = dx / len
  const cx = mx + perpX * offset
  const cy = my + perpY * offset
  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`
}

// ----------- Component -----------

function NetworkGraphInner({
  width,
  height,
}: {
  readonly width: number
  readonly height: number
}) {
  const [selectedLink, setSelectedLink] = useState<CalcGraphLink | null>(null)
  const [hoveredLink, setHoveredLink] = useState<number | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("cluster")
  const [showClusters, setShowClusters] = useState(true)

  // Pan & zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  const nodeMap = useMemo(
    () => computeLayout(layoutMode, width, height),
    [layoutMode, width, height]
  )
  const clusterBounds = useMemo(
    () => (showClusters ? computeClusterBounds(nodeMap) : []),
    [nodeMap, showClusters]
  )

  // Highlighted nodes/links when hovering a node
  const highlightedLinks = useMemo(() => {
    if (!hoveredNode) return new Set<number>()
    const indices = new Set<number>()
    GRAPH_LINKS.forEach((link, i) => {
      if (link.source === hoveredNode || link.target === hoveredNode)
        indices.add(i)
    })
    return indices
  }, [hoveredNode])

  const highlightedNodes = useMemo(() => {
    if (!hoveredNode) return new Set<string>()
    const nodes = new Set<string>([hoveredNode])
    for (const link of GRAPH_LINKS) {
      if (link.source === hoveredNode) nodes.add(link.target)
      if (link.target === hoveredNode) nodes.add(link.source)
    }
    return nodes
  }, [hoveredNode])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      setIsPanning(true)
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
    },
    [pan]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      })
    },
    [isPanning]
  )

  const handleMouseUp = useCallback(() => setIsPanning(false), [])

  useEffect(() => {
    const handler = () => setIsPanning(false)
    globalThis.addEventListener("mouseup", handler)
    return () => globalThis.removeEventListener("mouseup", handler)
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  if (width < 100 || height < 100) return null

  return (
    <>
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
        <Select
          value={layoutMode}
          onValueChange={(v) => {
            setLayoutMode(v as LayoutMode)
            resetView()
          }}
        >
          <SelectTrigger className="h-7 w-[120px] bg-card text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grid">Grid</SelectItem>
            <SelectItem value="cluster">Cluster</SelectItem>
            <SelectItem value="radial">Radial</SelectItem>
            <SelectItem value="force">Force</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="size-7 bg-card"
          onClick={() => setShowClusters((v) => !v)}
          title={showClusters ? "Hide clusters" : "Show clusters"}
        >
          {showClusters ? (
            <Unlock className="size-3.5" />
          ) : (
            <Lock className="size-3.5" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7 bg-card"
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
          title="Zoom in"
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7 bg-card"
          onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
          title="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7 bg-card"
          onClick={resetView}
          title="Reset view"
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-3 rounded-lg bg-card/90 px-3 py-2 text-[11px] backdrop-blur-sm">
        {TYPE_COLUMN_ORDER.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: NODE_COLORS[type] }}
            />
            <span className="text-muted-foreground">{TYPE_LABELS[type]}</span>
          </span>
        ))}
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="select-none"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <rect width={width} height={height} fill="transparent" />
        <Group top={pan.y} left={pan.x}>
          <g
            transform={`translate(${width / 2}, ${height / 2}) scale(${zoom}) translate(${-width / 2}, ${-height / 2})`}
          >
            {/* Cluster backgrounds */}
            {clusterBounds.map((c) => (
              <ellipse
                key={c.type}
                cx={c.cx}
                cy={c.cy}
                rx={c.rx}
                ry={c.ry}
                fill={NODE_COLORS[c.type]}
                fillOpacity={0.06}
                stroke={NODE_COLORS[c.type]}
                strokeOpacity={0.15}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))}

            {/* Cluster labels */}
            {clusterBounds.map((c) => (
              <text
                key={`label-${c.type}`}
                x={c.cx}
                y={c.cy - c.ry + 12}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={NODE_COLORS[c.type]}
                fillOpacity={0.5}
                className="select-none"
                pointerEvents="none"
              >
                {TYPE_LABELS[c.type]}
              </text>
            ))}

            {/* Links */}
            {GRAPH_LINKS.map((link, i) => {
              const source = nodeMap.get(link.source)
              const target = nodeMap.get(link.target)
              if (!source || !target) return null

              const isSelected =
                selectedLink?.source === link.source &&
                selectedLink?.target === link.target &&
                selectedLink?.calculationName === link.calculationName
              const isHovered = hoveredLink === i
              const isHighlighted = highlightedLinks.has(i)
              const dimmed = hoveredNode != null && !isHighlighted

              return (
                <g key={`link-${link.calculationName}-${source.id}-${target.id}`}>
                  <path
                    d={bezierPath(source.x, source.y, target.x, target.y)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    onClick={() => setSelectedLink(link)}
                    onMouseEnter={() => setHoveredLink(i)}
                    onMouseLeave={() => setHoveredLink(null)}
                    pointerEvents="stroke"
                  />
                  <path
                    d={bezierPath(source.x, source.y, target.x, target.y)}
                    fill="none"
                    stroke={
                      isSelected
                        ? "#f97316"
                        : isHighlighted
                          ? NODE_COLORS[source.type]
                          : "#94a3b8"
                    }
                    strokeWidth={
                      isSelected ? 2.5 : isHovered || isHighlighted ? 2 : 1.2
                    }
                    strokeOpacity={
                      dimmed
                        ? 0.08
                        : isSelected
                          ? 0.9
                          : isHovered || isHighlighted
                            ? 0.7
                            : 0.25
                    }
                    className="cursor-pointer transition-opacity duration-150"
                    onClick={() => setSelectedLink(link)}
                    onMouseEnter={() => setHoveredLink(i)}
                    onMouseLeave={() => setHoveredLink(null)}
                    pointerEvents="none"
                    strokeLinecap="round"
                  />
                  {/* Arrow at target */}
                  {(isSelected || isHovered || isHighlighted) &&
                    (() => {
                      const d = bezierPath(
                        source.x,
                        source.y,
                        target.x,
                        target.y
                      )
                      const path = document.createElementNS(
                        "http://www.w3.org/2000/svg",
                        "path"
                      )
                      path.setAttribute("d", d)
                      const totalLen = path.getTotalLength()
                      if (totalLen < NODE_RADIUS * 2) return null
                      const pt = path.getPointAtLength(
                        totalLen - NODE_RADIUS - 4
                      )
                      const pt2 = path.getPointAtLength(
                        totalLen - NODE_RADIUS - 12
                      )
                      const angle = Math.atan2(pt.y - pt2.y, pt.x - pt2.x)
                      const arrowSize = 6
                      const x1 = pt.x - arrowSize * Math.cos(angle - 0.4)
                      const y1 = pt.y - arrowSize * Math.sin(angle - 0.4)
                      const x2 = pt.x - arrowSize * Math.cos(angle + 0.4)
                      const y2 = pt.y - arrowSize * Math.sin(angle + 0.4)
                      return (
                        <polygon
                          points={`${pt.x},${pt.y} ${x1},${y1} ${x2},${y2}`}
                          fill={
                            isSelected
                              ? "#f97316"
                              : isHighlighted
                                ? NODE_COLORS[source.type]
                                : "#94a3b8"
                          }
                          fillOpacity={isSelected ? 0.9 : 0.7}
                          pointerEvents="none"
                        />
                      )
                    })()}
                </g>
              )
            })}

            {/* Nodes */}
            {Array.from(nodeMap.values()).map((node) => {
              const color = NODE_COLORS[node.type]
              const dimmed =
                hoveredNode != null && !highlightedNodes.has(node.id)
              const isHover = hoveredNode === node.id

              return (
                <g
                  key={node.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {isHover && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={NODE_RADIUS + 4}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeOpacity={0.4}
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill={color}
                    fillOpacity={dimmed ? 0.25 : 0.85}
                    stroke={color}
                    strokeWidth={isHover ? 2.5 : 1.5}
                    strokeOpacity={dimmed ? 0.15 : 0.5}
                    className="transition-opacity duration-150"
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
                    fillOpacity={dimmed ? 0.3 : 1}
                    className="select-none"
                  >
                    {node.label.length > 12
                      ? node.label.slice(0, 11) + "\u2026"
                      : node.label}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + NODE_RADIUS + 13}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="currentColor"
                    fontSize={8}
                    className="fill-muted-foreground select-none"
                    pointerEvents="none"
                    fillOpacity={dimmed ? 0.15 : 0.7}
                  >
                    {node.label}
                  </text>
                </g>
              )
            })}
          </g>
        </Group>
      </svg>

      {/* Detail dialog */}
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
                ? `${nodeMap.get(selectedLink.source)?.label ?? selectedLink.source} \u2192 ${nodeMap.get(selectedLink.target)?.label ?? selectedLink.target}`
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
                <span>&rarr;</span>
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
    <div className="relative h-full w-full overflow-hidden">
      <ParentSize>
        {({ width, height }) => (
          <NetworkGraphInner width={width} height={height} />
        )}
      </ParentSize>
    </div>
  )
}
