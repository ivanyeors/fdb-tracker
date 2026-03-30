"use client"

import { NODE_TYPE_REGISTRY } from "@/lib/developer/node-registry"
import type { GraphNodeType } from "@/lib/developer/calculation-graph-data"

const TYPES: GraphNodeType[] = [
  "cashflow",
  "cpf",
  "tax",
  "bank",
  "loan",
  "investment",
  "insurance",
  "goal",
]

export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur-sm">
      {TYPES.map((type) => {
        const def = NODE_TYPE_REGISTRY[type]
        return (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: def.color }}
            />
            <span className="text-[10px] font-medium text-muted-foreground">
              {def.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
