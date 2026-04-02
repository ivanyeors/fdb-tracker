"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

export default function TransactionsPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [statementType, setStatementType] = useState("all")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [transactions, setTransactions] = useState<any[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Upload preview state
  const [showPreview, setShowPreview] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewData, setPreviewData] = useState<any>(null)

  const fetchTransactions = useCallback(async () => {
    if (!activeProfileId && !activeFamilyId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const url = new URL("/api/transactions", window.location.origin)
      if (activeProfileId) url.searchParams.set("profileId", activeProfileId)
      else if (activeFamilyId) url.searchParams.set("familyId", activeFamilyId)
      url.searchParams.set("month", month)
      if (statementType !== "all")
        url.searchParams.set("statementType", statementType)

      const res = await fetch(url)
      if (res.ok) {
        setTransactions(await res.json())
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfileId, activeFamilyId, month, statementType])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/bank-accounts?categoriesOnly=true")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setCategories(data)
      }
    } catch {
      // Categories will load empty — user can still view transactions
    }
  }, [])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

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
      fetchTransactions()
    } catch {
      toast.error("Failed to save transactions")
    }
  }

  // Preview category overrides (user edits before saving)
  const [previewCategoryOverrides, setPreviewCategoryOverrides] = useState<
    Map<number, string | null>
  >(new Map())

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
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      ) : (
        <TransactionTable
          transactions={transactions}
          categories={categories}
          onSaved={fetchTransactions}
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
                    "—"}
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
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {previewData?.extracted?.transactions?.map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (txn: any, i: number) => (
                      <tr key={i} className="border-t">
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
