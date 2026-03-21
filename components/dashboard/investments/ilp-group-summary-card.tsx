"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import {
  allocationSlicesForIlpGroup,
  groupUsesCategoryBuckets,
  type IlpGroupMemberForDonut,
} from "@/lib/investments/ilp-group-donut-data"
import { cn } from "@/lib/utils"

type CardLike = IlpGroupMemberForDonut & {
  productId: string
}

export function IlpGroupSummaryCard({
  groupId,
  title,
  cards,
  fullPortfolioTotal,
  chartHeight = 260,
}: {
  groupId: string
  title: string
  cards: CardLike[]
  fullPortfolioTotal: number
  chartHeight?: number
}) {
  const members: IlpGroupMemberForDonut[] = cards.map((c) => ({
    name: c.name,
    fundValue: c.fundValue,
    fundReportSnapshot: c.fundReportSnapshot,
  }))

  const allocationData = allocationSlicesForIlpGroup(members)
  const groupTotal = cards.reduce((s, c) => s + c.fundValue, 0)
  const centerSubtitle =
    fullPortfolioTotal > 0 && groupTotal > 0
      ? `${((groupTotal / fullPortfolioTotal) * 100).toFixed(1)}% of portfolio`
      : undefined

  const byCategory = groupUsesCategoryBuckets(members)

  return (
    <Link
      href={`/dashboard/investments/ilp/group/${groupId}`}
      aria-label={`Open ${title} — ILP group details`}
      className={cn(
        "group block rounded-xl border bg-card p-4 transition-colors",
        "hover:border-ring/60 hover:bg-muted/20",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {title}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {byCategory
                  ? "Allocation by Morningstar category (from latest report)"
                  : "Allocation by fund"}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              Details
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>

      {allocationData.length === 0 ? (
        <div className="mt-4 flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No fund value in this group yet.
        </div>
      ) : (
        <div className="mt-2 min-h-0 w-full">
          <AllocationChart
            data={allocationData}
            height={chartHeight}
            legendMaxItems={3}
            centerSubtitle={centerSubtitle}
            legendLayout="beside"
          />
        </div>
      )}
    </Link>
  )
}
