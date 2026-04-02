"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { ButtonSelect } from "@/components/ui/button-select"
import { TransactionTable } from "@/components/dashboard/cashflow/transaction-table"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useApi } from "@/hooks/use-api"
import { useDataRefresh } from "@/hooks/use-data-refresh"
import {
  ImportPreviewDialog,
  type ParsedFile,
  type ParsedResult,
} from "@/components/dashboard/cashflow/import-preview-dialog"
import { CategoryManagerButton } from "@/components/dashboard/cashflow/category-manager"

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transaction = any

interface CategoryRule {
  match_pattern: string
  category_id: string
  source: string
  priority: number
}

export interface SpendingBreakdownInitialData {
  transactions: Transaction[]
  categories: Category[]
  categoryRules?: CategoryRule[]
}

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

function buildTransactionsUrl(
  profileId: string | null,
  familyId: string | null,
  month: string,
  statementType: string
): string | null {
  if (!profileId && !familyId) return null
  const params = new URLSearchParams()
  if (profileId) params.set("profileId", profileId)
  else if (familyId) params.set("familyId", familyId)
  params.set("month", month)
  if (statementType !== "all") params.set("statementType", statementType)
  return `/api/transactions?${params.toString()}`
}

export function SpendingBreakdownTab({
  initialData,
  parsedResults,
  onImportComplete,
  householdId,
}: {
  initialData: SpendingBreakdownInitialData
  parsedResults: ParsedResult[]
  onImportComplete: () => void
  householdId: string
}) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const { triggerRefresh } = useDataRefresh()
  const [month, setMonth] = useState(getCurrentMonth)
  const [statementType, setStatementType] = useState("all")

  // Import preview state
  const [showPreview, setShowPreview] = useState(false)
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([])

  const transactionsUrl = buildTransactionsUrl(
    activeProfileId,
    activeFamilyId,
    month,
    statementType
  )

  const { data: transactions, isLoading } = useApi<Transaction[]>(
    transactionsUrl,
    { fallbackData: initialData.transactions }
  )

  const categories = useMemo(
    () => initialData.categories,
    [initialData.categories]
  )

  const txnList = useMemo(() => transactions ?? [], [transactions])

  // When parent provides new parsed results, open the preview dialog
  const lastResultCount = useMemo(() => parsedResults.length, [parsedResults])
  useMemo(() => {
    if (parsedResults.length > 0) {
      setParsedFiles(
        parsedResults.map((r, i) => ({
          fileName: r._fileName ?? `File ${i + 1}`,
          result: r,
          categoryOverrides: new Map(),
        }))
      )
      setShowPreview(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResultCount])

  function handleCategoryOverride(
    fileIndex: number,
    txnIndex: number,
    categoryId: string | null
  ) {
    setParsedFiles((prev) => {
      const next = [...prev]
      const file = { ...next[fileIndex] }
      const overrides = new Map(file.categoryOverrides)
      overrides.set(txnIndex, categoryId)
      file.categoryOverrides = overrides
      next[fileIndex] = file
      return next
    })
  }

  function handleRemoveFile(fileIndex: number) {
    setParsedFiles((prev) => prev.filter((_, i) => i !== fileIndex))
    if (parsedFiles.length <= 1) {
      setShowPreview(false)
    }
  }

  async function handleConfirmImport() {
    if (!activeProfileId || !activeFamilyId) return

    let totalSaved = 0
    try {
      for (const file of parsedFiles) {
        const extracted = file.result?.extracted
        if (!extracted) continue
        const txns = extracted.transactions ?? []

        const res = await fetch("/api/statements/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: activeProfileId,
            familyId: activeFamilyId,
            accountId: null,
            month: extracted.month ?? month,
            statementType: extracted.docType === "cc_statement" ? "cc" : "bank",
            transactions: txns.map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (t: any, i: number) => ({
                date: t.date,
                valueDate: t.valueDate,
                description: t.description,
                amount: t.amount,
                balance: t.balance,
                txnType: t.txnType,
                categoryId: file.categoryOverrides.get(i) ?? null,
                foreignCurrency: t.foreignCurrency,
                excludeFromSpending: t.excludeFromSpending ?? false,
                rawText: t.rawText,
              })
            ),
            openingBalance: extracted.openingBalance,
            closingBalance: extracted.closingBalance,
          }),
        })

        if (!res.ok) {
          const json = await res.json()
          toast.error(
            `Failed to save ${file.fileName}: ${json.error || "Unknown error"}`
          )
          continue
        }

        const json = await res.json()
        totalSaved += json.saved
      }

      if (totalSaved > 0) {
        toast.success(`Imported ${totalSaved} transactions`)
      }
      setShowPreview(false)
      setParsedFiles([])
      triggerRefresh()
      onImportComplete()
    } catch {
      toast.error("Failed to save transactions")
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthYearPicker value={month} onChange={(v) => setMonth(v ?? month)} />
        <ButtonSelect
          value={statementType}
          onValueChange={setStatementType}
          options={STATEMENT_TYPE_OPTIONS}
        />
        {householdId && (
          <CategoryManagerButton
            householdId={householdId}
            onCategoriesChanged={() => triggerRefresh()}
          />
        )}
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
          categoryRules={initialData.categoryRules}
          onSaved={() => triggerRefresh()}
        />
      )}

      {/* Import Preview Dialog */}
      <ImportPreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        parsedFiles={parsedFiles}
        categories={categories}
        onCategoryOverride={handleCategoryOverride}
        onConfirm={handleConfirmImport}
        onRemoveFile={handleRemoveFile}
      />
    </div>
  )
}
