"use client"

import { useReactFlow } from "@xyflow/react"
import { Button } from "@/components/ui/button"
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  RotateCcw,
  Grid3x3,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { TooltipProvider } from "@/components/ui/tooltip"

interface CanvasToolbarProps {
  onResetLayout: () => void
  onExportJSON: () => void
  snapToGrid: boolean
  onToggleSnap: () => void
}

export function CanvasToolbar({
  onResetLayout,
  onExportJSON,
  snapToGrid,
  onToggleSnap,
}: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  const tools = [
    {
      icon: ZoomIn,
      label: "Zoom In",
      onClick: () => zoomIn({ duration: 200 }),
    },
    {
      icon: ZoomOut,
      label: "Zoom Out",
      onClick: () => zoomOut({ duration: 200 }),
    },
    {
      icon: Maximize2,
      label: "Fit View",
      onClick: () => fitView({ duration: 300, padding: 0.15 }),
    },
    { divider: true } as const,
    {
      icon: Grid3x3,
      label: snapToGrid ? "Snap to Grid: On" : "Snap to Grid: Off",
      onClick: onToggleSnap,
      active: snapToGrid,
    },
    {
      icon: RotateCcw,
      label: "Reset Layout",
      onClick: onResetLayout,
    },
    { divider: true } as const,
    {
      icon: Download,
      label: "Export JSON",
      onClick: onExportJSON,
    },
  ]

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur-sm">
        {tools.map((tool, i) => {
          if ("divider" in tool) {
            return (
              <div key={`div-${i}`} className="mx-0.5 h-5 w-px bg-border" />
            )
          }
          return (
            <Tooltip key={tool.label}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${
                    "active" in tool && tool.active
                      ? "bg-primary/10 text-primary"
                      : ""
                  }`}
                  onClick={tool.onClick}
                >
                  <tool.icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {tool.label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
