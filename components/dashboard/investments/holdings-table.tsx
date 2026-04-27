"use client"

import { useState } from "react"
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { EditHoldingDialog } from "@/components/dashboard/investments/edit-holding-dialog"
import { DeleteHoldingDialog } from "@/components/dashboard/investments/delete-holding-dialog"
import { SellHoldingDialog } from "@/components/dashboard/investments/sell-holding-dialog"
import type { Holding } from "@/lib/investments/holding"

export type { Holding }

export interface HoldingGroup {
  summary: Holding
  lots: Holding[]
}

type SortKey =
  | "symbol"
  | "type"
  | "units"
  | "costBasis"
  | "currentValue"
  | "pnl"
  | "pnlPct"
  | "portfolioPct"
type SortDir = "asc" | "desc"

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface HoldingsTableProps {
  readonly groups: HoldingGroup[]
  readonly onRowClick?: (group: HoldingGroup) => void
  readonly onChanged?: () => void
  /** When set, % of Portfolio uses this denominator (full portfolio incl. cash + ILP). */
  readonly portfolioDenominator?: number
}

export function HoldingsTable({
  groups,
  onRowClick,
  onChanged,
  portfolioDenominator,
}: HoldingsTableProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const [sortKey, setSortKey] = useState<SortKey>("currentValue")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const sorted = [...groups].sort((a, b) => {
    const ha = a.summary
    const hb = b.summary
    if (sortKey === "symbol" || sortKey === "type") {
      const av = ha[sortKey]
      const bv = hb[sortKey]
      return sortDir === "asc"
        ? av.localeCompare(bv)
        : bv.localeCompare(av)
    }
    const av = ha[sortKey]
    const bv = hb[sortKey]
    const nullLast = (n: number | null) =>
      n ??
      (sortDir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
    const aOrd = nullLast(av)
    const bOrd = nullLast(bv)
    return sortDir === "asc" ? aOrd - bOrd : bOrd - aOrd
  })

  const columns: { key: SortKey; label: string }[] = [
    { key: "symbol", label: "Symbol" },
    { key: "type", label: "Type" },
    { key: "units", label: "Units" },
    { key: "costBasis", label: "Total Invested" },
    { key: "currentValue", label: "Current Value" },
    { key: "pnl", label: "P&L" },
    { key: "pnlPct", label: "P&L (%)" },
    { key: "portfolioPct", label: "% of Portfolio" },
  ]

  const showActions =
    groups.length > 0 &&
    groups.every((g) => g.lots.length > 0 && g.lots.every((h) => h.id))

  function pctOfPortfolio(h: Holding): number {
    if (
      portfolioDenominator != null &&
      portfolioDenominator > 0 &&
      h.currentValue != null
    ) {
      return (h.currentValue / portfolioDenominator) * 100
    }
    return h.portfolioPct
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className="cursor-pointer select-none"
              onClick={() => handleSort(col.key)}
            >
              <span className="inline-flex items-center gap-1">
                {col.label}
                {sortKey === col.key ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="size-3" />
                  ) : (
                    <ArrowDown className="size-3" />
                  )
                ) : (
                  <ChevronsUpDown className="size-3 opacity-30" />
                )}
              </span>
            </TableHead>
          ))}
          {showActions ? (
            <TableHead className="w-[130px] text-right">Actions</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((g) => {
          const h = g.summary
          const singleLot = g.lots.length === 1 ? g.lots[0] : null
          return (
            <TableRow
              key={h.id || `${h.symbol}-${h.createdAt ?? ""}`}
              className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
              onClick={() => onRowClick?.(g)}
            >
              <TableCell className="font-semibold">{h.symbol}</TableCell>
              <TableCell>
                <Badge variant="secondary">{h.type.toUpperCase()}</Badge>
              </TableCell>
              <TableCell>{fmt(h.units)}</TableCell>
              <TableCell>{formatMoney(h.costBasis)}</TableCell>
              <TableCell>
                {h.currentValue == null ? "—" : formatMoney(h.currentValue)}
              </TableCell>
              <TableCell>
                {h.pnl == null ? (
                  "—"
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      h.pnl >= 0 ? "text-emerald-500" : "text-red-500",
                    )}
                  >
                    {h.pnl >= 0 ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )}
                    {formatMoney(Math.abs(h.pnl))}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {h.pnlPct == null ? (
                  "—"
                ) : (
                  <span
                    className={cn(
                      h.pnlPct >= 0 ? "text-emerald-500" : "text-red-500",
                    )}
                  >
                    {h.pnlPct >= 0 ? "+" : ""}
                    {fmt(h.pnlPct)}%
                  </span>
                )}
              </TableCell>
              <TableCell>
                {h.currentValue == null ? "—" : `${fmt(pctOfPortfolio(h))}%`}
              </TableCell>
              {showActions && singleLot?.id ? (
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end gap-0.5">
                    {singleLot.units > 0 ? (
                      <SellHoldingDialog
                        initial={{
                          symbol: singleLot.symbol,
                          maxUnits: singleLot.units,
                          holdingType: singleLot.type,
                        }}
                        defaultPrice={singleLot.currentPrice}
                        onSuccess={onChanged}
                      />
                    ) : null}
                    <EditHoldingDialog
                      initial={{
                        id: singleLot.id,
                        symbol: singleLot.symbol,
                        type: singleLot.type,
                        units: singleLot.units,
                        costPerUnit: singleLot.costPerUnit,
                      }}
                      onSuccess={onChanged}
                    />
                    <DeleteHoldingDialog
                      investmentId={singleLot.id}
                      symbol={singleLot.symbol}
                      onSuccess={onChanged}
                    />
                  </div>
                </TableCell>
              ) : showActions ? (
                <TableCell
                  className="text-right text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  —
                </TableCell>
              ) : null}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
