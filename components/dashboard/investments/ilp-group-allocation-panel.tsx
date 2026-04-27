"use client"

import { useMemo, useState } from "react"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import { Button } from "@/components/ui/button"
import {
  allocationModeForGroupSummaryCard,
  allocationSlicesForIlpGroupMode,
  availableIlpGroupAllocationModes,
  defaultIlpGroupAllocationMode,
  groupHasHoldingsSlices,
  subtitleForGroupSummaryCard,
  subtitleForIlpGroupAllocationMode,
  type IlpGroupAllocationMode,
  type IlpGroupMemberForDonut,
} from "@/lib/investments/ilp-group-donut-data"
import { cn } from "@/lib/utils"

export function IlpGroupAllocationPanel({
  members,
  fullPortfolioTotal,
  chartHeight = 260,
  legendMaxItems = 6,
  className,
  percentOfWhat = "portfolio",
  variant = "default",
}: {
  readonly members: readonly IlpGroupMemberForDonut[]
  readonly fullPortfolioTotal: number
  readonly chartHeight?: number
  readonly legendMaxItems?: number
  readonly className?: string
  /** Shown as “{pct}% of {percentOfWhat}” under the donut center. */
  readonly percentOfWhat?: string
  /** `summary`: merged holdings donut only (no mode tabs), for ILP tab group cards. */
  readonly variant?: "default" | "summary"
}) {
  const modes = useMemo(() => availableIlpGroupAllocationModes(members), [members])
  const [mode, setMode] = useState<IlpGroupAllocationMode | null>(null)

  const effectiveMode = useMemo(() => {
    if (variant === "summary") {
      return allocationModeForGroupSummaryCard(members)
    }
    if (mode && modes.some((m) => m.mode === mode)) return mode
    return defaultIlpGroupAllocationMode(members)
  }, [variant, mode, modes, members])

  const allocationData = useMemo(
    () => allocationSlicesForIlpGroupMode(members, effectiveMode),
    [members, effectiveMode],
  )

  const groupTotal = useMemo(
    () => members.reduce((s, m) => s + m.fundValue, 0),
    [members],
  )

  const centerSubtitle =
    fullPortfolioTotal > 0 && groupTotal > 0
      ? `${((groupTotal / fullPortfolioTotal) * 100).toFixed(1)}% of ${percentOfWhat}`
      : undefined

  const subtitle =
    variant === "summary"
      ? subtitleForGroupSummaryCard(members)
      : subtitleForIlpGroupAllocationMode(effectiveMode)
  const showTabs = variant === "default" && modes.length > 1
  const holdingsAvailable = groupHasHoldingsSlices(members)

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      {showTabs ? (
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Group allocation view"
        >
          {modes.map(({ mode: m, label }) => (
            <Button
              key={m}
              type="button"
              role="tab"
              variant={effectiveMode === m ? "secondary" : "ghost"}
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px] font-medium"
              aria-selected={effectiveMode === m}
              onClick={() => setMode(m)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}

      <p className="min-h-[2.5rem] text-xs text-muted-foreground">{subtitle}</p>

      {!holdingsAvailable ? (
        <p className="text-[10px] leading-snug text-muted-foreground/90">
          The companies view needs a saved fund report that includes the portfolio
          holdings table. Re-import the latest .mhtml from the insurer if you
          don’t see that tab.
        </p>
      ) : null}

      {allocationData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-sm text-muted-foreground">
          {members.length === 0
            ? "No funds in this group yet."
            : groupTotal <= 0
              ? "No fund balance to weight this chart. Enter a fund value on the latest monthly entry, or ensure a prior month has a positive balance."
              : variant === "summary"
                ? "Could not build allocation from the current data. Re-import fund reports if holdings are missing."
                : "Could not build allocation from the current data. Re-import fund reports if holdings are missing, or try another view above."}
        </div>
      ) : (
        <div className="min-h-0 w-full min-w-0">
          <AllocationChart
            data={allocationData}
            height={chartHeight}
            legendMaxItems={legendMaxItems}
            centerSubtitle={centerSubtitle}
            legendLayout="beside"
          />
        </div>
      )}
    </div>
  )
}
