"use client"

import { memo } from "react"
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  EdgeLabelRenderer,
} from "@xyflow/react"
import type { CalcEdgeData } from "@/lib/developer/graph-adapter"
import { NODE_COLORS } from "@/lib/developer/calculation-graph-data"
import { useDeveloperView } from "@/components/dashboard/developer/developer-view-context"

function CalcEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style,
}: EdgeProps & { data?: CalcEdgeData }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const { viewMode } = useDeveloperView()
  const isMoneyFlow = viewMode === "money-flow" && data?.flowFormula

  const edgeColor = data
    ? NODE_COLORS[data.sourceType]
    : "var(--muted-foreground)"

  // In money-flow mode, always show the label (not just on select)
  const showLabel = isMoneyFlow || (selected && data)
  const labelText = isMoneyFlow ? data?.flowFormula : data?.calculationName

  return (
    <>
      {/* Invisible wider path for easier click target */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        className="react-flow__edge-interaction"
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          // Override CSS variables so React Flow's .selected CSS doesn't override
          "--xy-edge-stroke": selected ? edgeColor : edgeColor,
          "--xy-edge-stroke-selected": edgeColor,
          stroke: edgeColor,
          strokeWidth: selected ? 3 : isMoneyFlow ? 2 : 1.5,
          opacity: selected ? 1 : isMoneyFlow ? 0.8 : 0.6,
          filter: selected ? `drop-shadow(0 0 4px ${edgeColor})` : "none",
          transition:
            "stroke-width 0.15s, opacity 0.15s, filter 0.15s",
        } as React.CSSProperties}
        markerEnd={`url(#arrow-${data?.sourceType ?? "default"})`}
      />
      {/* Label */}
      {showLabel && labelText && (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan pointer-events-auto absolute rounded-md border px-2 py-1 text-xs shadow-md ${
              isMoneyFlow
                ? "border-border/50 bg-background/95 backdrop-blur-sm"
                : "bg-popover"
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <span
              className={`font-medium ${
                isMoneyFlow ? "font-mono text-[10px]" : "text-foreground"
              }`}
              style={isMoneyFlow ? { color: edgeColor } : undefined}
            >
              {labelText}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const CalcEdge = memo(CalcEdgeComponent)
