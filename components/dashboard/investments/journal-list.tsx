"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { ChevronDown, ChevronUp } from "lucide-react"
import { type DateRange } from "react-day-picker"
import Image from "next/image"

export interface JournalEntry {
  id: string
  symbol: string
  type: "buy" | "sell"
  quantity: number
  price: number
  journalText?: string
  screenshotUrl?: string
  date: string
}

interface JournalListProps {
  entries: JournalEntry[]
}

function isInDateRange(
  dateStr: string,
  range: DateRange | undefined
): boolean {
  if (!range?.from) return true
  const entryDate = new Date(dateStr)
  if (range.to) {
    const toEnd = new Date(range.to)
    toEnd.setHours(23, 59, 59, 999)
    return entryDate >= range.from && entryDate <= toEnd
  }
  return entryDate >= range.from
}

export function JournalList({ entries }: JournalListProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const [filter, setFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "buy" | "sell">("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    undefined
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = entries.filter((e) => {
    const matchSymbol = e.symbol
      .toLowerCase()
      .includes(filter.toLowerCase())
    const matchType = typeFilter === "all" || e.type === typeFilter
    const matchDate = isInDateRange(e.date, dateRange)
    return matchSymbol && matchType && matchDate
  })

  function fmt(n: number): string {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by symbol…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-48"
        />
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          placeholder="Pick date range"
          className="w-[280px]"
        />
        <div className="flex gap-1">
          {(["all", "buy", "sell"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeFilter === t ? "default" : "outline"}
              onClick={() => setTypeFilter(t)}
            >
              {t.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((entry) => {
          const expanded = expandedId === entry.id
          const total = entry.quantity * entry.price
          return (
            <div
              key={entry.id}
              className="rounded-lg border p-3"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() =>
                  setExpandedId(expanded ? null : entry.id)
                }
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{entry.date}</span>
                  <span className="font-semibold">{entry.symbol}</span>
                  <Badge
                    className={cn(
                      entry.type === "buy"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/15 text-red-600 dark:text-red-400",
                    )}
                  >
                    {entry.type.toUpperCase()}
                  </Badge>
                  <span>
                    {fmt(entry.quantity)} @ {formatMoney(entry.price)}
                  </span>
                  <span className="text-muted-foreground">
                    Total: {formatMoney(total)}
                  </span>
                </div>
                {expanded ? (
                  <ChevronUp className="size-4 shrink-0" />
                ) : (
                  <ChevronDown className="size-4 shrink-0" />
                )}
              </button>

              {entry.journalText && !expanded && (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {entry.journalText}
                </p>
              )}

              {expanded && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {entry.journalText && (
                    <p className="text-sm text-muted-foreground">
                      {entry.journalText}
                    </p>
                  )}
                  {entry.screenshotUrl && (
                    <Image
                      src={entry.screenshotUrl}
                      alt={`${entry.symbol} screenshot`}
                      width={800}
                      height={600}
                      className="h-48 w-auto max-w-full rounded-md border object-cover"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No journal entries found.
          </p>
        )}
      </div>
    </div>
  )
}
