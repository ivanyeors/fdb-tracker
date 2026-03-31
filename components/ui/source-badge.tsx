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
  source: "auto" | "manual"
  /** If provided, tooltip text is looked up from the impact graph registry */
  nodeId?: ImpactNodeId
  /** Custom tooltip text (overrides nodeId lookup) */
  tooltip?: string
  className?: string
}

export function SourceBadge({
  source,
  nodeId,
  tooltip,
  className,
}: SourceBadgeProps) {
  const resolvedTooltip =
    tooltip ??
    (nodeId
      ? source === "auto"
        ? IMPACT_NODES[nodeId].autoTooltip
        : IMPACT_NODES[nodeId].manualTooltip
      : undefined)

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
