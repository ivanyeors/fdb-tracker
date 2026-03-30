"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { CalcNodeData } from "@/lib/developer/graph-adapter"
import { NODE_TYPE_REGISTRY } from "@/lib/developer/node-registry"
import {
  Landmark,
  ArrowLeftRight,
  Receipt,
  Building2,
  HandCoins,
  TrendingUp,
  Shield,
  Target,
  FileCode,
} from "lucide-react"
import type { GraphNodeType } from "@/lib/developer/calculation-graph-data"

const ICON_MAP: Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  Landmark,
  ArrowLeftRight,
  Receipt,
  Building2,
  HandCoins,
  TrendingUp,
  Shield,
  Target,
}

function getIcon(type: GraphNodeType) {
  const def = NODE_TYPE_REGISTRY[type]
  return ICON_MAP[def.icon] || FileCode
}

function CalcNodeComponent({
  data,
  selected,
}: NodeProps & { data: CalcNodeData }) {
  const Icon = getIcon(data.nodeType)
  const typeDef = NODE_TYPE_REGISTRY[data.nodeType]

  return (
    <div
      className={`group relative rounded-lg border-2 bg-card shadow-md transition-all duration-150 ${
        selected
          ? "border-primary shadow-lg ring-2 ring-primary/20"
          : "border-border hover:border-primary/50 hover:shadow-lg"
      }`}
      style={{
        minWidth: 180,
        maxWidth: 220,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 rounded-t-md px-3 py-2"
        style={{ backgroundColor: `${data.color}15` }}
      >
        <div
          className="flex h-6 w-6 items-center justify-center rounded"
          style={{ backgroundColor: `${data.color}25` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: data.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            {data.label}
          </div>
        </div>
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wider uppercase"
          style={{
            backgroundColor: `${data.color}20`,
            color: data.color,
          }}
        >
          {typeDef.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <FileCode className="h-3 w-3 shrink-0" />
          <span className="truncate">{data.filePath}</span>
        </div>
      </div>

      {/* Input handles (left side) */}
      {data.inputs.map((inputId, i) => (
        <Handle
          key={`in-${inputId}`}
          type="target"
          position={Position.Left}
          id={`in-${inputId}`}
          className="!h-3 !w-3 !rounded-full !border-2 !border-background !bg-muted-foreground transition-colors hover:!bg-primary"
          style={{
            top: `${30 + ((i + 1) / (data.inputs.length + 1)) * 50}%`,
          }}
        />
      ))}

      {/* Output handles (right side) */}
      {data.outputs.map((outputId, i) => (
        <Handle
          key={`out-${outputId}`}
          type="source"
          position={Position.Right}
          id={`out-${outputId}`}
          className="!h-3 !w-3 !rounded-full !border-2 !border-background !bg-muted-foreground transition-colors hover:!bg-primary"
          style={{
            top: `${30 + ((i + 1) / (data.outputs.length + 1)) * 50}%`,
          }}
        />
      ))}
    </div>
  )
}

export const CalcNode = memo(CalcNodeComponent)
