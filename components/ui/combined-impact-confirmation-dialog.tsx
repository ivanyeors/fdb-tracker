"use client"

import { AlertTriangle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  type ImpactNodeId,
  type DashboardPage,
  type ImpactNode,
  IMPACT_NODES,
  getDownstreamImpacts,
} from "@/lib/impact-graph"

interface CombinedImpactConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Multiple source nodes that are being changed together */
  sourceNodeIds: ImpactNodeId[]
  onConfirm: () => void
}

const PAGE_ORDER: DashboardPage[] = [
  "Tax",
  "CPF",
  "Loans",
  "Insurance",
  "Cashflow",
  "Banks",
  "Investments",
  "Settings",
]

export function CombinedImpactConfirmationDialog({
  open,
  onOpenChange,
  sourceNodeIds,
  onConfirm,
}: CombinedImpactConfirmationDialogProps) {
  // Collect all downstream impacts from all source nodes, deduplicated
  const allImpacts = new Map<ImpactNodeId, ImpactNode>()
  for (const sourceId of sourceNodeIds) {
    for (const node of getDownstreamImpacts(sourceId)) {
      if (!sourceNodeIds.includes(node.id)) {
        allImpacts.set(node.id, node)
      }
    }
  }

  // Group by page
  const grouped = new Map<DashboardPage, ImpactNode[]>()
  for (const node of allImpacts.values()) {
    const existing = grouped.get(node.page)
    if (existing) {
      existing.push(node)
    } else {
      grouped.set(node.page, [node])
    }
  }

  const sortedPages = Array.from(grouped.entries()).sort(
    ([a], [b]) => PAGE_ORDER.indexOf(a) - PAGE_ORDER.indexOf(b),
  )

  const sourceLabels = sourceNodeIds.map((id) => IMPACT_NODES[id].label)

  if (allImpacts.size === 0) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default" className="max-w-md sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-amber-500/15">
            <AlertTriangle className="text-amber-600 dark:text-amber-400" />
          </AlertDialogMedia>
          <AlertDialogTitle>This save affects other calculations</AlertDialogTitle>
          <AlertDialogDescription>
            Updating{" "}
            <strong>{sourceLabels.join(", ")}</strong> will recalculate:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-60 space-y-3 overflow-y-auto px-1">
          {sortedPages.map(([page, nodes]: [DashboardPage, ImpactNode[]]) => (
            <div key={page}>
              <p className="text-sm font-medium">{page}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {nodes.map((node) => (
                  <li key={node.id} className="flex items-center gap-1.5">
                    <span className="size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {node.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Auto-calculated values will use your new inputs until you change them
          again.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Confirm &amp; Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
