"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import {
  ReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type EdgeChange,
  SelectionMode,
  ConnectionLineType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { CalcNode } from "@/components/dashboard/developer/calc-node"
import { CalcEdge } from "@/components/dashboard/developer/calc-edge"
import { CanvasToolbar } from "@/components/dashboard/developer/canvas-toolbar"
import { EdgeDetailPanel } from "@/components/dashboard/developer/edge-detail-panel"
import { NodeDetailPanel } from "@/components/dashboard/developer/node-detail-panel"
import { GraphLegend } from "@/components/dashboard/developer/graph-legend"
import { CanvasContextMenu } from "@/components/dashboard/developer/canvas-context-menu"
import {
  buildReactFlowNodes,
  buildReactFlowEdges,
  saveNodePositions,
  fetchLayoutFromDB,
  saveLayoutToDB,
  applyPositionsToNodes,
  applyMoneyFlowData,
  clearLocalPositions,
  clearMoneyFlowData,
  type CalcNodeData,
  type CalcEdgeData,
} from "@/lib/developer/graph-adapter"
import {
  NODE_COLORS,
  type GraphNodeType,
} from "@/lib/developer/calculation-graph-data"
import { useDeveloperView } from "@/components/dashboard/developer/developer-view-context"
import { useActiveProfile } from "@/hooks/use-active-profile"
import type { MoneyFlowPayload } from "@/lib/developer/money-flow-types"
import { toast } from "sonner"

const nodeTypes = {
  calcNode: CalcNode,
}

const edgeTypes = {
  calcEdge: CalcEdge,
}

const defaultEdgeOptions = {
  type: "calcEdge" as const,
  animated: false,
}

// SVG marker definitions for edge arrows
function EdgeMarkers() {
  const types: GraphNodeType[] = [
    "cashflow",
    "cpf",
    "tax",
    "bank",
    "loan",
    "investment",
    "insurance",
    "goal",
  ]
  return (
    <svg className="absolute h-0 w-0">
      <defs>
        {types.map((type) => (
          <marker
            key={type}
            id={`arrow-${type}`}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill={NODE_COLORS[type]}
              opacity={0.6}
            />
          </marker>
        ))}
        <marker
          id="arrow-selected"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
        </marker>
        <marker
          id="arrow-default"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill="hsl(var(--muted-foreground))"
            opacity={0.6}
          />
        </marker>
      </defs>
    </svg>
  )
}

interface ContextMenuState {
  x: number
  y: number
  node?: Node<CalcNodeData>
}

