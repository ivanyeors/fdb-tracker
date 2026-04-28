"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { type ImpactNodeId, IMPACT_NODES } from "@/lib/impact-graph"
import { cn } from "@/lib/utils"

interface SourceBadgeProps {
  readonly source: "auto" | "manual"
  /** If provided, tooltip text is looked up from the impact graph registry */
  readonly nodeId?: ImpactNodeId
  /** Custom tooltip text (overrides nodeId lookup) */
  readonly tooltip?: string
  readonly className?: string
}

export function SourceBadge({
  source,
  nodeId,
  tooltip,
  className,
}: SourceBadgeProps) {
  const resolvedTooltip =
    tooltip ??
    (() => {
      if (!nodeId) return undefined
      return source === "auto"
        ? IMPACT_NODES[nodeId].autoTooltip
        : IMPACT_NODES[nodeId].manualTooltip
    })()

  const badge = (
    <Badge
      variant={source === "auto" ? "secondary" : "outline"}
      className={cn(
        source === "auto"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-blue-500/15 text-blue-700 dark:text-blue-400",
        className,
      )}
    >
      {source === "auto" ? "Auto" : "Manual"}
    </Badge>
  )

  if (!resolvedTooltip) return badge

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{resolvedTooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
