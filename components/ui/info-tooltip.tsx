"use client"

import { HelpCircle } from "lucide-react"

import { TOOLTIPS } from "@/lib/tooltips"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"

interface InfoTooltipProps {
  id: keyof typeof TOOLTIPS
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}

const DETAILS_LENGTH_THRESHOLD = 100

export function InfoTooltip({ id, side = "top", className }: InfoTooltipProps) {
  const entry = TOOLTIPS[id]
  const isRich = entry.details.length > DETAILS_LENGTH_THRESHOLD

  if (isRich) {
    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <HelpCircle
            className={cn(
              "inline size-4 shrink-0 cursor-help text-muted-foreground",
              className,
            )}
          />
        </HoverCardTrigger>
        <HoverCardContent
          side={side}
          className="w-72 space-y-2 border-neutral-800 bg-neutral-950 text-sm text-neutral-50 ring-neutral-800"
        >
          <p className="font-medium leading-none">{entry.label}</p>
          <p>
            <span className="font-medium text-neutral-400">How: </span>
            {entry.logic}
          </p>
          <p>
            <span className="font-medium text-neutral-400">What: </span>
            {entry.explanation}
          </p>
          <p>
            <span className="font-medium text-neutral-400">Note: </span>
            {entry.details}
          </p>
        </HoverCardContent>
      </HoverCard>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle
            className={cn(
              "inline size-4 shrink-0 cursor-help text-muted-foreground",
              className,
            )}
          />
        </TooltipTrigger>
        <TooltipContent side={side}>{entry.logic}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
