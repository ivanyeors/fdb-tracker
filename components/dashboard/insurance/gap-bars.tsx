"use client"

import { useMemo, useState } from "react"
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Heart,
  Activity,
  Cross,
  Accessibility,
  ShieldPlus,
} from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import type { CoverageGapItem } from "@/lib/calculations/insurance"

type GapBarsProps = {
  items: CoverageGapItem[]
  showDollars?: boolean
}

const ICON_MAP: Record<string, React.ElementType> = {
  death: Heart,
  critical_illness: Activity,
  hospitalization: Cross,
  disability: Accessibility,
  personal_accident: ShieldPlus,
}

function getCoveredPct(item: CoverageGapItem): number {
  if (item.coverageType === "hospitalization") {
    return item.hasCoverage ? 100 : 0
  }
  if (item.needed === 0) return item.hasCoverage ? 100 : 0
  return Math.min(item.held / item.needed, 1) * 100
}

function getStatusConfig(pct: number) {
  if (pct >= 100) {
    return {
      icon: ShieldCheck,
      barColor: "bg-emerald-500",
      barTrack: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      label: "Adequate",
    }
  }
  if (pct >= 50) {
    return {
      icon: ShieldAlert,
      barColor: "bg-amber-500",
      barTrack: "bg-amber-500/10",
      iconColor: "text-amber-500",
      badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      label: "Partial",
    }
  }
  return {
    icon: ShieldX,
    barColor: "bg-red-500",
    barTrack: "bg-red-500/10",
    iconColor: "text-red-500",
    badgeBg: "bg-red-500/10 text-red-600 dark:text-red-400",
    label: "Gap",
  }
}

function GapBarRow({
  item,
  showDollars,
  isExpanded,
  onToggle,
}: {
  item: CoverageGapItem
  showDollars: boolean
  isExpanded: boolean
  onToggle: () => void
}) {
  const pct = getCoveredPct(item)
  const status = getStatusConfig(pct)
  const Icon = ICON_MAP[item.coverageType] ?? ShieldPlus
  const isHosp = item.coverageType === "hospitalization"
  const isPA = item.coverageType === "personal_accident"

  const rightLabel = isHosp
    ? item.hasCoverage
      ? "Active ISP"
      : "No ISP"
    : isPA
      ? item.hasCoverage
        ? `$${formatCurrency(item.held)}`
        : "None"
      : showDollars
        ? `$${formatCurrency(item.held)} / $${formatCurrency(item.needed)}`
        : `${Math.round(pct)}%`

  return (
    <div
      className="group rounded-lg border bg-card transition-colors hover:bg-accent/50"
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={onToggle}
      >
        {/* Icon */}
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            status.barTrack,
          )}
        >
          <Icon className={cn("size-4", status.iconColor)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {rightLabel}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                  status.badgeBg,
                )}
              >
                {status.label}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  status.barColor,
                )}
                style={{ width: `${Math.max(pct, isHosp && !item.hasCoverage ? 0 : 1)}%` }}
              />
            </div>
            {!isPA && !isHosp && (
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {Math.round(pct)}%
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t px-4 py-3 pl-[3.75rem]">
          {isHosp ? (
            <p className="text-xs text-muted-foreground">
              {item.hasCoverage
                ? "You have an active Integrated Shield Plan. This covers private hospital bills beyond MediShield Life."
                : "No Integrated Shield Plan found. MediShield Life provides basic coverage only. Consider a private ISP for better hospital coverage."}
            </p>
          ) : isPA ? (
            <p className="text-xs text-muted-foreground">
              {item.hasCoverage
                ? `Personal accident coverage of $${formatCurrency(item.held)}. No standard benchmark — this is informational.`
                : "No personal accident coverage found. This is optional but provides protection against accidental death and disability."}
            </p>
          ) : (
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Coverage held</span>
                <span className="tabular-nums font-medium text-foreground">
                  ${formatCurrency(item.held)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Benchmark needed</span>
                <span className="tabular-nums">
                  ${formatCurrency(item.needed)}
                </span>
              </div>
              {item.gap > 0 && (
                <div className="flex justify-between font-medium text-red-600 dark:text-red-400">
                  <span>Shortfall</span>
                  <span className="tabular-nums">
                    ${formatCurrency(item.gap)} ({Math.round(item.gapPct)}%)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function GapBars({ items, showDollars = false }: GapBarsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const displayItems = useMemo(
    () =>
      items.filter(
        (i) => i.coverageType !== "personal_accident" || i.held > 0,
      ),
    [items],
  )

  if (displayItems.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No coverage data available.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {displayItems.map((item, idx) => (
        <GapBarRow
          key={item.coverageType}
          item={item}
          showDollars={showDollars}
          isExpanded={expandedIdx === idx}
          onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
        />
      ))}
    </div>
  )
}
