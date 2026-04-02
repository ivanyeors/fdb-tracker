"use client"

import { useEffect, useRef } from "react"
import { useReactFlow, type Node } from "@xyflow/react"
import type { CalcNodeData } from "@/lib/developer/graph-adapter"
import { Maximize2, Eye, FileCode, Copy, Focus } from "lucide-react"
import { toast } from "sonner"

interface ContextMenuState {
  x: number
  y: number
  node?: Node<CalcNodeData>
}

interface CanvasContextMenuProps {
  menu: ContextMenuState | null
  onClose: () => void
  onSelectNode: (node: Node<CalcNodeData>) => void
}

export function CanvasContextMenu({
  menu,
  onClose,
  onSelectNode,
}: CanvasContextMenuProps) {
  const { fitView, setCenter } = useReactFlow()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as HTMLElement)
      ) {
        onClose()
      }
    }
    if (menu) {
      document.addEventListener("mousedown", handleClick)
    }
    return () => document.removeEventListener("mousedown", handleClick)
  }, [menu, onClose])

  if (!menu) return null

  const node = menu.node

  const items = node
    ? [
        {
          icon: Focus,
          label: "Focus on Node",
          onClick: () => {
            setCenter(node.position.x + 100, node.position.y + 40, {
              zoom: 1.5,
              duration: 300,
            })
            onClose()
          },
        },
        {
          icon: Eye,
          label: "View Details",
          onClick: () => {
            onSelectNode(node as Node<CalcNodeData>)
            onClose()
          },
        },
        {
          icon: FileCode,
          label: "Copy File Path",
          onClick: () => {
            navigator.clipboard.writeText((node.data as CalcNodeData).filePath)
            toast.success("File path copied")
            onClose()
          },
        },
        {
          icon: Copy,
          label: "Copy Node ID",
          onClick: () => {
            navigator.clipboard.writeText(node.id)
            toast.success("Node ID copied")
            onClose()
          },
        },
      ]
    : [
        {
          icon: Maximize2,
          label: "Fit View",
          onClick: () => {
            fitView({ duration: 300, padding: 0.15 })
            onClose()
          },
        },
      ]

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border bg-popover p-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-popover-foreground hover:bg-accent"
          onClick={item.onClick}
        >
          <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
          {item.label}
        </button>
      ))}
    </div>
  )
}
