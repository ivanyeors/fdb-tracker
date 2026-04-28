import type { Node, Edge } from "@xyflow/react"
import {
  GRAPH_NODES,
  GRAPH_LINKS,
  NODE_COLORS,
  type CalcGraphNode,
  type GraphNodeType,
} from "@/lib/developer/calculation-graph-data"
import { NODE_TYPE_REGISTRY } from "@/lib/developer/node-registry"
import type { MoneyFlowPayload } from "@/lib/developer/money-flow-types"

// Custom data attached to each React Flow node
export interface CalcNodeData {
  label: string
  nodeType: GraphNodeType
  filePath: string
  color: string
  inputs: string[]
  outputs: string[]
  description: string
  // Money flow fields (populated when viewMode === "money-flow")
  moneyAmount?: string
  moneyBreakdown?: string
  moneyPeriod?: "monthly" | "annual" | "total"
  [key: string]: unknown
}

// Custom data attached to each React Flow edge
export interface CalcEdgeData {
  calculationName: string
  description: string
  filePath: string
  calculationLogic: string
  sourceType: GraphNodeType
  targetType: GraphNodeType
  // Money flow fields
  flowFormula?: string
  flowAmount?: number
  [key: string]: unknown
}

// Port IDs per node based on actual connections
function deriveNodePorts(nodeId: string): {
  inputs: string[]
  outputs: string[]
} {
  const inputs: string[] = []
  const outputs: string[] = []

  for (const link of GRAPH_LINKS) {
    if (link.target === nodeId && !inputs.includes(link.source)) {
      inputs.push(link.source)
    }
    if (link.source === nodeId && !outputs.includes(link.target)) {
      outputs.push(link.target)
    }
  }

  return { inputs, outputs }
}

// Auto-layout: group by type in columns
function computeInitialPositions(): Map<string, { x: number; y: number }> {
  const TYPE_ORDER: GraphNodeType[] = [
    "cashflow",
    "cpf",
    "tax",
    "bank",
    "loan",
    "investment",
    "insurance",
    "goal",
  ]

  const nodesByType = new Map<GraphNodeType, CalcGraphNode[]>()
  for (const node of GRAPH_NODES) {
    const list = nodesByType.get(node.type) || []
    list.push(node)
    nodesByType.set(node.type, list)
  }

  const COL_WIDTH = 320
  const ROW_HEIGHT = 140
  const START_X = 80
  const START_Y = 60

  const positions = new Map<string, { x: number; y: number }>()

  for (let col = 0; col < TYPE_ORDER.length; col++) {
    const type = TYPE_ORDER[col]
    const nodes = nodesByType.get(type) || []
    for (let row = 0; row < nodes.length; row++) {
      positions.set(nodes[row].id, {
        x: START_X + col * COL_WIDTH,
        y: START_Y + row * ROW_HEIGHT,
      })
    }
  }

  return positions
}

const STORAGE_KEY = "fdb-dev-graph-positions"

function loadSavedPositions(): Map<string, { x: number; y: number }> | null {
  if (globalThis.window === undefined) return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved) as Record<string, { x: number; y: number }>
    return new Map(Object.entries(parsed))
  } catch {
    return null
  }
}

export function saveNodePositions(nodes: Node<CalcNodeData>[]): void {
  if (globalThis.window === undefined) return
  const positions: Record<string, { x: number; y: number }> = {}
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
}

// --- DB sync helpers ---

export interface GraphLayoutPayload {
  positions: Record<string, { x: number; y: number }>
  viewport?: { x: number; y: number; zoom: number }
}

export async function fetchLayoutFromDB(): Promise<GraphLayoutPayload | null> {
  try {
    const res = await fetch("/api/developer/graph-layout")
    if (!res.ok) return null
    const json = await res.json()
    return json.layout ?? null
  } catch {
    return null
  }
}

export async function saveLayoutToDB(
  payload: GraphLayoutPayload
): Promise<boolean> {
  try {
    const res = await fetch("/api/developer/graph-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export function applyPositionsToNodes(
  nodes: Node<CalcNodeData>[],
  positions: Record<string, { x: number; y: number }>
): Node<CalcNodeData>[] {
  return nodes.map((node) => {
    const pos = positions[node.id]
    if (pos) {
      return { ...node, position: pos }
    }
    return node
  })
}

export function clearLocalPositions(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function buildReactFlowNodes(): Node<CalcNodeData>[] {
  const savedPositions = loadSavedPositions()
  const defaultPositions = computeInitialPositions()

  return GRAPH_NODES.map((node) => {
    const pos = savedPositions?.get(node.id) ?? defaultPositions.get(node.id)!
    const { inputs, outputs } = deriveNodePorts(node.id)
    const typeDef = NODE_TYPE_REGISTRY[node.type]

    return {
      id: node.id,
      type: "calcNode",
      position: pos,
      data: {
        label: node.label,
        nodeType: node.type,
        filePath: node.filePath,
        color: NODE_COLORS[node.type],
        inputs,
        outputs,
        description: typeDef.description,
      },
    }
  })
}

export function buildReactFlowEdges(): Edge<CalcEdgeData>[] {
  const nodeMap = new Map(GRAPH_NODES.map((n) => [n.id, n]))

  return GRAPH_LINKS.map((link, i) => {
    const sourceNode = nodeMap.get(link.source)
    const targetNode = nodeMap.get(link.target)

    return {
      id: `e-${link.source}-${link.target}-${i}`,
      source: link.source,
      target: link.target,
      sourceHandle: `out-${link.target}`,
      targetHandle: `in-${link.source}`,
      type: "calcEdge",
      animated: false,
      data: {
        calculationName: link.calculationName,
        description: link.description,
        filePath: link.filePath,
        calculationLogic: link.calculationLogic,
        sourceType: sourceNode?.type ?? "cashflow",
        targetType: targetNode?.type ?? "cashflow",
      },
    }
  })
}

export function applyMoneyFlowData(
  nodes: Node<CalcNodeData>[],
  edges: Edge<CalcEdgeData>[],
  payload: MoneyFlowPayload
): { nodes: Node<CalcNodeData>[]; edges: Edge<CalcEdgeData>[] } {
  const updatedNodes = nodes.map((n) => {
    const flow = payload.nodes[n.id]
    if (!flow) return n
    return {
      ...n,
      data: {
        ...n.data,
        moneyAmount: flow.amount,
        moneyBreakdown: flow.breakdown,
        moneyPeriod: flow.period,
      },
    }
  })

  const updatedEdges = edges.map((e) => {
    const flow = payload.edges[e.id]
    if (!flow) return e
    return {
      ...e,
      data: {
        ...e.data!,
        flowFormula: flow.flowFormula,
        flowAmount: flow.rawAmount,
      },
    }
  })

  return { nodes: updatedNodes, edges: updatedEdges }
}

export function clearMoneyFlowData(
  nodes: Node<CalcNodeData>[],
  edges: Edge<CalcEdgeData>[]
): { nodes: Node<CalcNodeData>[]; edges: Edge<CalcEdgeData>[] } {
  const updatedNodes = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      moneyAmount: undefined,
      moneyBreakdown: undefined,
      moneyPeriod: undefined,
    },
  }))

  const updatedEdges = edges.map((e) => ({
    ...e,
    data: {
      ...e.data!,
      flowFormula: undefined,
      flowAmount: undefined,
    },
  }))

  return { nodes: updatedNodes, edges: updatedEdges }
}
