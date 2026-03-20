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

export interface Holding {
  symbol: string
  type: string
  units: number
  costBasis: number
  currentPrice: number | null
  currentValue: number | null
  pnl: number | null
  pnlPct: number | null
  portfolioPct: number
  createdAt?: string
}

type SortKey = keyof Holding
type SortDir = "asc" | "desc"

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface HoldingsTableProps {
  holdings: Holding[]
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
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

  const sorted = [...holdings].sort((a, b) => {
    if (sortKey === "symbol" || sortKey === "type") {
      const av = a[sortKey]
      const bv = b[sortKey]
      return sortDir === "asc"
        ? av.localeCompare(bv)
        : bv.localeCompare(av)
    }
    const av = a[sortKey] as number | null
    const bv = b[sortKey] as number | null
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
    { key: "pnl", label: "P&L ($)" },
    { key: "pnlPct", label: "P&L (%)" },
    { key: "portfolioPct", label: "% of Portfolio" },
  ]

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
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((h) => (
          <TableRow key={h.createdAt ? `${h.symbol}-${h.createdAt}` : h.symbol}>
            <TableCell className="font-semibold">{h.symbol}</TableCell>
            <TableCell>
              <Badge variant="secondary">{h.type.toUpperCase()}</Badge>
            </TableCell>
            <TableCell>{fmt(h.units)}</TableCell>
            <TableCell>${fmt(h.costBasis)}</TableCell>
            <TableCell>
              {h.currentValue == null ? "—" : `$${fmt(h.currentValue)}`}
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
                  ${fmt(Math.abs(h.pnl))}
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
              {h.currentValue == null ? "—" : `${fmt(h.portfolioPct)}%`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
