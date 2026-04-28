"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { ButtonSelect } from "@/components/ui/button-select"
import { StatementUpload } from "@/components/dashboard/cashflow/statement-upload"
import { TransactionTable } from "@/components/dashboard/cashflow/transaction-table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useApi } from "@/hooks/use-api"
import { useDataRefresh } from "@/hooks/use-data-refresh"

const STATEMENT_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "bank", label: "Bank" },
  { value: "cc", label: "Credit Card" },
]

interface Category {
  id: string
  name: string
  icon: string | null
}

// Loose transaction shape — keeps narrow casts at call sites. NOSONAR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transaction = any // NOSONAR

export interface TransactionsInitialData {
  transactions: Transaction[]
  categories: Category[]
}

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

function buildTransactionsUrl(
  profileId: string | null,
  familyId: string | null,
  month: string,
  statementType: string,
): string | null {
  if (!profileId && !familyId) return null
  const params = new URLSearchParams()
  if (profileId) params.set("profileId", profileId)
  else if (familyId) params.set("familyId", familyId)
  params.set("month", month)
  if (statementType !== "all") params.set("statementType", statementType)
  return `/api/transactions?${params.toString()}`
}

export function TransactionsClient({
  initialData,
}: {
  readonly initialData: TransactionsInitialData
}) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const { triggerRefresh } = useDataRefresh()
  const [month, setMonth] = useState(getCurrentMonth)
  const [statementType, setStatementType] = useState("all")

  // Upload preview state
  const [showPreview, setShowPreview] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewCategoryOverrides, setPreviewCategoryOverrides] = useState<
    Map<number, string | null>
  >(new Map())

  const transactionsUrl = buildTransactionsUrl(
    activeProfileId,
    activeFamilyId,
    month,
    statementType,
  )

  const { data: transactions, isLoading } = useApi<Transaction[]>(
    transactionsUrl,
    { fallbackData: initialData.transactions },
  )

  const categories = useMemo(
    () => initialData.categories,
    [initialData.categories],
  )

  const txnList = useMemo(() => transactions ?? [], [transactions])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleParsed(result: any) {
    setPreviewData(result)
    setShowPreview(true)
  }

  async function handleConfirmImport() {
    if (!previewData?.extracted || !activeProfileId || !activeFamilyId) return

    const extracted = previewData.extracted
    const txns = extracted.transactions ?? []

    try {
      const res = await fetch("/api/statements/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: activeProfileId,
          familyId: activeFamilyId,
          accountId: null,
          month: extracted.month ?? month,
          statementType:
            extracted.docType === "cc_statement" ? "cc" : "bank",
          transactions: txns.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (t: any, i: number) => ({
              date: t.date,
              valueDate: t.valueDate,
              description: t.description,
              amount: t.amount,
              balance: t.balance,
              txnType: t.txnType,
              categoryId: previewCategoryOverrides.get(i) ?? null,
              foreignCurrency: t.foreignCurrency,
              excludeFromSpending: t.excludeFromSpending ?? false,
              rawText: t.rawText,
            }),
          ),
          openingBalance: extracted.openingBalance,
          closingBalance: extracted.closingBalance,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to save")
        return
      }

      const json = await res.json()
      toast.success(`Imported ${json.saved} transactions`)
      setShowPreview(false)
      setPreviewData(null)
      setPreviewCategoryOverrides(new Map())
      triggerRefresh()
    } catch {
      toast.error("Failed to save transactions")
    }
  }

  const previewTxnCount = previewData?.extracted?.transactions?.length ?? 0
  const previewType =
    previewData?.classification?.type === "cc_statement"
      ? "Credit Card"
      : "Bank"
  const previewBank = previewData?.extracted?.bankName ?? "Unknown"

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Transactions"
        description="View and categorize imported bank and credit card transactions."
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <StatementUpload onParsed={handleParsed} />
        <MonthYearPicker value={month} onChange={(v) => setMonth(v ?? month)} />
        <ButtonSelect
          value={statementType}
          onValueChange={setStatementType}
          options={STATEMENT_TYPE_OPTIONS}
        />
      </div>

      {/* Main Content */}
      {isLoading && !txnList.length ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      ) : (
        <TransactionTable
          transactions={txnList}
          categories={categories}
          onSaved={() => triggerRefresh()}
        />
      )}

      {/* Import Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Import {previewBank} {previewType} Statement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Found <strong>{previewTxnCount}</strong> transactions
            </p>
            {previewData?.extracted?.month && (
              <p>Month: {previewData.extracted.month}</p>
            )}
            {previewData?.extracted?.totalAmountDue !== undefined &&
              previewData?.extracted?.totalAmountDue !== null && (
                <p>
                  Amount Due: $
                  {previewData.extracted.totalAmountDue.toFixed(2)}
                </p>
              )}
            {previewData?.extracted?.openingBalance !== undefined &&
              previewData?.extracted?.openingBalance !== null && (
                <p>
                  Opening: $
                  {previewData.extracted.openingBalance.toLocaleString()}
                  {" → "}
                  Closing: $
                  {previewData.extracted.closingBalance?.toLocaleString() ??
                    "---"}
                </p>
              )}
            <div className="max-h-[300px] overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData?.extracted?.transactions?.map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (txn: any, i: number) => (
                      <tr key={`preview-${txn.date ?? ""}-${txn.description ?? ""}-${i}`} className="border-t">
                        <td className="p-2 whitespace-nowrap">{txn.date}</td>
                        <td className="p-2">{txn.description}</td>
                        <td className="p-2">
                          {categories.length > 0 ? (
                            <select
                              className="h-7 w-full rounded border bg-background px-1 text-xs"
                              value={
                                previewCategoryOverrides.get(i) ??
                                categories.find(
                                  (c) => c.name === txn.categoryName,
                                )?.id ??
                                ""
                              }
                              onChange={(e) => {
                                const next = new Map(previewCategoryOverrides)
                                next.set(i, e.target.value || null)
                                setPreviewCategoryOverrides(next)
                              }}
                            >
                              <option value="">
                                {txn.categoryName || "Uncategorized"}
                              </option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-muted-foreground">
                              {txn.categoryName || "Others"}
                            </span>
                          )}
                        </td>
                        <td
                          className={`p-2 text-right font-mono ${txn.txnType === "credit" ? "text-green-600" : "text-red-600"}`}
                        >
                          {txn.txnType === "credit" ? "+" : ""}
                          {txn.amount?.toFixed(2)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmImport}>
              Import {previewTxnCount} Transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
