"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { IlpGroupAllocationPanel } from "@/components/dashboard/investments/ilp-group-allocation-panel"
import { DeleteIlpGroupDialog } from "@/components/dashboard/investments/delete-ilp-group-dialog"
import { type IlpGroupMemberForDonut } from "@/lib/investments/ilp-group-donut-data"
import { cn } from "@/lib/utils"

type CardLike = {
  productId: string
  name: string
  fundValue: number
  fundValueForAllocation: number
  fundReportSnapshot?: Record<string, unknown> | null
}

export function IlpGroupSummaryCard({
  groupId,
  title,
  cards,
  fullPortfolioTotal,
  chartHeight = 380,
  onDeleted,
}: {
  groupId: string
  title: string
  cards: CardLike[]
  fullPortfolioTotal: number
  chartHeight?: number
  onDeleted?: () => void
}) {
  const members: IlpGroupMemberForDonut[] = cards.map((c) => ({
    name: c.name,
    fundValue: c.fundValueForAllocation,
    fundReportSnapshot: c.fundReportSnapshot,
  }))

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        "hover:border-ring/60 hover:bg-muted/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/dashboard/investments/ilp/group/${groupId}`}
          aria-label={`Open ${title} — ILP group details`}
          className={cn(
            "group/link flex min-w-0 flex-1 items-start justify-between gap-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            "rounded-md"
          )}
        >
          <h3 className="truncate text-base font-semibold text-foreground">
            {title}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover/link:text-foreground">
            Details
            <ChevronRight className="size-4 transition-transform group-hover/link:translate-x-0.5" />
          </span>
        </Link>
        <DeleteIlpGroupDialog
          groupId={groupId}
          groupName={title}
          fundCount={cards.length}
          onDeleted={onDeleted}
        />
      </div>

      <div className="mt-3">
        <IlpGroupAllocationPanel
          key={groupId}
          members={members}
          fullPortfolioTotal={fullPortfolioTotal}
          chartHeight={chartHeight}
          legendMaxItems={7}
          variant="summary"
        />
      </div>
    </div>
  )
}
