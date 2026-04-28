"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react"
import {
  ResponsiveSheet as Sheet,
  ResponsiveSheetContent as SheetContent,
  ResponsiveSheetDescription as SheetDescription,
  ResponsiveSheetHeader as SheetHeader,
  ResponsiveSheetTitle as SheetTitle,
} from "@/components/ui/responsive-sheet"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { Holding } from "@/lib/investments/holding"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { EditHoldingDialog } from "@/components/dashboard/investments/edit-holding-dialog"
import { DeleteHoldingDialog } from "@/components/dashboard/investments/delete-holding-dialog"
import { SellHoldingDialog } from "@/components/dashboard/investments/sell-holding-dialog"

type TxRow = {
  id: string
  symbol: string
  type: string
  quantity: number
  price: number
  journal_text?: string | null
  screenshot_url?: string | null
  created_at: string
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatTxDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-SG", {
      dateStyle: "short",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

interface HoldingDetailSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly summary: Holding | null
  readonly lots: Holding[]
  readonly profileId: string | null
  readonly familyId: string | null
  readonly onChanged?: () => void
}

export function HoldingDetailSheet({
  open,
  onOpenChange,
  summary,
  lots,
  profileId,
  familyId,
  onChanged,
}: HoldingDetailSheetProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const [txLoading, setTxLoading] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TxRow[]>([])

  const loadTransactions = useCallback(async () => {
    if (!summary || (!profileId && !familyId)) return
    const params = new URLSearchParams()
    if (profileId) params.set("profileId", profileId)
    else if (familyId) params.set("familyId", familyId)
    params.set("symbol", summary.symbol)
    params.set("limit", "500")

    setTxLoading(true)
    setTxError(null)
    try {
      const res = await fetch(
        `/api/investments/transactions?${params.toString()}`,
        { credentials: "include" },
      )
      if (!res.ok) {
        setTxError("Could not load transactions.")
        setTransactions([])
        return
      }
      const data = (await res.json()) as TxRow[]
      setTransactions(Array.isArray(data) ? data : [])
    } catch {
      setTxError("Could not load transactions.")
      setTransactions([])
    } finally {
      setTxLoading(false)
    }
  }, [summary, profileId, familyId])

  useEffect(() => {
    if (open && summary) {
      void loadTransactions()
    }
  }, [open, summary, loadTransactions])

  const handleSuccess = () => {
    onChanged?.()
    void loadTransactions()
  }

  if (!summary) return null

  const buys = transactions.filter((t) => t.type === "buy")
  const sells = transactions.filter((t) => t.type === "sell")
  const showLots = lots.length > 1

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span>{summary.symbol}</span>
            <Badge variant="secondary">{summary.type.toUpperCase()}</Badge>
          </SheetTitle>
          <SheetDescription>
            {fmt(summary.units)} units · Total invested{" "}
            {formatMoney(summary.costBasis)}
            {summary.currentValue != null ? (
              <>
                {" "}
                · Value {formatMoney(summary.currentValue)}
              </>
            ) : null}
          </SheetDescription>
          {summary.pnl != null ? (
            <p
              className={cn(
                "text-sm font-medium",
                summary.pnl >= 0 ? "text-emerald-500" : "text-red-500",
              )}
            >
              Unrealised P&amp;L:{" "}
              {summary.pnl >= 0 ? (
                <ArrowUp className="inline size-3" />
              ) : (
                <ArrowDown className="inline size-3" />
              )}{" "}
              {formatMoney(Math.abs(summary.pnl))}
              {summary.pnlPct != null ? ` (${fmt(summary.pnlPct)}%)` : ""}
            </p>
          ) : null}
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-4">
            {showLots ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Positions</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Units</TableHead>
                      <TableHead>Invested</TableHead>
                      <TableHead className="w-[140px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lots.map((lot) => (
                      <TableRow key={lot.id}>
                        <TableCell>{fmt(lot.units)}</TableCell>
                        <TableCell>{formatMoney(lot.costBasis)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            {lot.units > 0 && lot.id && !lot.id.startsWith("group:") ? (
                              <SellHoldingDialog
                                initial={{
                                  symbol: lot.symbol,
                                  maxUnits: lot.units,
                                  holdingType: lot.type,
                                }}
                                onSuccess={handleSuccess}
                              />
                            ) : null}
                            {lot.id && !lot.id.startsWith("group:") ? (
                              <>
                                <EditHoldingDialog
                                  initial={{
                                    id: lot.id,
                                    symbol: lot.symbol,
                                    type: lot.type,
                                    units: lot.units,
                                    costPerUnit: lot.costPerUnit,
                                  }}
                                  onSuccess={handleSuccess}
                                />
                                <DeleteHoldingDialog
                                  investmentId={lot.id}
                                  symbol={lot.symbol}
                                  onSuccess={handleSuccess}
                                />
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            ) : null}

            {(() => {
              if (txLoading) {
                return (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading transactions…
              </div>
                )
              }
              if (txError) return <p className="py-4 text-sm text-destructive">{txError}</p>
              return (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Buys</h3>
                  {buys.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">
                      No buy transactions.
                    </p>
                  ) : (
                    <TxTable rows={buys} formatMoney={formatMoney} />
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Sells</h3>
                  {sells.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">
                      No sell transactions.
                    </p>
                  ) : (
                    <TxTable rows={sells} formatMoney={formatMoney} />
                  )}
                </section>
              </>
              )
            })()}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function TxTable({
  rows,
  formatMoney,
}: {
  readonly rows: TxRow[]
  readonly formatMoney: (n: number) => string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const total = row.quantity * row.price
          return (
            <TableRow key={row.id}>
              <TableCell className="align-top text-muted-foreground">
                <div className="max-w-[120px] text-xs">
                  {formatTxDate(row.created_at)}
                </div>
                {row.journal_text ? (
                  <p className="mt-1 text-foreground text-xs leading-snug">
                    {row.journal_text}
                  </p>
                ) : null}
                {row.screenshot_url ? (
                  <Image
                    src={row.screenshot_url}
                    alt="Attachment"
                    width={400}
                    height={300}
                    className="mt-2 h-32 w-auto max-w-full rounded border object-cover"
                  />
                ) : null}
              </TableCell>
              <TableCell className="text-right align-top">
                {fmt(row.quantity)}
              </TableCell>
              <TableCell className="text-right align-top">
                {formatMoney(row.price)}
              </TableCell>
              <TableCell className="text-right align-top font-medium">
                {formatMoney(total)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