export function NodeCanvas() {
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(buildReactFlowNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildReactFlowEdges())

  // Filter out React Flow's built-in edge selection to prevent CSS conflicts
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge<CalcEdgeData>>[]) => {
      onEdgesChange(changes.filter((c) => c.type !== "select"))
    },
    [onEdgesChange]
  )

  const [selectedEdge, setSelectedEdge] = useState<Edge<CalcEdgeData> | null>(
    null
  )
  const [selectedNode, setSelectedNode] = useState<Node<CalcNodeData> | null>(
    null
  )
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [moneyFlowLoading, setMoneyFlowLoading] = useState(false)

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dbSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Money flow view data fetching
  const { viewMode } = useDeveloperView()
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const moneyFlowUrl = useMemo(() => {
    if (viewMode !== "money-flow") return null
    const params = new URLSearchParams()
    if (activeProfileId) params.set("profileId", activeProfileId)
    if (activeFamilyId) params.set("familyId", activeFamilyId)
    return `/api/developer/money-flow?${params}`
  }, [viewMode, activeProfileId, activeFamilyId])

  const moneyFlowRef = useRef<MoneyFlowPayload | null>(null)
  const prevUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!moneyFlowUrl) {
      // Switched back to calculation mode — clear money data
      if (moneyFlowRef.current) {
        moneyFlowRef.current = null
        setNodes((currentNodes) => {
          const result = clearMoneyFlowData(
            currentNodes as Node<CalcNodeData>[],
            edges as Edge<CalcEdgeData>[]
          )
          setEdges(result.edges)
          return result.nodes
        })
      }
      return
    }
    if (moneyFlowUrl === prevUrlRef.current) return
    prevUrlRef.current = moneyFlowUrl

    setMoneyFlowLoading(true)
    fetch(moneyFlowUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MoneyFlowPayload | null) => {
        if (!data) {
          toast.error("Failed to load money flow data")
          return
        }
        moneyFlowRef.current = data
        setNodes((currentNodes) => {
          const result = applyMoneyFlowData(
            currentNodes as Node<CalcNodeData>[],
            edges as Edge<CalcEdgeData>[],
            data
          )
          setEdges(result.edges)
          return result.nodes
        })
      })
      .catch(() => {
        toast.error("Failed to load money flow data")
      })
      .finally(() => {
        setMoneyFlowLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyFlowUrl])

  // Load layout from DB on mount (overrides localStorage if available)
  useEffect(() => {
    fetchLayoutFromDB().then((layout) => {
      if (layout?.positions && Object.keys(layout.positions).length > 0) {
        setNodes((currentNodes) =>
          applyPositionsToNodes(
            currentNodes as Node<CalcNodeData>[],
            layout.positions
          )
        )
        // Also update localStorage to keep them in sync
        saveNodePositions(
          applyPositionsToNodes(nodes as Node<CalcNodeData>[], layout.positions)
        )
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced save positions on node drag (localStorage + DB)
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)

      const hasPositionChange = changes.some(
        (c) => c.type === "position" && c.position
      )
      if (hasPositionChange) {
        // Quick save to localStorage (500ms debounce)
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => {
          setNodes((currentNodes) => {
            saveNodePositions(currentNodes as Node<CalcNodeData>[])
            return currentNodes
          })
        }, 500)

        // Slower save to DB (2s debounce to avoid excessive requests)
        if (dbSaveTimeoutRef.current) clearTimeout(dbSaveTimeoutRef.current)
        dbSaveTimeoutRef.current = setTimeout(() => {
          setNodes((currentNodes) => {
            const positions: Record<string, { x: number; y: number }> = {}
            for (const node of currentNodes) {
              positions[node.id] = {
                x: node.position.x,
                y: node.position.y,
              }
            }
            saveLayoutToDB({ positions })
            return currentNodes
          })
        }, 2000)
      }
    },
    [onNodesChange, setNodes]
  )

  // Handle node selection
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNode(node as Node<CalcNodeData>)
    setSelectedEdge(null)
    setContextMenu(null)
  }, [])

  // Handle edge selection
  const onEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setSelectedEdge(edge as Edge<CalcEdgeData>)
    setSelectedNode(null)
    setContextMenu(null)
  }, [])

  // Handle background click to deselect
  const onPaneClick = useCallback(() => {
    setSelectedEdge(null)
    setSelectedNode(null)
    setContextMenu(null)
  }, [])

  // Right-click context menu on nodes
  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node: node as Node<CalcNodeData>,
    })
  }, [])

  // Right-click context menu on canvas
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
      })
    },
    []
  )

  // Reset layout to default positions (clear both localStorage and DB)
  const handleResetLayout = useCallback(() => {
    clearLocalPositions()
    const freshNodes = buildReactFlowNodes()
    setNodes(freshNodes)
    // Also reset in DB
    const positions: Record<string, { x: number; y: number }> = {}
    for (const node of freshNodes) {
      positions[node.id] = { x: node.position.x, y: node.position.y }
    }
    saveLayoutToDB({ positions })
    toast.success("Layout reset to default")
  }, [setNodes])

  // Export graph as JSON
  const handleExportJSON = useCallback(() => {
    const graphData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: (n.data as CalcNodeData).nodeType,
        label: (n.data as CalcNodeData).label,
        filePath: (n.data as CalcNodeData).filePath,
        position: n.position,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        calculationName: (e.data as CalcEdgeData)?.calculationName,
        description: (e.data as CalcEdgeData)?.description,
        calculationLogic: (e.data as CalcEdgeData)?.calculationLogic,
        filePath: (e.data as CalcEdgeData)?.filePath,
      })),
    }
    const blob = new Blob([JSON.stringify(graphData, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "calculation-graph.json"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Graph exported as JSON")
  }, [nodes, edges])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // F = Fit view
      if (e.key === "f" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        fitView({ duration: 300, padding: 0.15 })
      }

      // Escape = deselect all
      if (e.key === "Escape") {
        setSelectedEdge(null)
        setSelectedNode(null)
        setContextMenu(null)
      }

      // G = toggle snap to grid
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        setSnapToGrid((s) => !s)
      }

      // R = reset layout
      if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        handleResetLayout()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [fitView, handleResetLayout])

  return (
    <div className="relative h-full w-full">
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges.map((e) => ({
          ...e,
          selected: e.id === selectedEdge?.id,
        }))}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.SmoothStep}
        snapToGrid={snapToGrid}
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ padding: 0.15, duration: 300 }}
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag={false}
        minZoom={0.2}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="!bg-background"
          color="hsl(var(--border))"
        />

        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) =>
            (n.data as CalcNodeData)?.color ?? "hsl(var(--muted))"
          }
          maskColor="hsl(var(--background) / 0.8)"
          className="!rounded-lg !border !bg-card/90 !shadow-sm"
          pannable
          zoomable
        />

        {/* Toolbar - top left */}
        <Panel position="top-left">
          <CanvasToolbar
            onResetLayout={handleResetLayout}
            onExportJSON={handleExportJSON}
            snapToGrid={snapToGrid}
            onToggleSnap={() => setSnapToGrid((s) => !s)}
            moneyFlowLoading={moneyFlowLoading}
          />
        </Panel>

        {/* Legend - bottom left */}
        <Panel position="bottom-left">
          <GraphLegend />
        </Panel>

        {/* Detail panels - top right */}
        <Panel position="top-right">
          {selectedEdge && (
            <EdgeDetailPanel
              edge={selectedEdge}
              onClose={() => setSelectedEdge(null)}
            />
          )}
          {selectedNode && !selectedEdge && (
            <NodeDetailPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </Panel>
      </ReactFlow>

      {/* Context menu (rendered outside ReactFlow to use fixed positioning) */}
      <CanvasContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onSelectNode={(node) => {
          setSelectedNode(node)
          setSelectedEdge(null)
        }}
      />
    </div>
  )
}
