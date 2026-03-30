"use client"

import type { Node } from "@xyflow/react"
import type { CalcNodeData } from "@/lib/developer/graph-adapter"
import { NODE_TYPE_REGISTRY } from "@/lib/developer/node-registry"
import { GRAPH_LINKS } from "@/lib/developer/calculation-graph-data"
import { GRAPH_NODES } from "@/lib/developer/calculation-graph-data"
import { NODE_COLORS } from "@/lib/developer/calculation-graph-data"
import { X, FileCode, ArrowRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface NodeDetailPanelProps {
  node: Node<CalcNodeData>
  onClose: () => void
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const data = node.data
  const typeDef = NODE_TYPE_REGISTRY[data.nodeType]

  // Find incoming and outgoing connections
  const incoming = GRAPH_LINKS.filter((l) => l.target === node.id)
  const outgoing = GRAPH_LINKS.filter((l) => l.source === node.id)

  const getNodeLabel = (id: string) =>
    GRAPH_NODES.find((n) => n.id === id)?.label ?? id

  const getNodeType = (id: string) =>
    GRAPH_NODES.find((n) => n.id === id)?.type ?? "cashflow"

  return (
    <div className="w-72 rounded-lg border bg-card shadow-lg">
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{ backgroundColor: `${data.color}15` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: data.color }}
          />
          <h3 className="text-sm font-semibold text-foreground">
            {data.label}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3 p-3">
        {/* Type & Description */}
        <div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase"
            style={{
              backgroundColor: `${data.color}20`,
              color: data.color,
            }}
          >
            {typeDef.label}
          </span>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {typeDef.description}
          </p>
        </div>

        {/* File path */}
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {data.filePath}
          </span>
        </div>

        {/* Incoming connections */}
        {incoming.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              <ArrowLeft className="h-3 w-3" />
              Inputs ({incoming.length})
            </div>
            <div className="mt-1 space-y-1">
              {incoming.map((link, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: NODE_COLORS[getNodeType(link.source)],
                    }}
                  />
                  <span className="text-muted-foreground">
                    {getNodeLabel(link.source)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    ({link.calculationName})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outgoing connections */}
        {outgoing.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              <ArrowRight className="h-3 w-3" />
              Outputs ({outgoing.length})
            </div>
            <div className="mt-1 space-y-1">
              {outgoing.map((link, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: NODE_COLORS[getNodeType(link.target)],
                    }}
                  />
                  <span className="text-muted-foreground">
                    {getNodeLabel(link.target)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    ({link.calculationName})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
