"use client"

import type { Edge } from "@xyflow/react"
import type { CalcEdgeData } from "@/lib/developer/graph-adapter"
import { NODE_COLORS } from "@/lib/developer/calculation-graph-data"
import { GRAPH_NODES } from "@/lib/developer/calculation-graph-data"
import { X, ArrowRight, FileCode, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDeveloperView } from "@/components/dashboard/developer/developer-view-context"

interface EdgeDetailPanelProps {
  readonly edge: Edge<CalcEdgeData>
  readonly onClose: () => void
}

/** Renders calculationLogic text with simple markdown-like formatting */
function LogicBlock({ text }: { readonly text: string }) {
  const lines = text.split("\n")
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trimStart()
        // Lines come from parsing a static text prop; the list is rebuilt
        // wholesale on each render and never reordered, so index is stable.
        const lineKey = `line-${i}-${trimmed.slice(0, 16)}`

        // Empty line = spacer
        if (trimmed === "") {
          return <div key={lineKey} className="h-1.5" />
        }

        // Bold header: **text**
        if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
          return (
            <div
              key={lineKey}
              className="mt-1 text-[11px] font-semibold text-foreground"
            >
              {trimmed.slice(2, -2)}
            </div>
          )
        }

        // Line with bold prefix: **Label:** rest
        const boldMatch = /^\*\*(.+?)\*\*\s*(.*)$/.exec(trimmed)
        if (boldMatch) {
          return (
            <div key={lineKey} className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                {boldMatch[1]}
              </span>{" "}
              {boldMatch[2]}
            </div>
          )
        }

        // Table-like line with | separators
        if (trimmed.includes("|") && !trimmed.startsWith("Where")) {
          const cells = trimmed
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean)
          return (
            <div
              key={lineKey}
              className="flex gap-2 font-mono text-[10px] text-muted-foreground"
            >
              {cells.map((cell, j) => (
                <span
                  key={`${lineKey}-cell-${j}-${cell.slice(0, 8)}`}
                  className={j === 0 ? "min-w-[70px] text-foreground/80" : ""}
                >
                  {cell}
                </span>
              ))}
            </div>
          )
        }

        // Formula-like line (contains =, ×, +, -, /, ^, or starts with uppercase var)
        const isFormula =
          /[=×÷^]/.test(trimmed) ||
          /^[A-Z_][\w]* =/.test(trimmed) ||
          /^\w+ [+\-*/]= /.test(trimmed)

        if (isFormula) {
          return (
            <div
              key={lineKey}
              className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground/90"
            >
              {trimmed}
            </div>
          )
        }

        // Regular text line
        return (
          <div
            key={lineKey}
            className="text-[11px] leading-relaxed text-muted-foreground"
          >
            {trimmed}
          </div>
        )
      })}
    </div>
  )
}

export function EdgeDetailPanel({ edge, onClose }: EdgeDetailPanelProps) {
  const { viewMode } = useDeveloperView()
  const isMoneyFlow = viewMode === "money-flow"

  const data = edge.data
  if (!data) return null

  const sourceNode = GRAPH_NODES.find((n) => n.id === edge.source)
  const targetNode = GRAPH_NODES.find((n) => n.id === edge.target)

  return (
    <div className="max-h-[70vh] w-80 overflow-y-auto rounded-lg border bg-card shadow-lg">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-3 py-2">
        <h3 className="text-sm font-semibold text-foreground">
          Connection Detail
        </h3>
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
        {/* Money flow formula (prominent in money-flow mode) */}
        {isMoneyFlow && data.flowFormula && (
          <div
            className="rounded-md border px-3 py-2"
            style={{ borderColor: `${NODE_COLORS[data.sourceType]}40` }}
          >
            <div className="flex items-center gap-1.5">
              <DollarSign
                className="h-4 w-4"
                style={{ color: NODE_COLORS[data.sourceType] }}
              />
              <span
                className="font-mono text-sm font-bold"
                style={{ color: NODE_COLORS[data.sourceType] }}
              >
                {data.flowFormula}
              </span>
            </div>
          </div>
        )}

        {/* Calculation name */}
        <div>
          <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Calculation
          </div>
          <div className="mt-0.5 text-sm font-semibold text-foreground">
            {data.calculationName}
          </div>
        </div>

        {/* Source -> Target */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[data.sourceType] }}
            />
            <span className="text-xs font-medium">
              {sourceNode?.label ?? edge.source}
            </span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[data.targetType] }}
            />
            <span className="text-xs font-medium">
              {targetNode?.label ?? edge.target}
            </span>
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Description
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {data.description}
          </p>
        </div>

        {/* Calculation Logic (shown in both modes but less prominent in money-flow) */}
        {data.calculationLogic && (
          <div>
            <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Calculation Logic
            </div>
            <div className="mt-1 rounded-md border bg-muted/30 p-2">
              <LogicBlock text={data.calculationLogic} />
            </div>
          </div>
        )}

        {/* File path */}
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {data.filePath}
          </span>
        </div>
      </div>
    </div>
  )
}
