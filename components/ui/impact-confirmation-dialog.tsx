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
  getImpactsByPage,
} from "@/lib/impact-graph"

interface ImpactConfirmationDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly sourceNodeId: ImpactNodeId
  readonly onConfirm: () => void
  /** Show extra notice when overriding an auto-calculated value */
  readonly overridingAutoValue?: boolean
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

export function ImpactConfirmationDialog({
  open,
  onOpenChange,
  sourceNodeId,
  onConfirm,
  overridingAutoValue,
}: ImpactConfirmationDialogProps) {
  const sourceNode = IMPACT_NODES[sourceNodeId]
  const impactsByPage = getImpactsByPage(sourceNodeId)

  // Sort pages by defined order
  const sortedPages = Array.from(impactsByPage.entries()).sort(
    ([a], [b]) => PAGE_ORDER.indexOf(a) - PAGE_ORDER.indexOf(b),
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default" className="max-w-md sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-amber-500/15">
            <AlertTriangle className="text-amber-600 dark:text-amber-400" />
          </AlertDialogMedia>
          <AlertDialogTitle>This change affects other calculations</AlertDialogTitle>
          <AlertDialogDescription>
            Updating <strong>{sourceNode.label}</strong> will recalculate:
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

        {overridingAutoValue && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            This will override the auto-calculated value.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Auto-calculated values will use your new input until you change them
          again.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Confirm &amp; Update
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export type { ImpactConfirmationDialogProps }
