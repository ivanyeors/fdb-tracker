"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ChevronsUpDown } from "lucide-react"
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
import {
  buildUnifiedPositionList,
  type IlpProductForAllocation,
  type PositionRow,
} from "@/lib/investments/allocation-views"
import type { Holding } from "@/lib/investments/holding"

const TYPE_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  stock: "default",
  etf: "secondary",
  bond: "outline",
  gold: "secondary",
  silver: "secondary",
  ilp: "outline",
  cash: "outline",
}

const TYPE_LABEL: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  bond: "Bond",
  gold: "Gold",
  silver: "Silver",
  ilp: "ILP",
  cash: "Cash",
}

type SortKey = "value" | "percentage" | "cumulativePercentage" | "name"
type SortDir = "asc" | "desc"

interface ConcentrationTableProps {
  readonly holdings: readonly Holding[]
  readonly ilpProducts: readonly IlpProductForAllocation[]
  readonly cashBalance: number
  readonly fullPortfolioTotal: number
}

export function ConcentrationTable({
  holdings,
  ilpProducts,
  cashBalance,
  fullPortfolioTotal,
}: ConcentrationTableProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const [sortKey, setSortKey] = useState<SortKey>("value")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const positions = useMemo(
    () =>
      buildUnifiedPositionList(
        holdings,
        ilpProducts,
        cashBalance,
        fullPortfolioTotal,
      ),
    [holdings, ilpProducts, cashBalance, fullPortfolioTotal],
  )

  const sorted = useMemo(() => {
    if (sortKey === "value" && sortDir === "desc") return positions
    const copy = [...positions]
    copy.sort((a, b) => {
      const av = sortKey === "name" ? a.name : a[sortKey]
      const bv = sortKey === "name" ? b.name : b[sortKey]
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av)
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number)
    })
    // Recalculate cumulative after resorting
    let cum = 0
    return copy.map((r) => {
      cum += r.percentage
      return { ...r, cumulativePercentage: cum }
    })
  }, [positions, sortKey, sortDir])

  const maxPct = positions[0]?.percentage ?? 1

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }

  if (positions.length === 0) return null

  const sortIcon = <ChevronsUpDown className="size-3 text-muted-foreground" />

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("name")}
              >
                <span className="inline-flex items-center gap-1">
                  Position {sortIcon}
                </span>
              </TableHead>
              <TableHead className="w-16">Type</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("value")}
              >
                <span className="inline-flex items-center gap-1">
                  Value {sortIcon}
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("percentage")}
              >
                <span className="inline-flex items-center gap-1">
                  % Portfolio {sortIcon}
                </span>
              </TableHead>
              <TableHead
                className="hidden cursor-pointer select-none text-right sm:table-cell"
                onClick={() => handleSort("cumulativePercentage")}
              >
                <span className="inline-flex items-center gap-1">
                  Cum. % {sortIcon}
                </span>
              </TableHead>
              <TableHead className="hidden w-36 md:table-cell" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row, i) => (
              <ConcentrationRow
                key={`${row.type}-${row.name}-${i}`}
                row={row}
                maxPct={maxPct}
                formatMoney={formatMoney}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ConcentrationRow({
  row,
  maxPct,
  formatMoney,
}: {
  readonly row: PositionRow
  readonly maxPct: number
  readonly formatMoney: (v: number) => string
}) {
  const barWidth = maxPct > 0 ? (row.percentage / maxPct) * 100 : 0
  const isTail = row.cumulativePercentage > 80

  return (
    <TableRow className={cn(isTail && "opacity-60")}>
      <TableCell className="font-medium">
        <span className="flex items-center gap-1.5">
          {row.percentage >= 20 && (
            <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
          )}
          <span className="truncate">{row.name}</span>
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={TYPE_BADGE_VARIANT[row.type] ?? "outline"} className="text-[10px]">
          {TYPE_LABEL[row.type] ?? row.type}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(row.value)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.percentage.toFixed(1)}%
      </TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">
        {row.cumulativePercentage.toFixed(1)}%
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary/60"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}
